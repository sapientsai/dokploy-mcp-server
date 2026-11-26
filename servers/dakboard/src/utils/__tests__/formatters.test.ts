import { describe, expect, it } from "vitest"

import type {
  DakboardBlock,
  DakboardBlockDetail,
  DakboardDevice,
  DakboardLoop,
  DakboardLoopDetail,
  DakboardMetric,
  DakboardMetricDetail,
  DakboardScreen,
  DakboardScreenDetail,
} from "../../types"
import {
  formatBlockDetail,
  formatBlockList,
  formatDeviceDetail,
  formatDeviceList,
  formatLoopDetail,
  formatLoopList,
  formatMetricDetail,
  formatMetricList,
  formatScreenDetail,
  formatScreenList,
} from "../formatters"

describe("formatters", () => {
  describe("screen formatters", () => {
    const screen: DakboardScreen = {
      id: "1",
      name: "Living Room",
      is_default: 1,
      created_at: "2024-01-01",
      updated_at: "2024-06-15",
    }

    const screenDetail: DakboardScreenDetail = {
      ...screen,
      orientation: "landscape",
      width: 1920,
      height: 1080,
      refresh: 300,
      settings: {
        background_color: "#000000",
        custom_css: ".widget { color: red; }",
        font_family: "Roboto",
        timezone: "America/New_York",
      },
    }

    it("should format screen list", () => {
      const result = formatScreenList([screen])
      expect(result).toContain("DAKboard Screens (1)")
      expect(result).toContain("Living Room")
      expect(result).toContain("[Default]")
    })

    it("should format empty screen list", () => {
      expect(formatScreenList([])).toBe("No screens found.")
    })

    it("should format screen detail with custom CSS", () => {
      const result = formatScreenDetail(screenDetail)
      expect(result).toContain("Living Room")
      expect(result).toContain("1920x1080")
      expect(result).toContain("landscape")
      expect(result).toContain("Custom CSS")
    })

    it("should format screen detail without custom CSS", () => {
      const withoutCss: DakboardScreenDetail = {
        ...screenDetail,
        settings: { ...screenDetail.settings, custom_css: undefined },
      }
      const result = formatScreenDetail(withoutCss)
      expect(result).not.toContain("Custom CSS")
    })
  })

  describe("block formatters", () => {
    const block: DakboardBlock = {
      id: "b1",
      screen_id: "s1",
      name: "Weather Widget",
      type: "weather",
      w: 400,
      h: 300,
      x: 10,
      y: 20,
      is_disabled: 0,
      z_index: 1,
      created_at: "2024-01-01",
      updated_at: "2024-06-15",
    }

    const blockDetail: DakboardBlockDetail = {
      ...block,
      text: "Hello World",
      url: "https://example.com",
      location: "Concord, MA",
      photo_urls: ["https://example.com/photo.jpg"],
    }

    it("should format block list", () => {
      const result = formatBlockList([block], "s1")
      expect(result).toContain("Blocks for Screen s1 (1)")
      expect(result).toContain("Weather Widget")
      expect(result).toContain("weather")
      expect(result).toContain("400x300")
    })

    it("should format empty block list", () => {
      expect(formatBlockList([], "s1")).toContain("No blocks found")
    })

    it("should format block detail with all optional fields", () => {
      const result = formatBlockDetail(blockDetail)
      expect(result).toContain("Weather Widget")
      expect(result).toContain("Type: weather")
      expect(result).toContain("Hello World")
      expect(result).toContain("https://example.com")
      expect(result).toContain("Concord, MA")
      expect(result).toContain("photo.jpg")
    })

    it("should format block detail without optional fields", () => {
      const minimal: DakboardBlockDetail = { ...block }
      const result = formatBlockDetail(minimal)
      expect(result).toContain("Weather Widget")
      expect(result).not.toContain("Content")
      expect(result).not.toContain("URL:")
    })
  })

  describe("loop formatters", () => {
    const loop: DakboardLoop = {
      id: "l1",
      name: "Daily Rotation",
      created_at: "2024-01-01",
      updated_at: "2024-06-15",
    }

    const loopDetail: DakboardLoopDetail = {
      ...loop,
      screens: [
        { screen_id: "s1", duration: 30, order: 1 },
        { screen_id: "s2", duration: 60, order: 2 },
      ],
    }

    it("should format loop list", () => {
      const result = formatLoopList([loop])
      expect(result).toContain("DAKboard Loops (1)")
      expect(result).toContain("Daily Rotation")
    })

    it("should format empty loop list", () => {
      expect(formatLoopList([])).toBe("No loops found.")
    })

    it("should format loop detail with screens", () => {
      const result = formatLoopDetail(loopDetail)
      expect(result).toContain("Daily Rotation")
      expect(result).toContain("Screen s1")
      expect(result).toContain("30s")
      expect(result).toContain("Screen s2")
    })

    it("should format loop detail without screens", () => {
      const empty: DakboardLoopDetail = { ...loop, screens: [] }
      const result = formatLoopDetail(empty)
      expect(result).toContain("No screens configured")
    })
  })

  describe("device formatters", () => {
    const device: DakboardDevice = {
      id: "d1",
      name: "Kitchen Pi",
      ip_addr: "192.168.1.100",
      screen_id: "s1",
      serial_num: "ABC123",
      model: "Raspberry Pi 4",
      last_connect: "1718452800",
      created_at: "2024-01-01",
      updated_at: "2024-06-15",
    }

    it("should format device list", () => {
      const result = formatDeviceList([device])
      expect(result).toContain("DAKboard Devices (1)")
      expect(result).toContain("Kitchen Pi")
      expect(result).toContain("192.168.1.100")
    })

    it("should format empty device list", () => {
      expect(formatDeviceList([])).toBe("No devices found.")
    })

    it("should format device detail with all fields", () => {
      const result = formatDeviceDetail(device)
      expect(result).toContain("Kitchen Pi")
      expect(result).toContain("192.168.1.100")
      expect(result).toContain("Raspberry Pi 4")
      expect(result).toContain("ABC123")
      expect(result).toContain("Last Connected")
    })

    it("should format device detail without optional fields", () => {
      const minimal: DakboardDevice = {
        id: "d2",
        name: "New Device",
      }
      const result = formatDeviceDetail(minimal)
      expect(result).toContain("New Device")
      expect(result).not.toContain("IP Address")
      expect(result).not.toContain("Model")
    })
  })

  describe("metric formatters", () => {
    const metric: DakboardMetric = {
      metric_name: "temperature",
      created_at: "2024-01-01",
      updated_at: "2024-06-15",
    }

    const metricDetail: DakboardMetricDetail = {
      ...metric,
      data_points: [{ timestamp: "2024-06-15T12:00:00Z", value: 72, expires: "2024-06-16T12:00:00Z" }, { value: 68 }],
    }

    it("should format metric list", () => {
      const result = formatMetricList([metric])
      expect(result).toContain("DAKboard Metrics (1)")
      expect(result).toContain("temperature")
    })

    it("should format empty metric list", () => {
      expect(formatMetricList([])).toBe("No metrics found.")
    })

    it("should format metric detail with data points", () => {
      const result = formatMetricDetail(metricDetail)
      expect(result).toContain("temperature")
      expect(result).toContain("Data Points (2)")
      expect(result).toContain("72")
      expect(result).toContain("expires")
      expect(result).toContain("68")
    })

    it("should format metric detail without data points", () => {
      const empty: DakboardMetricDetail = { ...metric, data_points: [] }
      const result = formatMetricDetail(empty)
      expect(result).toContain("No data points")
    })
  })
})
