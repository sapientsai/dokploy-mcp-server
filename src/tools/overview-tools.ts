import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import { jsonSection } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["services", "backups", "domains"] as const

type OverviewArgs = {
  action: (typeof ACTIONS)[number]
}

export function buildOverviewProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: OverviewArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("services", () =>
      client
        .get<unknown>("overview.services")
        .map((services) => jsonSection("Services Overview", services, "No services found across any project.")),
    )
    .case("backups", () =>
      client
        .get<unknown>("overview.backups")
        .map((backups) => jsonSection("Backups Overview", backups, "No backups configured across any project.")),
    )
    .case("domains", () =>
      client
        .get<unknown>("overview.domains")
        .map((domains) => jsonSection("Domains Overview", domains, "No domains configured across any project.")),
    )
    .exhaustive()
}

export function registerOverviewTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_overview",
    description:
      "Read-only fleet-wide rollups that span every project, for orientation before drilling into a specific resource. No parameters. services: every application, compose service and database with its status. backups: every configured backup and its schedule. domains: every domain and what it points at. Use these first when asked a 'what is running / what is exposed / what is backed up' question, then use dokploy_application, dokploy_domain or dokploy_backup for detail and for changes.",
    parameters: z.object({
      action: z.enum(ACTIONS),
    }),
    execute: async (args) => {
      const either = await buildOverviewProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
