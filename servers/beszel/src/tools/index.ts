import type { SomaServerInstance } from "somamcp"

import { registerAlertTools } from "./alerts-tools"
import { registerContainerTools } from "./containers-tools"
import { registerDiskTools } from "./disks-tools"
import { registerServiceTools } from "./services-tools"
import { registerStatsTools } from "./stats-tools"
import { registerSystemTools } from "./systems-tools"

export {
  registerAlertTools,
  registerContainerTools,
  registerDiskTools,
  registerServiceTools,
  registerStatsTools,
  registerSystemTools,
}

export function registerAllTools(server: SomaServerInstance): void {
  registerSystemTools(server)
  registerStatsTools(server)
  registerContainerTools(server)
  registerServiceTools(server)
  registerDiskTools(server)
  registerAlertTools(server)
}
