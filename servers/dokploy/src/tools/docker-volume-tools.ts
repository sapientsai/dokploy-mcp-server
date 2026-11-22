import type { Option } from "functype"
import { IO, Match, None, Some } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, ValidationError } from "../client/errors"
import { jsonSection } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = [
  "getVolumes",
  "getVolumesSize",
  "getVolumeConfig",
  "removeVolume",
  "listVolumeFiles",
  "readVolumeFile",
  "writeVolumeFile",
  "deleteVolumeFile",
] as const

/** Matches the readContainerFile cap in docker-tools — volume files are equally unbounded. */
const MAX_FILE_CHARS = 100_000

type VolumeArgs = {
  action: (typeof ACTIONS)[number]
  volumeName?: string
  path?: string
  content?: string
  serverId?: string
}

function volumeNameError(args: VolumeArgs): Option<ApiError> {
  if (!args.volumeName) return Some(ValidationError(`${args.action} requires volumeName`))
  return None()
}

function fileArgsError(args: VolumeArgs, needsContent: boolean): Option<ApiError> {
  const missingName = volumeNameError(args)
  if (missingName.isSome()) return missingName
  if (!args.path) return Some(ValidationError(`${args.action} requires path (path inside the volume)`))
  if (needsContent && args.content === undefined) return Some(ValidationError("writeVolumeFile requires content"))
  return None()
}

function fileParams(args: VolumeArgs): Record<string, string> {
  const params: Record<string, string> = { volumeName: args.volumeName!, path: args.path! }
  if (args.serverId) params.serverId = args.serverId
  return params
}

function scopedParams(args: VolumeArgs, withName: boolean): Record<string, string> {
  const params: Record<string, string> = withName ? { volumeName: args.volumeName! } : {}
  if (args.serverId) params.serverId = args.serverId
  return params
}

export function buildDockerVolumeProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: VolumeArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("getVolumes", () =>
      client
        .get<unknown>("dockerVolume.getVolumes", scopedParams(args, false))
        .map((volumes) => jsonSection("Docker Volumes", volumes, "No volumes found.")),
    )
    .case("getVolumesSize", () =>
      client
        .get<unknown>("dockerVolume.getVolumesSize", scopedParams(args, false))
        .map((sizes) => jsonSection("Volume Sizes", sizes, "No volume size data available.")),
    )
    .case("getVolumeConfig", () => {
      const invalid = volumeNameError(args)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("dockerVolume.getVolumeConfig", scopedParams(args, true))
        .map((config) =>
          jsonSection(`Volume ${args.volumeName}`, config, `Volume ${args.volumeName} not found on this server.`),
        )
    })
    .case("removeVolume", () => {
      const invalid = volumeNameError(args)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dockerVolume.removeVolume", scopedParams(args, true))
        .map(() => `Volume ${args.volumeName} removed. Its data is gone unless a backup exists.`)
    })
    .case("listVolumeFiles", () => {
      const invalid = fileArgsError(args, false)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .get<unknown>("dockerVolume.listVolumeFiles", fileParams(args))
        .map((listing) => jsonSection(`Files in ${args.volumeName}:${args.path}`, listing, "(empty directory)"))
    })
    .case("readVolumeFile", () => {
      const invalid = fileArgsError(args, false)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client.get<string>("dockerVolume.readVolumeFile", fileParams(args)).map((body) => {
        const text = typeof body === "string" ? body : JSON.stringify(body, null, 2)
        if (!text) return "(empty file)"
        if (text.length <= MAX_FILE_CHARS) return text
        return `${text.slice(0, MAX_FILE_CHARS)}\n\n[truncated: file is ${text.length} chars, showing first ${MAX_FILE_CHARS}]`
      })
    })
    .case("writeVolumeFile", () => {
      const invalid = fileArgsError(args, true)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dockerVolume.writeVolumeFile", { ...fileParams(args), content: args.content! })
        .map(() => `Wrote ${args.content!.length} chars to ${args.volumeName}:${args.path}.`)
    })
    .case("deleteVolumeFile", () => {
      const invalid = fileArgsError(args, false)
      if (invalid.isSome()) return IO.fail<ApiError>(invalid.value)
      return client
        .post<unknown>("dockerVolume.deleteVolumeFile", fileParams(args))
        .map(() => `Deleted ${args.volumeName}:${args.path}.`)
    })
    .exhaustive()
}

export function registerDockerVolumeTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_docker_volume",
    description:
      "Docker volume management and volume file access. Every action accepts an optional serverId. getVolumes: list volumes. getVolumesSize: per-volume disk usage. getVolumeConfig: volumeName — raw Docker inspect for one volume. removeVolume: volumeName — destroys the volume and its data; take a dokploy_volume_backup first. Files (volumeName + path, writeVolumeFile also content): listVolumeFiles, readVolumeFile (truncated at 100k chars), writeVolumeFile, deleteVolumeFile. Unlike writes into a running container (dokploy_docker writeContainerFile), volume writes survive redeploys. For scheduled backups of these volumes see dokploy_volume_backup.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      volumeName: z.string().optional(),
      path: z.string().min(1).max(4096).optional().describe("Path inside the volume, for the file actions"),
      content: z.string().optional().describe("writeVolumeFile: full new file contents"),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildDockerVolumeProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
