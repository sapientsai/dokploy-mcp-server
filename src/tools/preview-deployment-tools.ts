import type { IO } from "functype"
import { Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployPreviewDeployment } from "../types"
import { formatPreviewDeployment, formatPreviewDeploymentList } from "../utils/formatters"
import type { ToolServer } from "./types"

const ACTIONS = ["list", "get", "remove", "redeploy"] as const

type PreviewArgs = {
  action: (typeof ACTIONS)[number]
  previewDeploymentId?: string
  applicationId?: string
  title?: string
  description?: string
}

export function buildPreviewDeploymentProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: PreviewArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("list", () =>
      client
        .get<DokployPreviewDeployment[]>("previewDeployment.all", { applicationId: args.applicationId! })
        .map(formatPreviewDeploymentList),
    )
    .case("get", () =>
      client
        .get<DokployPreviewDeployment>("previewDeployment.one", { previewDeploymentId: args.previewDeploymentId! })
        .map((p) => `# Preview Deployment\n\n${formatPreviewDeployment(p)}`),
    )
    .case("remove", () =>
      client
        .post<unknown>("previewDeployment.delete", {
          previewDeploymentId: args.previewDeploymentId!,
        } satisfies RequestBody<"previewDeployment-delete">)
        .map(() => `Preview deployment ${args.previewDeploymentId} removed.`),
    )
    .case("redeploy", () =>
      client
        .post<unknown>("previewDeployment.redeploy", {
          previewDeploymentId: args.previewDeploymentId!,
          ...(args.title && { title: args.title }),
          ...(args.description && { description: args.description }),
        })
        .map(() => `Preview deployment ${args.previewDeploymentId} redeployed.`),
    )
    .exhaustive()
}

export function registerPreviewDeploymentTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_preview_deployment",
    description:
      "Manage preview deployments (per-PR / per-branch deploys off a parent application). list: applicationId. get: previewDeploymentId. remove: previewDeploymentId. redeploy: previewDeploymentId (+title?, +description? for the deploy record).",
    parameters: z.object({
      action: z.enum(ACTIONS),
      previewDeploymentId: z.string().optional(),
      applicationId: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildPreviewDeploymentProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
