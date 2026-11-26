import { Option } from "functype"

import type {
  DakboardBlock,
  DakboardBlockDetail,
  DakboardDataPoint,
  DakboardDevice,
  DakboardLoop,
  DakboardLoopDetail,
  DakboardMetric,
  DakboardMetricDetail,
  DakboardScreen,
  DakboardScreenDetail,
} from "../types"

const optField = (value: string | number | undefined | null, prefix: string): string =>
  Option(value)
    .filter((v) => v !== "" && v !== "0" && v !== 0)
    .map((v) => `\n- ${prefix}: ${v}`)
    .fold(
      () => "",
      (v) => v,
    )

export const formatScreenSummary = (screen: DakboardScreen): string =>
  `- **${screen.name}** (ID: ${screen.id})${screen.is_default ? " [Default]" : ""}`

export const formatScreenDetail = (screen: DakboardScreenDetail): string => {
  const { settings } = screen
  const bgColor = settings?.background_color ?? screen.background_color
  const customCss = Option(settings?.custom_css)
    .filter((css) => css.length > 0)
    .map((css) => `\n- Custom CSS: \`${css.substring(0, 100)}${css.length > 100 ? "..." : ""}\``)
    .fold(
      () => "",
      (v) => v,
    )

  const dimensions =
    screen.width !== undefined && screen.height !== undefined ? `\n- Dimensions: ${screen.width}x${screen.height}` : ""

  return `# Screen: ${screen.name}

## Details
- ID: ${screen.id}
- Name: ${screen.name}${optField(screen.orientation, "Orientation")}${dimensions}${optField(screen.refresh, "Refresh (seconds)")}${optField(screen.version, "Version")}${optField(bgColor, "Background Color")}${optField(settings?.text_color, "Text Color")}${optField(settings?.font_family, "Font")}${optField(settings?.timezone, "Timezone")}${optField(settings?.time_format, "Time Format")}${optField(settings?.language, "Language")}${customCss}${optField(screen.created_at, "Created")}${optField(screen.updated_at, "Updated")}`
}

export const formatScreenList = (screens: DakboardScreen[]): string => {
  if (screens.length === 0) return "No screens found."
  return `# DAKboard Screens (${screens.length})

${screens.map(formatScreenSummary).join("\n")}`
}

export const formatBlockSummary = (block: DakboardBlock): string => {
  const hasName = block.name != null && block.name.length > 0
  const label = hasName ? `${block.name} (${block.type})` : block.type
  return `- **${label}** (ID: ${block.id}) — ${block.w}x${block.h} at (${block.x},${block.y})${block.is_disabled ? " [Disabled]" : ""}`
}

export const formatBlockDetail = (block: DakboardBlockDetail): string => {
  const hasName = block.name != null && block.name.length > 0
  const label = hasName ? `${block.name} (${block.type})` : block.type

  const photoUrls = Option(block.photo_urls)
    .filter((urls) => urls.length > 0)
    .map((urls) => `\n- Photos:\n${urls.map((u) => `  - ${u}`).join("\n")}`)
    .fold(
      () => "",
      (v) => v,
    )

  const text = Option(block.text)
    .map((t) => `\n\n## Content\n\`\`\`\n${t}\n\`\`\``)
    .fold(
      () => "",
      (v) => v,
    )

  return `# Block: ${label}

## Details
- ID: ${block.id}
- Type: ${block.type}
- Position: (${block.x}, ${block.y})
- Size: ${block.w}x${block.h}
- Z-Index: ${block.z_index}
- Disabled: ${block.is_disabled ? "Yes" : "No"}${optField(block.source, "Source")}${optField(block.location, "Location")}${optField(block.timezone, "Timezone")}${optField(block.clock_type, "Clock Type")}${optField(block.url, "URL")}${photoUrls}${optField(block.created_at, "Created")}${optField(block.updated_at, "Updated")}${text}`
}

export const formatBlockList = (blocks: DakboardBlock[], screenId: string): string => {
  if (blocks.length === 0) return `No blocks found for screen ${screenId}.`
  return `# Blocks for Screen ${screenId} (${blocks.length})

${blocks.map(formatBlockSummary).join("\n")}`
}

export const formatLoopSummary = (loop: DakboardLoop): string => `- **${loop.name}** (ID: ${loop.id})`

export const formatLoopDetail = (loop: DakboardLoopDetail): string => {
  const screens =
    loop.screens.length > 0
      ? loop.screens.map((s) => `  - Screen ${s.screen_id}: ${s.duration}s (order: ${s.order})`).join("\n")
      : "  No screens configured"

  return `# Loop: ${loop.name}

## Details
- ID: ${loop.id}
- Created: ${loop.created_at}
- Updated: ${loop.updated_at}

## Screens
${screens}`
}

export const formatLoopList = (loops: DakboardLoop[]): string => {
  if (loops.length === 0) return "No loops found."
  return `# DAKboard Loops (${loops.length})

${loops.map(formatLoopSummary).join("\n")}`
}

export const formatDeviceSummary = (device: DakboardDevice): string => {
  const ip = Option(device.ip_addr)
    .map((ip) => ` — ${ip}`)
    .fold(
      () => "",
      (v) => v,
    )

  return `- **${device.name}** (ID: ${device.id})${ip}`
}

export const formatDeviceDetail = (device: DakboardDevice): string => {
  const lastConnect = Option(device.last_connect)
    .filter((v) => v !== "0")
    .map((v) => {
      const date = new Date(Number(v) * 1000)
      return `\n- Last Connected: ${date.toISOString()}`
    })
    .fold(
      () => "",
      (v) => v,
    )

  return `# Device: ${device.name}

## Details
- ID: ${device.id}
- Name: ${device.name}${optField(device.model, "Model")}${optField(device.serial_num, "Serial")}${optField(device.ip_addr, "IP Address")}${optField(device.screen_id, "Screen ID")}${optField(device.screen_type, "Screen Type")}${lastConnect}${optField(device.created_at, "Created")}${optField(device.updated_at, "Updated")}`
}

export const formatDeviceList = (devices: DakboardDevice[]): string => {
  if (devices.length === 0) return "No devices found."
  return `# DAKboard Devices (${devices.length})

${devices.map(formatDeviceSummary).join("\n")}`
}

export const formatMetricSummary = (metric: DakboardMetric): string =>
  `- **${metric.metric_name}** (updated: ${metric.updated_at})`

export const formatDataPoint = (dp: DakboardDataPoint): string => {
  const ts = Option(dp.timestamp)
    .map((t) => `${t}: `)
    .fold(
      () => "",
      (v) => v,
    )

  const expires = Option(dp.expires)
    .map((e) => ` (expires: ${e})`)
    .fold(
      () => "",
      (v) => v,
    )

  return `  - ${ts}${dp.value}${expires}`
}

export const formatMetricDetail = (metric: DakboardMetricDetail): string => {
  const dataPoints =
    metric.data_points.length > 0 ? metric.data_points.map(formatDataPoint).join("\n") : "  No data points"

  return `# Metric: ${metric.metric_name}

## Details
- Name: ${metric.metric_name}
- Created: ${metric.created_at}
- Updated: ${metric.updated_at}

## Data Points (${metric.data_points.length})
${dataPoints}`
}

export const formatMetricList = (metrics: DakboardMetric[]): string => {
  if (metrics.length === 0) return "No metrics found."
  return `# DAKboard Metrics (${metrics.length})

${metrics.map(formatMetricSummary).join("\n")}`
}
