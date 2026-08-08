import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployVolumeBackup, VolumeBackupServiceType } from "../types"
import { MOUNT_SERVICE_TYPES } from "../types"
import { formatVolumeBackup, formatVolumeBackupList } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "update", "remove", "get", "list", "runManually"] as const

// Mirrors the API constraint on volumeBackups.create / volumeBackups.update volumeName.
const VOLUME_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

const VOLUME_BACKUP_OPTIONAL_FIELDS = [
  "serviceType",
  "appName",
  "serviceName",
  "turnOff",
  "keepLatestCount",
  "enabled",
  "applicationId",
  "postgresId",
  "mariadbId",
  "mongoId",
  "mysqlId",
  "redisId",
  "libsqlId",
  "composeId",
] as const

type VolumeBackupArgs = {
  action: (typeof ACTIONS)[number]
  volumeBackupId?: string
  name?: string
  volumeName?: string
  prefix?: string
  cronExpression?: string
  destinationId?: string
  serviceType?: VolumeBackupServiceType
  appName?: string
  serviceName?: string
  turnOff?: boolean
  keepLatestCount?: number
  enabled?: boolean
  applicationId?: string
  postgresId?: string
  mariadbId?: string
  mongoId?: string
  mysqlId?: string
  redisId?: string
  libsqlId?: string
  composeId?: string
  id?: string
  volumeBackupType?: VolumeBackupServiceType
}

export function buildVolumeBackupProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: VolumeBackupArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployVolumeBackup>("volumeBackups.create", {
          name: args.name!,
          volumeName: args.volumeName!,
          prefix: args.prefix!,
          cronExpression: args.cronExpression!,
          destinationId: args.destinationId!,
          ...pickDefined(args, VOLUME_BACKUP_OPTIONAL_FIELDS),
        })
        .map((b) => `# Volume Backup Created\n\n${formatVolumeBackup(b)}`),
    )
    .case("update", () =>
      client
        .post<unknown>("volumeBackups.update", {
          volumeBackupId: args.volumeBackupId!,
          name: args.name!,
          volumeName: args.volumeName!,
          prefix: args.prefix!,
          cronExpression: args.cronExpression!,
          destinationId: args.destinationId!,
          ...pickDefined(args, VOLUME_BACKUP_OPTIONAL_FIELDS),
        })
        .map(() => `Volume backup ${args.volumeBackupId} updated.`),
    )
    .case("remove", () =>
      client
        .post<unknown>("volumeBackups.delete", {
          volumeBackupId: args.volumeBackupId!,
        } satisfies RequestBody<"volumeBackups-delete">)
        .map(() => `Volume backup ${args.volumeBackupId} removed.`),
    )
    .case("get", () =>
      client
        .get<DokployVolumeBackup>("volumeBackups.one", { volumeBackupId: args.volumeBackupId! })
        .map((b) => `# Volume Backup Details\n\n${formatVolumeBackup(b)}`),
    )
    .case("list", () =>
      client
        .get<DokployVolumeBackup[]>("volumeBackups.list", {
          id: args.id!,
          volumeBackupType: args.volumeBackupType!,
        })
        .map(formatVolumeBackupList),
    )
    .case("runManually", () =>
      client
        .post<unknown>("volumeBackups.runManually", {
          volumeBackupId: args.volumeBackupId!,
        } satisfies RequestBody<"volumeBackups-runManually">)
        .map(() => `Volume backup ${args.volumeBackupId} triggered.`),
    )
    .exhaustive()
}

export function registerVolumeBackupTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_volume_backup",
    description:
      "Manage scheduled volume-level backups (rclone-based). Distinct from dokploy_backup, which does DB-native dumps. create: name+volumeName+prefix+cronExpression+destinationId (+serviceType and matching *Id, +appName, +turnOff to stop service during backup, +keepLatestCount, +enabled). update: volumeBackupId + all fields. remove/get: volumeBackupId. list: id (parent service id) + volumeBackupType (application|postgres|mysql|mariadb|mongo|redis|compose|libsql). runManually: volumeBackupId (trigger immediately).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      volumeBackupId: z.string().optional(),
      name: z.string().optional(),
      volumeName: z
        .string()
        .regex(VOLUME_NAME_PATTERN, "Must start with a letter or digit, then letters, digits, _, . or - only")
        .optional()
        .describe("Docker volume name to snapshot"),
      prefix: z.string().optional().describe("Object key prefix on the destination"),
      cronExpression: z.string().optional(),
      destinationId: z.string().optional(),
      serviceType: z.enum(MOUNT_SERVICE_TYPES).optional(),
      appName: z.string().optional(),
      serviceName: z.string().optional(),
      turnOff: z.boolean().optional().describe("Stop the service during the backup window"),
      keepLatestCount: z.number().int().min(1).optional(),
      enabled: z.boolean().optional(),
      applicationId: z.string().optional(),
      postgresId: z.string().optional(),
      mariadbId: z.string().optional(),
      mongoId: z.string().optional(),
      mysqlId: z.string().optional(),
      redisId: z.string().optional(),
      libsqlId: z.string().optional(),
      composeId: z.string().optional(),
      id: z.string().optional().describe("Parent service id for list"),
      volumeBackupType: z.enum(MOUNT_SERVICE_TYPES).optional().describe("Service type for list"),
    }),
    execute: async (args) => {
      const either = await buildVolumeBackupProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
