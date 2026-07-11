/* eslint-disable functype/prefer-option --
 * These DTOs mirror Dokploy's REST API response shapes (see src/generated/dokploy-api.ts).
 * Fields typed as `string | null` reflect the wire format — the Dokploy server can return
 * either an absent key (undefined) or an explicit `null` for unset optional values. The
 * Option<T> wrapping happens at the rendering boundary via `formatters.ts#orElse`, not in
 * the DTO definitions, because these types are read from JSON in one place (the client)
 * and consumed by many formatters/tools — keeping them isomorphic with the OpenAPI spec
 * makes codegen reviews and incident debugging easier.
 */
export const DB_TYPES = ["postgres", "mysql", "mariadb", "mongo", "redis", "libsql"] as const
export type DatabaseType = (typeof DB_TYPES)[number]

export const DB_ID_FIELDS: Record<DatabaseType, string> = {
  postgres: "postgresId",
  mysql: "mysqlId",
  mariadb: "mariadbId",
  mongo: "mongoId",
  redis: "redisId",
  libsql: "libsqlId",
}

export type DokployProject = {
  projectId: string
  name: string
  description?: string
  createdAt?: string
  organizationId?: string
  environments?: DokployEnvironment[]
}

export type DokployEnvironment = {
  environmentId: string
  name: string
  description?: string
  // Empirically missing on environment.byProjectId responses — the caller passes projectId
  // as a query param, so the API treats it as known context and omits it from the payload.
  projectId?: string
  createdAt?: string
  applications?: DokployApplication[]
  compose?: DokployCompose[]
  postgres?: DokployDatabase[]
  mysql?: DokployDatabase[]
  mariadb?: DokployDatabase[]
  mongo?: DokployDatabase[]
  redis?: DokployDatabase[]
}

export type DokployApplication = {
  applicationId: string
  name: string
  appName: string
  description?: string
  applicationStatus: string
  buildType?: string
  sourceType?: string
  dockerImage?: string
  repository?: string
  branch?: string
  owner?: string
  customGitUrl?: string
  customGitBranch?: string
  githubId?: string
  dockerfile?: string
  environmentId: string
  createdAt?: string
  autoDeploy?: boolean
  env?: string
  domains?: DokployDomain[]
}

export type DokployCompose = {
  composeId: string
  name: string
  appName: string
  description?: string
  composeFile?: string
  composeType?: string
  composeStatus: string
  sourceType?: string
  customGitUrl?: string
  customGitBranch?: string
  customGitSSHKeyId?: string
  repository?: string
  branch?: string
  owner?: string
  composePath?: string
  environmentId: string
  createdAt?: string
  autoDeploy?: boolean
  env?: string
}

export type DokployDeployment = {
  deploymentId: string
  title?: string
  description?: string
  status: string
  logPath?: string
  applicationId?: string
  composeId?: string
  serverId?: string
  createdAt?: string
}

export type DokployDomain = {
  domainId: string
  host: string
  path?: string
  port?: number
  https: boolean
  certificateType?: string
  applicationId?: string
  composeId?: string
  serviceName?: string
  domainType?: string
  createdAt?: string
}

export type DokployServer = {
  serverId: string
  name: string
  description?: string
  ipAddress: string
  port: number
  username: string
  sshKeyId: string
  serverType: string
  createdAt?: string
}

export type DokploySshKey = {
  sshKeyId: string
  name: string
  description?: string
  privateKey?: string
  publicKey?: string
  createdAt?: string
  lastUsedAt?: string
}

export type DokployDatabase = {
  databaseId?: string
  postgresId?: string
  mysqlId?: string
  mariadbId?: string
  mongoId?: string
  redisId?: string
  libsqlId?: string
  name?: string
  appName?: string
  description?: string
  databaseName?: string
  databaseUser?: string
  dockerImage?: string
  applicationStatus?: string
  environmentId?: string
  externalPort?: number
  externalGRPCPort?: number
  externalAdminPort?: number
  sqldNode?: "primary" | "replica"
  sqldPrimaryUrl?: string | null
  enableNamespaces?: boolean
  env?: string
  createdAt?: string
}

export type DokployBackup = {
  backupId: string
  schedule: string
  enabled?: boolean
  prefix: string
  destinationId: string
  database: string
  databaseType: string
  keepLatestCount?: number
  postgresId?: string
  mysqlId?: string
  mariadbId?: string
  mongoId?: string
}

export type DokployContainer = {
  containerId: string
  name: string
  image: string
  state: string
  status: string
  ports?: string
}

export const MOUNT_SERVICE_TYPES = [
  "application",
  "postgres",
  "mysql",
  "mariadb",
  "mongo",
  "redis",
  "compose",
  "libsql",
] as const
export type MountServiceType = (typeof MOUNT_SERVICE_TYPES)[number]

export const MOUNT_TYPES = ["bind", "volume", "file"] as const
export type MountType = (typeof MOUNT_TYPES)[number]

export type DokployMount = {
  mountId: string
  type: MountType | string
  mountPath: string
  hostPath?: string | null
  volumeName?: string | null
  filePath?: string | null
  content?: string | null
  serviceType?: MountServiceType | string
  applicationId?: string | null
  composeId?: string | null
  postgresId?: string | null
  mysqlId?: string | null
  mariadbId?: string | null
  mongoId?: string | null
  redisId?: string | null
  libsqlId?: string | null
}

export type DokployPort = {
  portId: string
  publishedPort: number
  targetPort: number
  protocol?: string
  publishMode?: string
  applicationId?: string
}

export type DokployCertificate = {
  certificateId: string
  name: string
  certificateData?: string
  privateKey?: string
  autoRenew?: boolean
}

export type DokploySecurity = {
  securityId: string
  username: string
  password: string
  applicationId?: string
}

export type DokployRegistry = {
  registryId: string
  registryName: string
  registryUrl: string
  registryType: string
  username?: string
  imagePrefix?: string | null
  serverId?: string
  organizationId?: string
  createdAt?: string
}

export type DokployDestination = {
  destinationId: string
  name: string
  provider?: string | null
  bucket: string
  region: string
  endpoint: string
  accessKey?: string
  serverId?: string
  createdAt?: string
}

export type DokployRedirect = {
  redirectId: string
  regex: string
  replacement: string
  permanent: boolean
  applicationId?: string
  createdAt?: string
  uniqueConfigKey?: number
}

export const SCHEDULE_TYPES = ["application", "compose", "server", "dokploy-server"] as const
export type ScheduleType = (typeof SCHEDULE_TYPES)[number]

export type DokploySchedule = {
  scheduleId: string
  name: string
  description?: string | null
  cronExpression: string
  command: string
  scheduleType?: ScheduleType | string
  shellType?: "bash" | "sh"
  script?: string | null
  appName?: string
  serviceName?: string | null
  applicationId?: string | null
  composeId?: string | null
  serverId?: string | null
  organizationId?: string | null
  enabled?: boolean
  timezone?: string | null
  createdAt?: string
}

export const AUDIT_ACTIONS = ["create", "update", "delete", "deploy", "cancel", "redeploy", "login", "logout"] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_RESOURCE_TYPES = [
  "project",
  "service",
  "environment",
  "deployment",
  "user",
  "customRole",
  "domain",
  "certificate",
  "registry",
  "server",
  "sshKey",
  "gitProvider",
  "notification",
  "settings",
  "session",
] as const
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number]

export type DokployAuditLog = {
  id?: string
  userId?: string | null
  userEmail?: string | null
  action?: AuditAction | string
  resourceType?: AuditResourceType | string
  resourceId?: string | null
  resourceName?: string | null
  metadata?: unknown
  createdAt?: string
}

export type DokployPreviewDeployment = {
  previewDeploymentId: string
  branch?: string | null
  pullRequestId?: string | null
  pullRequestNumber?: string | null
  pullRequestTitle?: string | null
  pullRequestUrl?: string | null
  previewStatus?: string
  domainId?: string | null
  applicationId?: string
  createdAt?: string
}

export const VOLUME_BACKUP_SERVICE_TYPES = MOUNT_SERVICE_TYPES
export type VolumeBackupServiceType = MountServiceType

export type DokployVolumeBackup = {
  volumeBackupId: string
  name: string
  volumeName: string
  prefix: string
  cronExpression: string
  destinationId: string
  serviceType?: VolumeBackupServiceType | string
  appName?: string
  serviceName?: string | null
  turnOff?: boolean
  keepLatestCount?: number | null
  enabled?: boolean | null
  applicationId?: string | null
  postgresId?: string | null
  mariadbId?: string | null
  mongoId?: string | null
  mysqlId?: string | null
  redisId?: string | null
  libsqlId?: string | null
  composeId?: string | null
  createdAt?: string
}
