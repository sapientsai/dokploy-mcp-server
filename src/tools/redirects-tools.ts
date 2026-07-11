import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployRedirect } from "../types"
import { formatRedirect } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["create", "update", "remove", "get"] as const

type RedirectArgs = {
  action: (typeof ACTIONS)[number]
  redirectId?: string
  regex?: string
  replacement?: string
  permanent?: boolean
  applicationId?: string
}

export function buildRedirectsProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: RedirectArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("create", () =>
      client
        .post<DokployRedirect>("redirects.create", {
          regex: args.regex!,
          replacement: args.replacement!,
          permanent: args.permanent ?? false,
          applicationId: args.applicationId!,
        })
        .map((r) => `# Redirect Created\n\n${formatRedirect(r)}`),
    )
    .case("update", () =>
      client
        .post<unknown>("redirects.update", {
          redirectId: args.redirectId!,
          regex: args.regex!,
          replacement: args.replacement!,
          permanent: args.permanent ?? false,
        } satisfies RequestBody<"redirects-update">)
        .map(() => `Redirect ${args.redirectId} updated.`),
    )
    .case("remove", () =>
      client
        .post<unknown>("redirects.delete", { redirectId: args.redirectId! } satisfies RequestBody<"redirects-delete">)
        .map(() => `Redirect ${args.redirectId} removed.`),
    )
    .case("get", () =>
      client
        .get<DokployRedirect>("redirects.one", { redirectId: args.redirectId! })
        .map((r) => `# Redirect Details\n\n${formatRedirect(r)}`),
    )
    .exhaustive()
}

export function registerRedirectsTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_redirects",
    description:
      "Manage URL redirect rules on an application (Traefik regex/replacement). create: regex+replacement+permanent+applicationId. update: redirectId+regex+replacement+permanent. remove: redirectId. get: redirectId. A redeploy of the application is required for changes to take effect.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      redirectId: z.string().optional(),
      regex: z.string().optional().describe("Traefik-compatible source regex (e.g. ^https?://old.example.com/(.*))"),
      replacement: z.string().optional().describe("Target URL template (e.g. https://new.example.com/$${1})"),
      permanent: z.boolean().optional().describe("true = 301, false = 302"),
      applicationId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildRedirectsProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
