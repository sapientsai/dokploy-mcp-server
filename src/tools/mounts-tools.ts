import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployMount } from "../types"
import { MOUNT_SERVICE_TYPES, MOUNT_TYPES } from "../types"
import { formatMount, formatMountList } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "update", "remove", "get", "listByServiceId", "allNamedByApplicationId"] as const

const MOUNT_CREATE_OPTIONAL_FIELDS = ["hostPath", "volumeName", "filePath", "content"] as const

const MOUNT_UPDATE_OPTIONAL_FIELDS = [
  "type",
  "hostPath",
  "volumeName",
  "filePath",
  "content",
  "serviceType",
  "mountPath",
  "applicationId",
  "composeId",
  "libsqlId",
  "mariadbId",
  "mongoId",
  "mysqlId",
  "postgresId",
  "redisId",
] as const

type MountArgs = {
  action: (typeof ACTIONS)[number]
  mountId?: string
  type?: (typeof MOUNT_TYPES)[number]
  mountPath?: string
  hostPath?: string | null
  volumeName?: string | null
  filePath?: string | null
  content?: string | null
  serviceType?: (typeof MOUNT_SERVICE_TYPES)[number]
  serviceId?: string
  applicationId?: string | null
  composeId?: string | null
  libsqlId?: string | null
  mariadbId?: string | null
  mongoId?: string | null
  mysqlId?: string | null
  postgresId?: string | null
  redisId?: string | null
}

export function buildMountProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: MountArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployMount>("mounts.create", {
          type: args.type!,
          mountPath: args.mountPath!,
          serviceId: args.serviceId!,
          ...(args.serviceType && { serviceType: args.serviceType }),
          ...pickDefined(args, MOUNT_CREATE_OPTIONAL_FIELDS),
        })
        .map((mount) => `# Mount Created\n\n${formatMount(mount)}`),
    )
    .case("update", () =>
      client
        .post<unknown>("mounts.update", {
          mountId: args.mountId!,
          ...pickDefined(args, MOUNT_UPDATE_OPTIONAL_FIELDS),
        })
        .map(() => `Mount ${args.mountId} updated.`),
    )
    .case("remove", () =>
      client
        .post<unknown>("mounts.remove", { mountId: args.mountId! } satisfies RequestBody<"mounts-remove">)
        .map(() => `Mount ${args.mountId} removed.`),
    )
    .case("get", () =>
      client
        .get<DokployMount>("mounts.one", { mountId: args.mountId! })
        .map((mount) => `# Mount Details\n\n${formatMount(mount)}`),
    )
    .case("listByServiceId", () =>
      client
        .get<DokployMount[]>("mounts.listByServiceId", {
          serviceType: args.serviceType!,
          serviceId: args.serviceId!,
        })
        .map(formatMountList),
    )
    .case("allNamedByApplicationId", () =>
      client
        .get<DokployMount[]>("mounts.allNamedByApplicationId", { applicationId: args.applicationId! })
        .map(formatMountList),
    )
    .exhaustive()
}

export function registerMountsTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_mounts",
    description:
      "Manage mounts (volumes, bind mounts, files) attached to services. Mount changes require a redeploy of the parent service to take effect. create: type+mountPath+serviceId+serviceType (+volumeName for volume, +hostPath for bind, +filePath+content for file). update: mountId (+any field). remove: mountId. get: mountId. listByServiceId: serviceType+serviceId. allNamedByApplicationId: applicationId (named volumes only). serviceType: application|postgres|mysql|mariadb|mongo|redis|compose|libsql.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      mountId: z.string().optional(),
      type: z.enum(MOUNT_TYPES).optional().describe("bind | volume | file"),
      mountPath: z.string().optional().describe("Path inside the container"),
      hostPath: z.string().nullable().optional().describe("Required for type=bind"),
      volumeName: z.string().nullable().optional().describe("Required for type=volume"),
      filePath: z.string().nullable().optional().describe("Required for type=file"),
      content: z.string().nullable().optional().describe("File contents for type=file"),
      serviceType: z.enum(MOUNT_SERVICE_TYPES).optional(),
      serviceId: z.string().optional().describe("ID of the service the mount attaches to"),
      applicationId: z.string().nullable().optional(),
      composeId: z.string().nullable().optional(),
      libsqlId: z.string().nullable().optional(),
      mariadbId: z.string().nullable().optional(),
      mongoId: z.string().nullable().optional(),
      mysqlId: z.string().nullable().optional(),
      postgresId: z.string().nullable().optional(),
      redisId: z.string().nullable().optional(),
    }),
    execute: async (args) => {
      const either = await buildMountProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
