import type {
  DokployApplication,
  DokployBackup,
  DokployCompose,
  DokployContainer,
  DokployDatabase,
  DokployDeployment,
  DokployDomain,
  DokployEnvironment,
  DokployProject,
  DokployServer,
} from "../types"

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

function statusIcon(status: string): string {
  const s = status.toLowerCase()
  if (s === "running" || s === "done" || s === "idle") return "[RUNNING]"
  if (s === "error" || s === "failed") return "[ERROR]"
  if (s === "stopped") return "[STOPPED]"
  return `[${status.toUpperCase()}]`
}

export function formatProject(project: DokployProject): string {
  const envCount = project.environments?.length ?? 0
  return `- **${project.name}** (ID: ${project.projectId})
  Description: ${project.description || "None"}
  Environments: ${envCount}
  Created: ${formatDate(project.createdAt)}`
}

export function formatProjectList(projects: DokployProject[]): string {
  if (projects.length === 0) return "No projects found."
  return `# Projects (${projects.length})\n\n${projects.map(formatProject).join("\n\n")}`
}

export function formatEnvironment(env: DokployEnvironment): string {
  return `- **${env.name}** (ID: ${env.environmentId})
  Description: ${env.description || "None"}
  Project: ${env.projectId}
  Created: ${formatDate(env.createdAt)}`
}

export function formatEnvironmentList(envs: DokployEnvironment[]): string {
  if (envs.length === 0) return "No environments found."
  return `# Environments (${envs.length})\n\n${envs.map(formatEnvironment).join("\n\n")}`
}

export function formatApplication(app: DokployApplication): string {
  return `- **${app.name}** ${statusIcon(app.applicationStatus)} (ID: ${app.applicationId})
  App Name: ${app.appName}
  Description: ${app.description || "None"}
  Build Type: ${app.buildType || "N/A"}
  Source: ${app.sourceType || "N/A"}
  Auto Deploy: ${app.autoDeploy ?? "N/A"}
  Created: ${formatDate(app.createdAt)}`
}

export function formatDeployment(dep: DokployDeployment): string {
  return `- ${statusIcon(dep.status)} **${dep.title || "Deployment"}** (ID: ${dep.deploymentId})
  Status: ${dep.status}
  Description: ${dep.description || "None"}
  Created: ${formatDate(dep.createdAt)}`
}

export function formatDeploymentList(deployments: DokployDeployment[]): string {
  if (deployments.length === 0) return "No deployments found."
  return `# Deployments (${deployments.length})\n\n${deployments.map(formatDeployment).join("\n\n")}`
}

export function formatCompose(compose: DokployCompose): string {
  return `- **${compose.name}** ${statusIcon(compose.composeStatus)} (ID: ${compose.composeId})
  App Name: ${compose.appName}
  Description: ${compose.description || "None"}
  Type: ${compose.composeType || "N/A"}
  Source: ${compose.sourceType || "N/A"}
  Created: ${formatDate(compose.createdAt)}`
}

export function formatDomain(domain: DokployDomain): string {
  const protocol = domain.https ? "https" : "http"
  return `- **${protocol}://${domain.host}${domain.path || ""}** (ID: ${domain.domainId})
  Port: ${domain.port ?? "default"}
  HTTPS: ${domain.https}
  Certificate: ${domain.certificateType || "None"}
  Type: ${domain.domainType || "N/A"}
  Service: ${domain.serviceName || "N/A"}`
}

export function formatDomainList(domains: DokployDomain[]): string {
  if (domains.length === 0) return "No domains found."
  return `# Domains (${domains.length})\n\n${domains.map(formatDomain).join("\n\n")}`
}

export function formatServer(server: DokployServer): string {
  return `- **${server.name}** (ID: ${server.serverId})
  Description: ${server.description || "None"}
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
  return `- **${db.name}** ${statusIcon(db.applicationStatus)} (ID: ${db.databaseId})
  Type: ${dbType}
  App Name: ${db.appName}
  Description: ${db.description || "None"}
  Database Name: ${db.databaseName || "N/A"}
  Image: ${db.dockerImage || "default"}
  External Port: ${db.externalPort ?? "None"}
  Created: ${formatDate(db.createdAt)}`
}

export function formatContainer(container: DokployContainer): string {
  return `- **${container.name}** [${container.state?.toUpperCase() || "UNKNOWN"}]
  ID: ${container.containerId}
  Image: ${container.image}
  Status: ${container.status}
  Ports: ${container.ports || "None"}`
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
