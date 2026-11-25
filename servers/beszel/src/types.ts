/**
 * Record shapes for the Beszel collections this server reads, as of Beszel 0.21.x.
 * Every field the hub may leave out is optional: Beszel's docs say the API's shape can change in a
 * minor release, and older agents send older fields.
 */

export type RecordBase = {
  readonly id: string
  readonly created?: string
  readonly updated?: string | number
}

export type ListResult<T> = {
  readonly page: number
  readonly perPage: number
  readonly totalItems: number
  readonly totalPages: number
  readonly items: ReadonlyArray<T>
}

export type SystemStatus = "up" | "down" | "paused" | "pending"

/** `systems.info`: the current summary the hub keeps per system. */
export type SystemInfo = {
  readonly cpu?: number
  readonly mp?: number
  readonly dp?: number
  readonly u?: number
  readonly v?: string
  readonly la?: ReadonlyArray<number>
  readonly bb?: number
  readonly b?: number
  readonly g?: number
  readonly dt?: number
  readonly sv?: ReadonlyArray<number>
  readonly pu?: ReadonlyArray<number>
  readonly efs?: Readonly<Record<string, number>>
  readonly ct?: number
  readonly h?: string
  readonly k?: string
  readonly c?: number
  readonly t?: number
  readonly m?: string
}

export type SystemRecord = RecordBase & {
  readonly name: string
  readonly status: SystemStatus
  readonly host?: string
  readonly port?: string
  readonly info?: SystemInfo
}

export type SystemDetailsRecord = RecordBase & {
  readonly system: string
  readonly hostname?: string
  readonly os_name?: string
  readonly kernel?: string
  readonly cpu?: string
  readonly arch?: string
  readonly cores?: number
  readonly threads?: number
  readonly sockets?: number
  /** Total memory, in bytes. */
  readonly memory?: number
  readonly podman?: boolean
}

export type FsStats = {
  readonly d?: number
  readonly du?: number
  readonly rb?: number
  readonly wb?: number
  readonly n?: string
}

export type GpuStats = {
  readonly n?: string
  readonly u?: number
  readonly mu?: number
  readonly mt?: number
  readonly p?: number
}

/** `system_stats.stats`. Byte arrays are newer; the GB fields are what older agents send. */
export type SystemStats = {
  readonly cpu?: number
  readonly mp?: number
  readonly mem?: ReadonlyArray<number>
  readonly m?: number
  readonly mu?: number
  readonly swap?: ReadonlyArray<number>
  readonly d?: number
  readonly du?: number
  readonly dp?: number
  readonly dio?: ReadonlyArray<number>
  readonly b?: ReadonlyArray<number>
  readonly la?: ReadonlyArray<number>
  readonly t?: Readonly<Record<string, number>>
  readonly efs?: Readonly<Record<string, FsStats>>
  readonly g?: Readonly<Record<string, GpuStats>>
}

export type SystemStatsRecord = RecordBase & {
  readonly system: string
  readonly type: StatsInterval
  readonly stats: SystemStats
}

export type StatsInterval = "1m" | "10m" | "20m" | "120m" | "480m"

export type ContainerRecord = RecordBase & {
  readonly system: string
  readonly name: string
  readonly image?: string
  readonly status?: string
  readonly health?: number
  readonly cpu?: number
  /** In MB. */
  readonly memory?: number
  /** Bytes per second, sent and received together. */
  readonly net?: number
  readonly ports?: string
  readonly updatable?: boolean
}

/** One container's entry in `container_stats.stats`. */
export type ContainerStat = {
  readonly n: string
  readonly c?: number
  /** In MB. */
  readonly m?: number
  /** [sent, received] in bytes per second. */
  readonly b?: ReadonlyArray<number>
  /** Older agents: MB per second. */
  readonly ns?: number
  readonly nr?: number
}

export type ContainerStatsRecord = RecordBase & {
  readonly system: string
  readonly type: StatsInterval
  readonly stats: ReadonlyArray<ContainerStat>
}

export type SystemdServiceRecord = RecordBase & {
  readonly system: string
  readonly name: string
  readonly state?: number
  readonly sub?: number
  readonly cpu?: number
  readonly cpuPeak?: number
  /** In bytes. */
  readonly memory?: number
  readonly memPeak?: number
}

export type SmartDeviceRecord = RecordBase & {
  readonly system: string
  readonly name?: string
  readonly model?: string
  readonly state?: string
  /** In bytes. */
  readonly capacity?: number
  readonly temp?: number
  readonly firmware?: string
  readonly type?: string
  readonly hours?: number
  readonly cycles?: number
}

export type AlertRecord = RecordBase & {
  readonly system: string
  readonly name: string
  readonly value?: number
  readonly min?: number
  readonly triggered?: boolean
}

export type AlertHistoryRecord = RecordBase & {
  readonly system: string
  readonly alert_id?: string
  readonly name: string
  readonly monitor_name?: string
  readonly value?: number
  readonly resolved?: string
}
