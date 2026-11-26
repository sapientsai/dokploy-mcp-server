import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKey } from "../../brands"
import { initializeDakboardClient } from "../../client/dakboard-client"
import { getDevice, listDevices, updateDevice } from "../device-tools"

describe("device-tools", () => {
  beforeEach(() => {
    initializeDakboardClient(ApiKey("test-key"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should list devices", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "d1",
            name: "Kitchen Pi",
            ip_addr: "192.168.1.100",
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
          },
        ]),
        { status: 200 },
      ),
    )

    const result = await listDevices()
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("DAKboard Devices")
    expect(result.orThrow()).toContain("Kitchen Pi")
  })

  it("should get device detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "d1",
          name: "Kitchen Pi",
          ip_addr: "192.168.1.100",
          screen_id: "s1",
          model: "Raspberry Pi 4",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        }),
        { status: 200 },
      ),
    )

    const result = await getDevice({ device_id: "d1" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("Kitchen Pi")
    expect(result.orThrow()).toContain("192.168.1.100")
    expect(result.orThrow()).toContain("Raspberry Pi 4")
  })

  it("should update device", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "d1",
          name: "Updated Pi",
          ip_addr: "192.168.1.200",
          created_at: "2024-01-01",
          updated_at: "2024-01-02",
        }),
        { status: 200 },
      ),
    )

    const result = await updateDevice({ device_id: "d1", name: "Updated Pi" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("updated successfully")
    expect(result.orThrow()).toContain("Updated Pi")
  })

  it("should return Left on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Error", { status: 403, statusText: "Forbidden" }))

    const result = await listDevices()
    expect(result.isLeft()).toBe(true)
    result.fold(
      (e) => expect(e.message).toContain("Failed to list devices"),
      () => expect.unreachable("should be Left"),
    )
  })
})
