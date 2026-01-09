import { describe, expect, it } from "vitest"

import { createOpenFDAServer } from "../src/server.js"
import { toolSchemas } from "../src/tools/index.js"

describe("OpenFDA MCP Server", () => {
  it("should create server with default options", () => {
    const server = createOpenFDAServer()
    expect(server).toBeDefined()
  })

  it("should create server with custom options", () => {
    const server = createOpenFDAServer({
      name: "test-server",
      version: "1.0.0",
    })
    expect(server).toBeDefined()
  })
})

describe("Tool Schemas", () => {
  it("should have all 10 tool schemas defined", () => {
    expect(Object.keys(toolSchemas)).toHaveLength(10)
  })

  it("should validate drug adverse events schema", () => {
    const validParams = {
      drugName: "aspirin",
      serious: true,
      limit: 10,
    }
    const result = toolSchemas.searchDrugAdverseEvents.safeParse(validParams)
    expect(result.success).toBe(true)
  })

  it("should reject invalid limit in schema", () => {
    const invalidParams = {
      limit: 200, // Max is 100
    }
    const result = toolSchemas.searchDrugAdverseEvents.safeParse(invalidParams)
    expect(result.success).toBe(false)
  })

  it("should validate device 510k schema", () => {
    const validParams = {
      deviceName: "pacemaker",
      applicant: "Medtronic",
    }
    const result = toolSchemas.searchDevice510K.safeParse(validParams)
    expect(result.success).toBe(true)
  })

  it("should validate device classification schema with enum", () => {
    const validParams = {
      deviceClass: "2",
    }
    const result = toolSchemas.searchDeviceClassifications.safeParse(validParams)
    expect(result.success).toBe(true)
  })

  it("should reject invalid device class", () => {
    const invalidParams = {
      deviceClass: "4", // Only 1, 2, 3 are valid
    }
    const result = toolSchemas.searchDeviceClassifications.safeParse(invalidParams)
    expect(result.success).toBe(false)
  })
})
