/**
 * Records shaped like Beszel 0.21.2's PocketBase collections. Every name, host and value is made up.
 */
import type {
  AlertHistoryRecord,
  AlertRecord,
  ContainerRecord,
  ContainerStatsRecord,
  SmartDeviceRecord,
  SystemDetailsRecord,
  SystemdServiceRecord,
  SystemRecord,
  SystemStatsRecord,
} from "../../src/types"

export const page = <T>(items: ReadonlyArray<T>) => ({
  page: 1,
  perPage: 500,
  totalItems: items.length,
  totalPages: 1,
  items,
})

const GB = 1024 ** 3

export const systems: ReadonlyArray<SystemRecord> = [
  {
    id: "sysalpha0000001",
    name: "alpha",
    status: "up",
    host: "10.0.0.11",
    port: "45876",
    info: {
      cpu: 12.5,
      mp: 41.2,
      dp: 63.0,
      u: 3 * 86_400 + 4 * 3600,
      v: "0.21.2",
      la: [0.42, 0.37, 0.3],
      bb: 2.5 * 1024 * 1024,
      sv: [42, 1],
      pu: [7, 2],
      ct: 2,
    },
  },
  {
    id: "sysbravo0000002",
    name: "bravo",
    status: "down",
    host: "10.0.0.12",
    port: "45876",
    info: { cpu: 0, mp: 0, dp: 20, v: "0.20.0" },
  },
]

export const details: SystemDetailsRecord = {
  id: "sysalpha0000001",
  system: "sysalpha0000001",
  hostname: "alpha.example.com",
  os_name: "Debian GNU/Linux 13",
  kernel: "6.12.0",
  cpu: "Example CPU 8000",
  arch: "x86_64",
  cores: 8,
  threads: 16,
  memory: 32 * GB,
}

export const latestStats: SystemStatsRecord = {
  id: "stat0000000001",
  system: "sysalpha0000001",
  type: "1m",
  created: "2026-11-25 12:00:00.000Z",
  stats: {
    cpu: 12.5,
    mp: 41.2,
    mem: [32 * GB, 13 * GB, 4 * GB, 0],
    d: 500,
    du: 315,
    dp: 63,
    efs: { data: { d: 2000, du: 1500, n: "Data" } },
    t: { cpu_package: 54, nvme0: 41 },
  },
}

export const statsSeries: ReadonlyArray<SystemStatsRecord> = [10, 30, 20].map((cpu, i) => ({
  id: `stat000000010${i}`,
  system: "sysalpha0000001",
  type: "20m",
  created: `2026-11-25 1${i}:00:00.000Z`,
  stats: {
    cpu,
    mp: 40 + i,
    mem: [32 * GB, (10 + i) * GB, 0, 0],
    dp: 63,
    du: 315,
    dio: [1024 * 1024, 2 * 1024 * 1024],
    b: [1000, 3000 * (i + 1)],
    la: [0.5 + i, 0.4, 0.3],
    t: { cpu_package: 50 + i },
  },
}))

/** An older agent: memory in GB, no byte arrays. */
export const oldAgentStats: SystemStatsRecord = {
  id: "stat0000000200",
  system: "sysalpha0000001",
  type: "20m",
  created: "2026-11-25 13:00:00.000Z",
  stats: { cpu: 5, mp: 30, m: 32, mu: 9.5, dp: 63 },
}

export const containers: ReadonlyArray<ContainerRecord> = [
  {
    id: "c0ffee000001",
    system: "sysalpha0000001",
    name: "web",
    image: "example/web:1.2",
    status: "Up 3 days",
    health: 2,
    cpu: 1.5,
    memory: 256,
    net: 4096,
    updatable: true,
  },
  {
    id: "c0ffee000002",
    system: "sysalpha0000001",
    name: "db",
    image: "example/db:16",
    status: "Up 3 days (unhealthy)",
    health: 3,
    cpu: 8,
    memory: 1536,
    net: 512,
  },
]

export const containerSeries: ReadonlyArray<ContainerStatsRecord> = [1, 3].map((cpu, i) => ({
  id: `cstat00000000${i}`,
  system: "sysalpha0000001",
  type: "20m",
  created: `2026-11-25 1${i}:00:00.000Z`,
  stats: [
    { n: "web", c: cpu, m: 200 + i * 100, b: [1000, 1000] },
    { n: "db", c: 10, m: 1500 },
  ],
}))

export const services: ReadonlyArray<SystemdServiceRecord> = [
  { id: "svc1", system: "sysalpha0000001", name: "nginx.service", state: 0, sub: 1, cpu: 0.2, memory: 50 * 1024 ** 2 },
  { id: "svc2", system: "sysalpha0000001", name: "backup.service", state: 2, sub: 3, cpu: 0, memory: 0 },
]

export const smartDevices: ReadonlyArray<SmartDeviceRecord> = [
  {
    id: "smart1",
    system: "sysalpha0000001",
    name: "nvme0",
    model: "Example NVMe 2TB",
    type: "nvme",
    state: "PASSED",
    capacity: 2 * 1000 ** 4,
    temp: 41,
    hours: 12_000,
    cycles: 80,
  },
  {
    id: "smart2",
    system: "sysalpha0000001",
    name: "sda",
    model: "Example HDD",
    type: "sat",
    state: "FAILED",
    temp: 38,
  },
]

export const alerts: ReadonlyArray<AlertRecord> = [
  { id: "al1", system: "sysalpha0000001", name: "CPU", value: 80, min: 10, triggered: false },
  { id: "al2", system: "sysbravo0000002", name: "Status", value: 0, min: 5, triggered: true },
  { id: "al3", system: "sysalpha0000001", name: "Temperature", value: 85, min: 1, triggered: false },
]

export const alertHistory: ReadonlyArray<AlertHistoryRecord> = [
  { id: "ah1", system: "sysbravo0000002", name: "Status", value: 0, created: "2026-11-25 09:00:00.000Z", resolved: "" },
  {
    id: "ah2",
    system: "sysalpha0000001",
    name: "CPU",
    value: 93,
    created: "2026-11-24 22:00:00.000Z",
    resolved: "2026-11-24 22:30:00.000Z",
  },
]

/** A JWT whose payload is `{"exp": <seconds>}`; the signature is never checked here. */
export const jwt = (expSeconds: number): string =>
  `${btoa(JSON.stringify({ alg: "HS256" }))}.${btoa(JSON.stringify({ exp: expSeconds })).replaceAll("=", "")}.sig`
