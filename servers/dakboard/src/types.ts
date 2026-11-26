export type DakboardApiError = {
  type: "network" | "parse" | "api" | "unknown"
  message: string
  status?: number
}

// Screen types
export type DakboardScreen = {
  id: string
  name: string
  is_default?: number
  created_at?: string
  updated_at?: string
}

export type DakboardScreenSettings = {
  language?: string
  timezone?: string
  font_family?: string
  font_size?: string
  font_size_type?: string
  background_color?: string
  text_color?: string
  custom_css?: string
  time_format?: string
  date_format?: string
  increase_legibility?: string
}

export type DakboardScreenDetail = DakboardScreen & {
  orientation?: string
  width?: number | string
  height?: number | string
  refresh?: number
  version?: string
  status?: string
  settings?: DakboardScreenSettings
  background_color?: string
}

export type UpdateScreenParams = {
  name?: string
  orientation?: string
  width?: number
  height?: number
  is_default?: number
  refresh?: number
}

// Block types
export type DakboardBlock = {
  id: string
  screen_id?: string
  // eslint-disable-next-line functype/prefer-option -- API returns null for unnamed blocks
  name?: string | null
  type: string
  w: number
  h: number
  x: number
  y: number
  is_disabled?: number
  z_index: number
  created_at?: string
  updated_at?: string
}

export type DakboardBlockDetail = DakboardBlock & {
  text?: string
  photo_urls?: string[]
  url?: string
  source?: string
  location?: string
  lat?: string
  lon?: string
  timezone?: string
  clock_type?: string
}

export type UpdateBlockParams = {
  name?: string
  w?: number
  h?: number
  x?: number
  y?: number
  is_disabled?: number
  z_index?: number
  text?: string
  photo_urls?: string[]
  url?: string
}

// Loop types
export type DakboardLoop = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type DakboardLoopDetail = DakboardLoop & {
  screens: Array<{
    screen_id: string
    duration: number
    order: number
  }>
}

// Device types
export type DakboardDevice = {
  id: string
  name: string
  ip_addr?: string
  screen_id?: string
  serial_num?: string
  model?: string
  last_connect?: string
  screen_type?: string
  created_at?: string
  updated_at?: string
}

export type DakboardDeviceDetail = DakboardDevice

export type UpdateDeviceParams = {
  name?: string
  ip_addr?: string
  screen_id?: string
}

// Metric types
export type DakboardMetric = {
  metric_name: string
  created_at: string
  updated_at: string
}

export type DakboardMetricDetail = DakboardMetric & {
  data_points: DakboardDataPoint[]
}

export type DakboardDataPoint = {
  timestamp?: string
  value: string | number
  expires?: string
}

export type CreateDataPointParams = {
  timestamp?: string
  value: string | number
  expires?: string
}

export type DeleteDataPointsParams = {
  timestamp: string
}
