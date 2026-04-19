import type { IO as IOType } from "functype"
import { IO, Match } from "functype"
import { z } from "zod"

import type { DokployClient } from "../client/dokploy-client"
import { getDokployClient, getOrganizationId } from "../client/dokploy-client"
import type { ApiError } from "../client/errors"
import { formatApiError, NetworkError } from "../client/errors"
import type { RequestBody } from "../generated"
import type { DokployCertificate, DokployPort, DokploySecurity } from "../types"
import type { ToolServer } from "./types"

const ACTIONS = [
  "createPort",
  "deletePort",
  "createAuth",
  "deleteAuth",
  "listCerts",
  "getCert",
  "createCert",
  "removeCert",
] as const

type InfraArgs = {
  action: (typeof ACTIONS)[number]
  applicationId?: string
  publishedPort?: number
  targetPort?: number
  protocol?: string
  publishMode?: string
  portId?: string
  username?: string
  password?: string
  securityId?: string
  certificateId?: string
  name?: string
  certificateData?: string
  privateKey?: string
  autoRenew?: boolean
  serverId?: string
}

function resolveOrganizationIdIO(resolve: () => Promise<string>): IOType<never, ApiError, string> {
  return IO.tryPromise({
    try: resolve,
    catch: (cause): ApiError => NetworkError("GET", "organizationId", cause),
  })
}

export function buildInfrastructureProgram(
  client: Pick<DokployClient, "get" | "post">,
  args: InfraArgs,
  resolveOrganizationId: () => Promise<string> = getOrganizationId,
): IOType<never, ApiError, string> {
  return Match(args.action)
    .case("createPort", () =>
      client
        .post<DokployPort>("port.create", {
          applicationId: args.applicationId!,
          publishedPort: args.publishedPort!,
          targetPort: args.targetPort!,
          ...(args.protocol && { protocol: args.protocol }),
          ...(args.publishMode && { publishMode: args.publishMode }),
        })
        .map((port) => `Port mapping created: ${port.publishedPort} -> ${port.targetPort} (ID: ${port.portId})`),
    )
    .case("deletePort", () =>
      client
        .post<unknown>("port.delete", { portId: args.portId! } satisfies RequestBody<"port-delete">)
        .map(() => `Port mapping ${args.portId} deleted.`),
    )
    .case("createAuth", () =>
      client
        .post<DokploySecurity>("security.create", {
          applicationId: args.applicationId!,
          username: args.username!,
          password: args.password!,
        })
        .map((security) => `Basic auth created for application ${args.applicationId} (ID: ${security.securityId})`),
    )
    .case("deleteAuth", () =>
      client
        .post<unknown>("security.delete", {
          securityId: args.securityId!,
        } satisfies RequestBody<"security-delete">)
        .map(() => `Security credentials ${args.securityId} deleted.`),
    )
    .case("listCerts", () =>
      client.get<DokployCertificate[]>("certificates.all").map((certs) => {
        if (certs.length === 0) return "No certificates found."
        const lines = certs.map((c) => `- **${c.name}** (ID: ${c.certificateId}) | Auto-renew: ${c.autoRenew ?? "N/A"}`)
        return `# Certificates (${certs.length})\n\n${lines.join("\n")}`
      }),
    )
    .case("getCert", () =>
      client
        .get<DokployCertificate>("certificates.one", { certificateId: args.certificateId! })
        .map(
          (cert) =>
            `# Certificate: ${cert.name}\n\n- ID: ${cert.certificateId}\n- Auto-renew: ${cert.autoRenew ?? "N/A"}`,
        ),
    )
    .case("createCert", () =>
      resolveOrganizationIdIO(resolveOrganizationId).flatMap((organizationId) => {
        const body: Record<string, unknown> = {
          name: args.name!,
          certificateData: args.certificateData!,
          privateKey: args.privateKey!,
          organizationId,
        }
        if (args.autoRenew !== undefined) body.autoRenew = args.autoRenew
        if (args.serverId) body.serverId = args.serverId
        return client
          .post<DokployCertificate>("certificates.create", body)
          .map((cert) => `Certificate "${cert.name}" created (ID: ${cert.certificateId}).`)
      }),
    )
    .case("removeCert", () =>
      client
        .post<unknown>("certificates.remove", {
          certificateId: args.certificateId!,
        } satisfies RequestBody<"certificates-remove">)
        .map(() => `Certificate ${args.certificateId} removed.`),
    )
    .exhaustive() as IOType<never, ApiError, string>
}

export function registerInfrastructureTools(server: ToolServer) {
  server.addTool({
    name: "dokploy_infrastructure",
    description:
      "Manage ports, auth, certs. createPort: applicationId+publishedPort+targetPort. deletePort: portId. createAuth: applicationId+username+password. deleteAuth: securityId. listCerts: all. getCert: certificateId. createCert: name+certificateData+privateKey. removeCert: certificateId.",
    parameters: z.object({
      action: z.enum(ACTIONS),
      applicationId: z.string().optional(),
      publishedPort: z.number().optional(),
      targetPort: z.number().optional(),
      protocol: z.string().optional(),
      publishMode: z.string().optional(),
      portId: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      securityId: z.string().optional(),
      certificateId: z.string().optional(),
      name: z.string().optional(),
      certificateData: z.string().optional().describe("PEM format"),
      privateKey: z.string().optional().describe("PEM format"),
      autoRenew: z.boolean().optional(),
      serverId: z.string().optional(),
    }),
    execute: async (args) => {
      const either = await buildInfrastructureProgram(getDokployClient(), args).run()
      if (either.isRight()) return either.value
      // eslint-disable-next-line functype/prefer-either -- intentional boundary throw for SomaMCP error classification.
      throw new Error(formatApiError(either.value))
    },
  })
}
