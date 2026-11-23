import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { VERSION as TOOLS_VERSION } from "../src/register.js"
import { VERSION } from "../src/version.js"

// Read from disk, not through the JSON import that src/version.ts uses, so the two can't agree by construction
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }

describe("VERSION", () => {
  it("matches package.json", () => {
    expect(VERSION).toBe(pkg.version)
  })

  it("is exported from the Workers-safe ./tools entry", () => {
    expect(TOOLS_VERSION).toBe(pkg.version)
  })
})
