import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokploySchedule } from "../types"
import { SCHEDULE_TYPES } from "../types"
import { formatSchedule, formatScheduleList } from "../utils/formatters"
import { pickDefined } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "update", "remove", "get", "list", "runManually"] as const

const SHELL_TYPES = ["bash", "sh"] as const

const SCHEDULE_OPTIONAL_FIELDS = [
  "description",
  "appName",
  "serviceName",
  "shellType",
  "scheduleType",
  "script",
  "applicationId",
  "composeId",
  "serverId",
  "enabled",
  "timezone",
] as const

type ScheduleArgs = {
  action: (typeof ACTIONS)[number]
  scheduleId?: string
  name?: string
  description?: string
  cronExpression?: string
  command?: string
  script?: string
  appName?: string
  serviceName?: string
  shellType?: (typeof SHELL_TYPES)[number]
  scheduleType?: (typeof SCHEDULE_TYPES)[number]
  applicationId?: string
  composeId?: string
  serverId?: string
  enabled?: boolean
  timezone?: string
  id?: string
}

export function buildScheduleProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: ScheduleArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokploySchedule>("schedule.create", {
          name: args.name!,
          cronExpression: args.cronExpression!,
          command: args.command!,
          ...pickDefined(args, SCHEDULE_OPTIONAL_FIELDS),
        })
        .map((s) => `# Schedule Created\n\n${formatSchedule(s)}`),
    )
    .case("update", () =>
      client
        .post<unknown>("schedule.update", {
          scheduleId: args.scheduleId!,
          name: args.name!,
          cronExpression: args.cronExpression!,
          command: args.command!,
          ...pickDefined(args, SCHEDULE_OPTIONAL_FIELDS),
        })
        .map(() => `Schedule ${args.scheduleId} updated.`),
    )
    .case("remove", () =>
      client
        .post<unknown>("schedule.delete", { scheduleId: args.scheduleId! } satisfies RequestBody<"schedule-delete">)
        .map(() => `Schedule ${args.scheduleId} removed.`),
    )
    .case("get", () =>
      client
        .get<DokploySchedule>("schedule.one", { scheduleId: args.scheduleId! })
        .map((s) => `# Schedule Details\n\n${formatSchedule(s)}`),
    )
    .case("list", () =>
      client
        .get<DokploySchedule[]>("schedule.list", {
          id: args.id!,
          scheduleType: args.scheduleType!,
        })
        .map(formatScheduleList),
    )
    .case("runManually", () =>
      client
        .post<unknown>("schedule.runManually", {
          scheduleId: args.scheduleId!,
        } satisfies RequestBody<"schedule-runManually">)
        .map(() => `Schedule ${args.scheduleId} triggered.`),
    )
    .exhaustive()
}

export function registerScheduleTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_schedule",
    description:
      "Manage cron schedules that run commands against applications, compose services, or servers. create: name+cronExpression+command (+ scheduleType and matching applicationId/composeId/serverId; shellType=bash|sh; script for multi-line; timezone). update: scheduleId + all fields. remove/get: scheduleId. list: id (parent id — applicationId|composeId|serverId|'dokploy-server') + scheduleType. runManually: scheduleId. scheduleType: application|compose|server|dokploy-server.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      scheduleId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      cronExpression: z.string().optional().describe("Standard cron expression (e.g. '0 3 * * *')"),
      command: z.string().optional().describe("Shell command to execute"),
      script: z.string().optional().describe("Optional multi-line script body"),
      appName: z.string().optional().describe("Container appName (for application/compose scope)"),
      serviceName: z.string().optional().describe("Compose service name when scheduleType=compose"),
      shellType: z.enum(SHELL_TYPES).optional(),
      scheduleType: z.enum(SCHEDULE_TYPES).optional(),
      applicationId: z.string().optional(),
      composeId: z.string().optional(),
      serverId: z.string().optional(),
      enabled: z.boolean().optional(),
      timezone: z.string().optional().describe("IANA timezone name (e.g. America/New_York)"),
      id: z.string().optional().describe("Parent resource id for list action"),
    }),
    execute: async (args) => {
      const either = await buildScheduleProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
