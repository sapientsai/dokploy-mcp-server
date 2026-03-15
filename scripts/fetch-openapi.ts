/**
 * Fetches the OpenAPI spec from a running Dokploy instance.
 *
 * Usage: npx tsx scripts/fetch-openapi.ts
 *
 * Requires DOKPLOY_URL and DOKPLOY_API_KEY environment variables.
 */

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

import dotenv from "dotenv"

dotenv.config()

const baseUrl = process.env.DOKPLOY_URL
const apiKey = process.env.DOKPLOY_API_KEY

if (!baseUrl || !apiKey) {
  console.error("DOKPLOY_URL and DOKPLOY_API_KEY must be set in .env")
  process.exit(1)
}

const url = `${baseUrl}/trpc/settings.getOpenApiDocument`
console.error(`Fetching OpenAPI spec from ${url}...`)

const response = await fetch(url, {
  headers: { "x-api-key": apiKey, Accept: "application/json" },
})

if (!response.ok) {
  console.error(`Failed: ${response.status} ${response.statusText}`)
  const text = await response.text()
  console.error(text)
  process.exit(1)
}

const envelope = (await response.json()) as { result: { data: { json: unknown } } }
const spec = envelope.result.data.json

const outPath = resolve(import.meta.dirname, "..", "openapi.json")
writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n")
console.error(`Written to ${outPath} (${(JSON.stringify(spec).length / 1024).toFixed(0)} KB)`)
