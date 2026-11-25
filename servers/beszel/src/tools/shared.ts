import { IO } from "functype"
import { UserError } from "somamcp"
import { z } from "zod"

import type { BeszelClient } from "../client/beszel-client"
import { getClient } from "../client/beszel-client"
import { toUserError } from "../errors"
import type { SystemRecord } from "../types"
import { RANGES } from "../utils/ranges"

export const systemParam = z
  .string()
  .min(1)
  .describe("A system's name as Beszel shows it, or its record id. list_systems shows both.")

export const rangeParam = z
  .enum(RANGES)
  .default("24h")
  .describe("How far back to look: 1h, 12h, 24h (default), 7d or 30d.")

export const withClient = <T>(use: (client: BeszelClient) => IO<never, Error, T>): Promise<T> =>
  IO.fromEither(getClient().toEither(new Error("Beszel client not initialized. Is BESZEL_URL set?")))
    .flatMap(use)
    .mapError(toUserError)
    .runOrThrow()

export const listSystems = (client: BeszelClient): IO<never, Error, ReadonlyArray<SystemRecord>> =>
  client.listAll<SystemRecord>("systems", { sort: "name" })

/** Finds one system by id, or by name ignoring case. A name two systems share is refused, with both listed. */
export const pickSystem = (systems: ReadonlyArray<SystemRecord>, nameOrId: string): IO<never, Error, SystemRecord> => {
  const wanted = nameOrId.trim()
  const byId = systems.find((s) => s.id === wanted)
  if (byId !== undefined) return IO.succeed(byId)
  const byName = systems.filter((s) => s.name.toLowerCase() === wanted.toLowerCase())
  const [first] = byName
  if (byName.length === 1) return IO.succeed(first)
  if (byName.length > 1) {
    return IO.fail(
      new UserError(
        `${byName.length} systems are named "${wanted}": ${byName.map((s) => s.id).join(", ")}. Pass one of those ids instead.`,
      ),
    )
  }
  const names = systems.map((s) => s.name).join(", ")
  return IO.fail(
    new UserError(`No system "${wanted}" is visible to this Beszel user.`, {
      suggestions: [systems.length === 0 ? "This user can see no systems at all." : `Systems it can see: ${names}`],
    }),
  )
}

export const resolveSystem = (client: BeszelClient, nameOrId: string): IO<never, Error, SystemRecord> =>
  listSystems(client).flatMap((systems) => pickSystem(systems, nameOrId))

/** Each system's name by id, for tools that list records across systems. */
export const systemNames = (systems: ReadonlyArray<SystemRecord>): ReadonlyMap<string, string> =>
  new Map(systems.map((s) => [s.id, s.name]))

export const nameOf = (names: ReadonlyMap<string, string>, id: string): string => names.get(id) ?? id
