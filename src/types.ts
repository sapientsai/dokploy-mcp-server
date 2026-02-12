export const DB_TYPES = ["postgres", "mysql", "mariadb", "mongo", "redis"] as const
export type DatabaseType = (typeof DB_TYPES)[number]

export const DB_ID_FIELDS: Record<DatabaseType, string> = {
  postgres: "postgresId",
  mysql: "mysqlId",
  mariadb: "mariadbId",
  mongo: "mongoId",
  redis: "redisId",
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
  projectId: string
  createdAt?: string
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
  environmentId: string
  createdAt?: string
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

export type DokployDatabase = {
  databaseId: string
  name: string
  appName: string
  description?: string
  databaseName?: string
  databaseUser?: string
  dockerImage?: string
  applicationStatus: string
  environmentId: string
  externalPort?: number
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

export type DokployMount = {
  mountId: string
  type: string
  hostPath?: string
  volumeName?: string
  mountPath: string
  applicationId?: string
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
