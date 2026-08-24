import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, ValidationError } from "../client/errors"
import { jsonSection } from "./tool-utils"
import type { ToolServer } from "./types"

const ACTIONS = ["getImages", "getImageConfig", "removeImage"] as const

type ImageArgs = {
  action: (typeof ACTIONS)[number]
  imageRef?: string
  repository?: string
  tag?: string
  id?: string
  force?: boolean
  serverId?: string
}

export function buildDockerImageProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: ImageArgs,
): IO<never, ApiError, string> {
  return Match(args.action)
    .case("getImages", () => {
      const params: Record<string, string> = {}
      if (args.serverId) params.serverId = args.serverId
      return client
        .get<unknown>("dockerImage.getImages", params)
        .map((images) => jsonSection("Docker Images", images, "No images found."))
    })
    .case("getImageConfig", () => {
      if (!args.imageRef) {
        return IO.fail<ApiError>(
          ValidationError("getImageConfig requires imageRef (e.g. 'nginx:latest' or an image ID)"),
        )
      }
      const params: Record<string, string> = { imageRef: args.imageRef }
      if (args.serverId) params.serverId = args.serverId
      return client
        .get<unknown>("dockerImage.getImageConfig", params)
        .map((config) => jsonSection(`Image ${args.imageRef}`, config, `Image ${args.imageRef} not found.`))
    })
    .case("removeImage", () => {
      // The API requires all three of repository, tag and id — a partial body is
      // rejected, so fail here with a message that names what is missing rather
      // than surfacing a generic 400.
      const missing = (["repository", "tag", "id"] as const).filter((k) => !args[k])
      if (missing.length > 0) {
        return IO.fail<ApiError>(
          ValidationError(
            `removeImage requires repository, tag and id (missing: ${missing.join(", ")}). Run getImages to read all three off the image you want to remove.`,
          ),
        )
      }
      const body: Record<string, unknown> = {
        repository: args.repository!,
        tag: args.tag!,
        id: args.id!,
      }
      if (args.force !== undefined) body.force = args.force
      if (args.serverId) body.serverId = args.serverId
      return client
        .post<unknown>("dockerImage.removeImage", body)
        .map(() => `Image ${args.repository}:${args.tag} (${args.id}) removed.`)
    })
    .exhaustive()
}

export function registerDockerImageTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_docker_image",
    description:
      "Docker image inventory. getImages: list images, serverId?. getImageConfig: imageRef ('nginx:latest' or an image ID), serverId?. removeImage: requires ALL THREE of repository, tag and id — read them off getImages — plus force? and serverId?. For overall disk usage and build cache see dokploy_docker getDiskUsage / getBuildCache / pruneBuildCache.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      imageRef: z.string().optional().describe("getImageConfig: image reference or ID"),
      repository: z.string().optional().describe("removeImage: image repository, e.g. 'nginx'"),
      tag: z.string().optional().describe("removeImage: image tag, e.g. 'latest'"),
      id: z.string().optional().describe("removeImage: image ID from getImages"),
      force: z.boolean().optional().describe("removeImage: remove even when containers reference the image"),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildDockerImageProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
