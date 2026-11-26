import type { SomaServerInstance } from "somamcp"

import { registerAlertTools } from "./alerts-tools"
import { registerContainerTools } from "./containers-tools"
import { registerDiskTools } from "./disks-tools"
import { registerServiceTools } from "./services-tools"
import { registerStatsTools } from "./stats-tools"
import { registerSystemTools } from "./systems-tools"
import { registerWriteTools } from "./write-tools"

export {
  registerAlertTools,
  registerContainerTools,
  registerDiskTools,
  registerServiceTools,
  registerStatsTools,
  registerSystemTools,
  registerWriteTools,
}

/** The read tools always; the tools that change systems only when `writes` is on. */
export function registerAllTools(server: SomaServerInstance, options: { readonly writes: boolean }): void {
  registerSystemTools(server)
  registerStatsTools(server)
  registerContainerTools(server)
  registerServiceTools(server)
  registerDiskTools(server)
  registerAlertTools(server)
  if (options.writes) registerWriteTools(server)
}
