import type {
  DatabaseType,
  DokployApplication,
  DokployBackup,
  DokployCompose,
  DokployContainer,
  DokployDatabase,
  DokployDeployment,
  DokployDestination,
  DokployDomain,
  DokployEnvironment,
  DokployProject,
  DokployRegistry,
  DokployServer,
  DokploySshKey,
} from "../types"
import { DB_ID_FIELDS, DB_TYPES } from "../types"

/**
 * Return `fallback` when the value is nullish OR an empty string. Used for display
 * fields where the Dokploy API returns `""` for missing values as often as it returns
 * `null` (e.g. project.description observed as `""` on `project.one` responses).
 */
function orElse(value: string | null | undefined, fallback: string): string {
  return value == null || value === "" ? fallback : value
}

function resolveDbId(db: DokployDatabase, dbType: DatabaseType): string {
  const idField = DB_ID_FIELDS[dbType] as keyof DokployDatabase
  return (db[idField] as string | undefined) ?? db.databaseId ?? "unknown"
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A"
  try {
    return new Date(dateStr)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, " UTC")
  } catch {
    return dateStr
  }
}

function statusIcon(status: string | undefined | null): string {
  if (!status) return "[UNKNOWN]"
  const s = status.toLowerCase()
  if (s === "running" || s === "done" || s === "idle") return "[RUNNING]"
  if (s === "error" || s === "failed") return "[ERROR]"
  if (s === "stopped") return "[STOPPED]"
  return `[${status.toUpperCase()}]`
}

function formatEnvironmentServices(env: DokployEnvironment): string {
  const lines: string[] = []

  if (env.applications?.length) {
    for (const app of env.applications) {
      lines.push(`    - App: **${app.name}** ${statusIcon(app.applicationStatus)} (ID: ${app.applicationId})`)
    }
  }
  if (env.compose?.length) {
    for (const c of env.compose) {
      lines.push(`    - Compose: **${c.name}** ${statusIcon(c.composeStatus)} (ID: ${c.composeId})`)
    }
  }
  for (const dbType of DB_TYPES) {
    const dbs = env[dbType]
    if (dbs?.length) {
      for (const db of dbs) {
        const name = db.name ?? dbType
        const id = resolveDbId(db, dbType)
        lines.push(`    - ${dbType}: **${name}** ${statusIcon(db.applicationStatus)} (ID: ${id})`)
      }
    }
  }

  return lines.join("\n")
}

export function formatProject(project: DokployProject): string {
  const envs = project.environments ?? []
  const envLines = envs.map((env) => {
    const services = formatEnvironmentServices(env)
    const header = `  - **${env.name}** (ID: ${env.environmentId})`
    return services ? `${header}\n${services}` : header
  })

  return `- **${project.name}** (ID: ${project.projectId})
  Description: ${orElse(project.description, "None")}
  Environments: ${envs.length}${envLines.length ? `\n${envLines.join("\n")}` : ""}
  Created: ${formatDate(project.createdAt)}`
}

export function formatProjectList(projects: DokployProject[]): string {
  if (projects.length === 0) return "No projects found."
  return `# Projects (${projects.length})\n\n${projects.map(formatProject).join("\n\n")}`
}

export function formatEnvironment(env: DokployEnvironment): string {
  const services = formatEnvironmentServices(env)
  // Dokploy's environment.byProjectId response omits projectId and createdAt on the nested
  // environment records, so both can legitimately be undefined at render time.
  return `- **${env.name}** (ID: ${env.environmentId})
  Description: ${orElse(env.description, "None")}
  Project: ${orElse(env.projectId, "N/A")}
  Created: ${formatDate(env.createdAt)}${services ? `\n${services}` : ""}`
}

export function formatEnvironmentList(envs: DokployEnvironment[]): string {
  if (envs.length === 0) return "No environments found."
  return `# Environments (${envs.length})\n\n${envs.map(formatEnvironment).join("\n\n")}`
}

export function formatApplication(app: DokployApplication): string {
  const gitSource = [
    app.repository && `  Repository: ${app.owner ? `${app.owner}/` : ""}${app.repository}`,
    app.branch && `  Branch: ${app.branch}`,
    app.customGitUrl && `  Custom Git URL: ${app.customGitUrl}`,
    app.customGitBranch && `  Custom Git Branch: ${app.customGitBranch}`,
    app.githubId && `  GitHub ID: ${app.githubId}`,
    app.dockerImage && `  Docker Image: ${app.dockerImage}`,
    app.dockerfile && `  Dockerfile: ${app.dockerfile}`,
  ]
    .filter(Boolean)
    .join("\n")

  const envSection = app.env ? `\n  Env Variables:\n\`\`\`\n${app.env}\n\`\`\`` : ""

  return `- **${app.name}** ${statusIcon(app.applicationStatus)} (ID: ${app.applicationId})
  App Name: ${app.appName}
  Description: ${orElse(app.description, "None")}
  Build Type: ${orElse(app.buildType, "N/A")}
  Source: ${orElse(app.sourceType, "N/A")}
${gitSource ? `${gitSource}\n` : ""}  Auto Deploy: ${app.autoDeploy ?? "N/A"}
  Created: ${formatDate(app.createdAt)}${envSection}`
}

export function formatDeployment(dep: DokployDeployment): string {
  return `- ${statusIcon(dep.status)} **${orElse(dep.title, "Deployment")}** (ID: ${dep.deploymentId})
  Status: ${dep.status}
  Description: ${orElse(dep.description, "None")}
  Created: ${formatDate(dep.createdAt)}`
}

export function formatDeploymentList(deployments: DokployDeployment[]): string {
  if (deployments.length === 0) return "No deployments found."
  return `# Deployments (${deployments.length})\n\n${deployments.map(formatDeployment).join("\n\n")}`
}

export function formatCompose(compose: DokployCompose): string {
  const envSection = compose.env ? `\n  Env Variables:\n\`\`\`\n${compose.env}\n\`\`\`` : ""

  return `- **${compose.name}** ${statusIcon(compose.composeStatus)} (ID: ${compose.composeId})
  App Name: ${compose.appName}
  Description: ${orElse(compose.description, "None")}
  Type: ${orElse(compose.composeType, "N/A")}
  Source: ${orElse(compose.sourceType, "N/A")}
  Created: ${formatDate(compose.createdAt)}${envSection}`
}

export function formatDomain(domain: DokployDomain): string {
  const protocol = domain.https ? "https" : "http"
  return `- **${protocol}://${domain.host}${domain.path ?? ""}** (ID: ${domain.domainId})
  Port: ${domain.port ?? "default"}
  HTTPS: ${domain.https}
  Certificate: ${orElse(domain.certificateType, "None")}
  Type: ${orElse(domain.domainType, "N/A")}
  Service: ${orElse(domain.serviceName, "N/A")}`
}

export function formatDomainList(domains: DokployDomain[]): string {
  if (domains.length === 0) return "No domains found."
  return `# Domains (${domains.length})\n\n${domains.map(formatDomain).join("\n\n")}`
}

export function formatServer(server: DokployServer): string {
  return `- **${server.name}** (ID: ${server.serverId})
  Description: ${orElse(server.description, "None")}
  IP: ${server.ipAddress}:${server.port}
  User: ${server.username}
  Type: ${server.serverType}
  Created: ${formatDate(server.createdAt)}`
}

export function formatServerList(servers: DokployServer[]): string {
  if (servers.length === 0) return "No servers found."
  return `# Servers (${servers.length})\n\n${servers.map(formatServer).join("\n\n")}`
}

export function formatDatabase(db: DokployDatabase, dbType: string): string {
  const name = db.name ?? dbType
  const id = DB_TYPES.includes(dbType as DatabaseType)
    ? resolveDbId(db, dbType as DatabaseType)
    : (db.databaseId ?? "unknown")
  return `- **${name}** ${statusIcon(db.applicationStatus)} (ID: ${id})
  Type: ${dbType}
  App Name: ${db.appName ?? "N/A"}
  Description: ${orElse(db.description, "None")}
  Database Name: ${orElse(db.databaseName, "N/A")}
  Image: ${orElse(db.dockerImage, "default")}
  External Port: ${db.externalPort ?? "None"}
  Created: ${formatDate(db.createdAt)}`
}

export function formatContainer(container: DokployContainer): string {
  const state = orElse(container.state, "unknown").toUpperCase()
  return `- **${container.name}** [${state}]
  ID: ${container.containerId}
  Image: ${container.image}
  Status: ${container.status}
  Ports: ${orElse(container.ports, "None")}`
}

export function formatContainerList(containers: DokployContainer[]): string {
  if (containers.length === 0) return "No containers found."
  return `# Containers (${containers.length})\n\n${containers.map(formatContainer).join("\n\n")}`
}

export function formatBackup(backup: DokployBackup): string {
  return `- **${backup.prefix}** (ID: ${backup.backupId})
  Schedule: ${backup.schedule}
  Enabled: ${backup.enabled ?? true}
  Database: ${backup.database}
  Type: ${backup.databaseType}
  Destination: ${backup.destinationId}
  Keep Latest: ${backup.keepLatestCount ?? "unlimited"}`
}

export function formatSshKey(sshKey: DokploySshKey): string {
  const pubKeyPreview = sshKey.publicKey ? `${sshKey.publicKey.substring(0, 40)}...` : "N/A"
  return `- **${sshKey.name}** (ID: ${sshKey.sshKeyId})
  Description: ${orElse(sshKey.description, "None")}
  Public Key: ${pubKeyPreview}
  Created: ${formatDate(sshKey.createdAt)}`
}

export function formatSshKeyList(sshKeys: DokploySshKey[]): string {
  if (sshKeys.length === 0) return "No SSH keys found."
  return `# SSH Keys (${sshKeys.length})\n\n${sshKeys.map(formatSshKey).join("\n\n")}`
}

export function formatRegistry(registry: DokployRegistry): string {
  return `- **${registry.registryName}** (ID: ${registry.registryId})
  URL: ${registry.registryUrl}
  Type: ${registry.registryType}
  Username: ${orElse(registry.username, "N/A")}
  Image Prefix: ${orElse(registry.imagePrefix, "None")}
  Server: ${orElse(registry.serverId, "default")}
  Created: ${formatDate(registry.createdAt)}`
}

export function formatRegistryList(registries: DokployRegistry[]): string {
  if (registries.length === 0) return "No registries found."
  return `# Registries (${registries.length})\n\n${registries.map(formatRegistry).join("\n\n")}`
}

export function formatDestination(destination: DokployDestination): string {
  return `- **${destination.name}** (ID: ${destination.destinationId})
  Provider: ${orElse(destination.provider, "N/A")}
  Bucket: ${destination.bucket}
  Region: ${destination.region}
  Endpoint: ${destination.endpoint}
  Server: ${orElse(destination.serverId, "default")}
  Created: ${formatDate(destination.createdAt)}`
}

export function formatDestinationList(destinations: DokployDestination[]): string {
  if (destinations.length === 0) return "No destinations found."
  return `# Destinations (${destinations.length})\n\n${destinations.map(formatDestination).join("\n\n")}`
}
