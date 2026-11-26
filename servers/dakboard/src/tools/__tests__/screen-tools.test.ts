import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiKey } from "../../brands"
import { initializeDakboardClient } from "../../client/dakboard-client"
import { getScreen, listScreens, updateScreen } from "../screen-tools"

describe("screen-tools", () => {
  beforeEach(() => {
    initializeDakboardClient(ApiKey("test-key"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should list screens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([{ id: "1", name: "Main", is_default: 1, created_at: "2024-01-01", updated_at: "2024-01-01" }]),
        { status: 200 },
      ),
    )

    const result = await listScreens()
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("DAKboard Screens")
    expect(result.orThrow()).toContain("Main")
  })

  it("should get screen detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          name: "Main",
          is_default: 1,
          orientation: "landscape",
          width: 1920,
          height: 1080,
          refresh: 300,
          background_color: "#000",
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        }),
        { status: 200 },
      ),
    )

    const result = await getScreen({ screen_id: "1" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("Main")
    expect(result.orThrow()).toContain("1920x1080")
  })

  it("should update screen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          name: "Updated",
          is_default: 0,
          orientation: "portrait",
          width: 1080,
          height: 1920,
          refresh: 600,
          background_color: "#fff",
          created_at: "2024-01-01",
          updated_at: "2024-01-02",
        }),
        { status: 200 },
      ),
    )

    const result = await updateScreen({ screen_id: "1", name: "Updated" })
    expect(result.isRight()).toBe(true)
    expect(result.orThrow()).toContain("updated successfully")
    expect(result.orThrow()).toContain("Updated")
  })

  it("should return Left on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Not Found", { status: 404, statusText: "Not Found" }))

    const result = await listScreens()
    expect(result.isLeft()).toBe(true)
    result.fold(
      (e) => expect(e.message).toContain("Failed to list screens"),
      () => expect.unreachable("should be Left"),
    )
  })
})
