import { IO } from "functype"
import type { SomaServerInstance } from "somamcp"
import { UserError } from "somamcp"
import { z } from "zod"

import type { BeszelClient } from "../client/beszel-client"
import { equals } from "../client/filter"
import type { FingerprintRecord, SystemRecord } from "../types"
import { listSystems, pickSystem, systemParam, withClient } from "./shared"

/** The fields a system update reads back: never `info`, which the hub rewrites on every poll. */
const SYSTEM_FIELDS = "id,name,host,port,status"
/** `token` is deliberately absent: it's the agent's secret. */
const FINGERPRINT_FIELDS = "id,system,fingerprint"

type SystemChange = { readonly name?: string; readonly host?: string; readonly port?: string }

const label = (system: SystemRecord): string => `${system.name} (${system.id})`

const shown = (value: string | undefined): string => (value === undefined || value === "" ? "(empty)" : value)

/** The fields that differ from the system's current values. */
export const changesFor = (system: SystemRecord, wanted: SystemChange): SystemChange =>
  Object.fromEntries(
    (["name", "host", "port"] as const).flatMap((field) => {
      const value = wanted[field]
      return value === undefined || value === (system[field] ?? "") ? [] : [[field, value]]
    }),
  ) as SystemChange

/** Refuses a name another system already has, ignoring case: two systems with one name can't be told apart. */
const checkNameFree = (
  systems: ReadonlyArray<SystemRecord>,
  system: SystemRecord,
  name: string | undefined,
): IO<never, Error, void> => {
  const taken =
    name === undefined
      ? undefined
      : systems.find((s) => s.id !== system.id && s.name.toLowerCase() === name.toLowerCase())
  return taken === undefined
    ? IO.succeed(undefined)
    : IO.fail(
        new UserError(`Another system is already named "${taken.name}" (${taken.id}).`, {
          suggestions: ["Rename that one first, or pick another name."],
        }),
      )
}

export const formatUpdate = (before: SystemRecord, after: SystemRecord, reconnecting: boolean): string =>
  [
    `Updated ${label(before)}:`,
    ...(["name", "host", "port"] as const)
      .filter((field) => (before[field] ?? "") !== (after[field] ?? ""))
      .map((field) => `- ${field}: ${shown(before[field])} → ${shown(after[field])}`),
    ...(reconnecting
      ? ["", `Beszel connects to it again at the new address. Its status is ${after.status} until the agent answers.`]
      : []),
  ].join("\n")

const updateSystem = (client: BeszelClient, nameOrId: string, wanted: SystemChange): IO<never, Error, string> =>
  listSystems(client).flatMap((systems) =>
    pickSystem(systems, nameOrId).flatMap((system) => {
      const changes = changesFor(system, wanted)
      if (Object.keys(changes).length === 0) {
        return IO.succeed(`Nothing to change: ${label(system)} already has those values.`)
      }
      // Beszel's own edit dialog sets a moved system to pending, which makes the hub reconnect. A paused one stays paused.
      const reconnecting = (changes.host !== undefined || changes.port !== undefined) && system.status !== "paused"
      return checkNameFree(systems, system, changes.name)
        .flatMap(() =>
          client.update<SystemRecord>(
            "systems",
            system.id,
            reconnecting ? { ...changes, status: "pending" } : changes,
            SYSTEM_FIELDS,
          ),
        )
        .map((after) => formatUpdate(system, after, reconnecting))
    }),
  )

const setStatus = (client: BeszelClient, nameOrId: string, target: "paused" | "pending"): IO<never, Error, string> =>
  listSystems(client).flatMap((systems) =>
    pickSystem(systems, nameOrId).flatMap((system) => {
      if (target === "paused" && system.status === "paused") {
        return IO.succeed(`${label(system)} is already paused.`)
      }
      if (target === "pending" && system.status !== "paused") {
        return IO.succeed(`${label(system)} is ${system.status}, not paused, so there's nothing to resume.`)
      }
      return client
        .update<SystemRecord>("systems", system.id, { status: target }, SYSTEM_FIELDS)
        .map(() =>
          target === "paused"
            ? `Paused ${label(system)}. Beszel stops checking it, and won't alert on it, until resume_system.`
            : `Resumed ${label(system)}. Its status is pending until Beszel hears from its agent.`,
        )
    }),
  )

const resetFingerprint = (client: BeszelClient, nameOrId: string): IO<never, Error, string> =>
  listSystems(client).flatMap((systems) =>
    pickSystem(systems, nameOrId).flatMap((system) =>
      client
        .listAll<FingerprintRecord>("fingerprints", { filter: equals("system", system.id), fields: FINGERPRINT_FIELDS })
        .flatMap((records) => {
          if (records.length === 0) {
            return IO.fail<Error>(
              new UserError(`${label(system)} has no fingerprint record, so there's nothing to reset.`, {
                suggestions: ["Beszel keeps one for each system an agent connects to over WebSocket."],
              }),
            )
          }
          const stored = records.filter((r) => r.fingerprint !== "")
          if (stored.length === 0) {
            return IO.succeed(
              `${label(system)} has no stored fingerprint. The next agent that connects with its token claims it.`,
            )
          }
          return IO.forEach(stored, (r) =>
            client.update<FingerprintRecord>("fingerprints", r.id, { fingerprint: "" }, FINGERPRINT_FIELDS),
          ).map(() =>
            [
              `Cleared the stored fingerprint of ${label(system)}, and Beszel dropped its agent's connection.`,
              "",
              `The next agent that connects with ${system.name}'s token claims it. If the wrong machine still has that token, stop its agent or give it its own system first, or it claims ${system.name} again.`,
              "The token itself is unchanged. This server never reads it.",
            ].join("\n"),
          )
        }),
    ),
  )

const port = z
  .string()
  .trim()
  .regex(/^\d{1,5}$/, "A port is a number from 1 to 65535.")
  .refine((p) => Number(p) >= 1 && Number(p) <= 65_535, "A port is a number from 1 to 65535.")

/** Tools that change the hub. Registered only with BESZEL_ENABLE_WRITES=true. */
export function registerWriteTools(server: SomaServerInstance): void {
  server.addTool({
    name: "update_system",
    description:
      "Rename a system, or change the host or port Beszel uses to reach its agent. Give only the fields to change. Refuses a name another system already has. Changing the host or port makes Beszel reconnect.",
    parameters: z
      .object({
        system: systemParam,
        name: z.string().trim().min(1).max(200).optional().describe("The new name."),
        host: z.string().trim().min(1).max(255).optional().describe("The new host name or IP address."),
        port: port.optional().describe("The new agent port, e.g. 45876."),
      })
      .refine((a) => a.name !== undefined || a.host !== undefined || a.port !== undefined, {
        message: "Give at least one of name, host or port.",
      }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    execute: async (args) =>
      withClient((client) => updateSystem(client, args.system, { name: args.name, host: args.host, port: args.port })),
  })

  server.addTool({
    name: "pause_system",
    description:
      "Pause a system: Beszel stops checking it and won't alert on it until resume_system. Its history is kept.",
    parameters: z.object({ system: systemParam }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    execute: async (args) => withClient((client) => setStatus(client, args.system, "paused")),
  })

  server.addTool({
    name: "resume_system",
    description: "Resume a paused system, so Beszel checks it again.",
    parameters: z.object({ system: systemParam }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    execute: async (args) => withClient((client) => setStatus(client, args.system, "pending")),
  })

  server.addTool({
    name: "reset_system_fingerprint",
    description:
      "Clear the agent fingerprint Beszel stored for a system, as Beszel's Tokens & Fingerprints settings do. Beszel drops the agent's connection, and the next agent that connects with the system's token claims the system. Use it after reinstalling a machine, or when the wrong machine claimed a system and has since been given its own. The token is unchanged and never shown.",
    parameters: z.object({ system: systemParam }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    execute: async (args) => withClient((client) => resetFingerprint(client, args.system)),
  })
}
