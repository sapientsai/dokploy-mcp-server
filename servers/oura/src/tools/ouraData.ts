import { UserError } from "somamcp"

import type { OuraConfig } from "../config"
import { createTokenProvider } from "../oura/auth"
import { type RequestDeps, requestOura } from "../oura/client"
import { COLLECTIONS } from "../oura/collections"
import { type OuraDataParams, ouraDataParams } from "../oura/params"

const collectionCatalogue = COLLECTIONS.map((c) => `- ${c.name}: ${c.description}`).join("\n")

const DESCRIPTION = `Fetch data from the Oura Ring API v2.

Pick a \`collection\` and provide the matching date range:
- Daily collections use \`start_date\`/\`end_date\` (YYYY-MM-DD). If both are omitted, the last 7 days are returned.
- Time-series collections (heartrate, ring_battery_level) use \`start_datetime\`/\`end_datetime\` (ISO-8601), or \`latest: true\`.
- \`personal_info\` takes no parameters; \`ring_configuration\` is a plain list.
- Any list collection with a document id can be fetched directly via \`document_id\`.
Large lists paginate: pass the returned \`next_token\` to fetch the next page.

Available collections:
${collectionCatalogue}`

/**
 * Build the consolidated `oura_data` tool bound to a resolved config.
 * `deps` is injectable so tests can supply a fake fetch and clock.
 */
export const createOuraDataTool = (config: OuraConfig, deps: RequestDeps = {}) => {
  // Build the token provider once so OAuth token caching and single-flight refresh persist
  // across tool calls (a fresh provider per request would re-load and risk double-refresh).
  const tokenProvider = deps.tokenProvider ?? createTokenProvider(config.auth, deps)
  const requestDeps: RequestDeps = { ...deps, tokenProvider }

  return {
    name: "oura_data",
    description: DESCRIPTION,
    parameters: ouraDataParams,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      title: "Oura Ring data",
    },
    execute: async (args: OuraDataParams) => {
      const result = await requestOura(config, args, requestDeps)
      return result.fold(
        (err) => {
          throw new UserError(err.message)
        },
        (data) => JSON.stringify(data, null, 2),
      )
    },
  }
}
