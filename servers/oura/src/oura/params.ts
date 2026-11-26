import { z } from "zod"

import { COLLECTION_NAMES, getCollection } from "./collections"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

const dateString = z
  .string()
  .regex(DATE_RE, "Expected a calendar date in YYYY-MM-DD format.")
  .describe("Calendar date, YYYY-MM-DD")

const dateTimeString = z
  .string()
  .regex(DATETIME_RE, "Expected an ISO-8601 datetime, e.g. 2026-06-01T00:00:00+00:00.")
  .describe("ISO-8601 datetime, e.g. 2026-06-01T00:00:00+00:00")

/**
 * Parameters for the consolidated `oura_data` tool.
 *
 * A single schema spans every Oura collection; `superRefine` enforces which fields are
 * legal for the chosen collection (daily vs datetime vs singleton) and returns
 * LLM-actionable messages when they are combined incorrectly.
 */
export const ouraDataParams = z
  .object({
    collection: z
      .enum(COLLECTION_NAMES)
      .describe("Which Oura data collection to fetch. Determines which date parameters apply."),
    start_date: dateString.optional().describe("Start date (inclusive) for daily collections."),
    end_date: dateString.optional().describe("End date (inclusive) for daily collections."),
    start_datetime: dateTimeString
      .optional()
      .describe("Start datetime for time-series collections (heartrate, ring_battery_level)."),
    end_datetime: dateTimeString.optional().describe("End datetime for time-series collections."),
    document_id: z
      .string()
      .optional()
      .describe("Fetch a single document by id instead of a list. Not supported by all collections."),
    next_token: z
      .string()
      .optional()
      .describe("Pagination cursor returned as `next_token` by a previous list response."),
    latest: z
      .boolean()
      .optional()
      .describe("Return only the most recent sample (heartrate / ring_battery_level only)."),
    fields: z
      .string()
      .optional()
      .describe("Comma-separated sparse fieldset to limit returned fields (list endpoints only)."),
  })
  .superRefine((val, ctx) => {
    const descriptor = getCollection(val.collection)
    if (!descriptor) {
      // z.enum already guards this; kept for exhaustiveness.
      ctx.addIssue({ code: "custom", message: `Unknown collection "${val.collection}".`, path: ["collection"] })
      return
    }

    const reject = (field: keyof typeof val, message: string) => {
      if (val[field] !== undefined) ctx.addIssue({ code: "custom", message, path: [field] })
    }

    const byIdRequested = val.document_id !== undefined

    if (byIdRequested) {
      if (!descriptor.byId) {
        reject("document_id", `The "${val.collection}" collection does not support fetching a single document by id.`)
      }
      // A by-id lookup ignores every list-shaped parameter; reject to avoid silent surprises.
      reject("start_date", "Do not combine document_id with start_date; a by-id lookup returns one document.")
      reject("end_date", "Do not combine document_id with end_date; a by-id lookup returns one document.")
      reject("start_datetime", "Do not combine document_id with start_datetime.")
      reject("end_datetime", "Do not combine document_id with end_datetime.")
      reject("next_token", "Do not combine document_id with next_token.")
      reject("latest", "Do not combine document_id with latest.")
      reject("fields", "Do not combine document_id with fields.")
      return
    }

    switch (descriptor.kind) {
      case "singleton":
        reject("start_date", `The "${val.collection}" collection takes no parameters.`)
        reject("end_date", `The "${val.collection}" collection takes no parameters.`)
        reject("start_datetime", `The "${val.collection}" collection takes no parameters.`)
        reject("end_datetime", `The "${val.collection}" collection takes no parameters.`)
        reject("next_token", `The "${val.collection}" collection takes no parameters.`)
        reject("latest", `The "${val.collection}" collection takes no parameters.`)
        reject("fields", `The "${val.collection}" collection takes no parameters.`)
        break
      case "listOnly":
        reject("start_date", `The "${val.collection}" collection is not filtered by date.`)
        reject("end_date", `The "${val.collection}" collection is not filtered by date.`)
        reject("start_datetime", `The "${val.collection}" collection is not filtered by date.`)
        reject("end_datetime", `The "${val.collection}" collection is not filtered by date.`)
        reject("latest", `The "${val.collection}" collection does not support latest.`)
        break
      case "daily":
        reject("start_datetime", `The "${val.collection}" collection uses start_date/end_date, not datetimes.`)
        reject("end_datetime", `The "${val.collection}" collection uses start_date/end_date, not datetimes.`)
        reject("latest", `The "${val.collection}" collection does not support latest.`)
        break
      case "datetime":
        reject("start_date", `The "${val.collection}" collection uses start_datetime/end_datetime, not dates.`)
        reject("end_date", `The "${val.collection}" collection uses start_datetime/end_datetime, not dates.`)
        break
    }
  })

export type OuraDataParams = z.infer<typeof ouraDataParams>
