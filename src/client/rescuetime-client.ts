import { IO, Left, Option, Right } from "functype"

import { toError } from "../errors"
import type {
  AnalyticDataParams,
  AnalyticDataResponse,
  DailySummary,
  FocusSessionEvent,
  Highlight,
  OfflineTimeParams,
  PostHighlightParams,
  RescueTimeClientConfig,
} from "../types"

const DEFAULT_BASE_URL = "https://www.rescuetime.com"

let clientInstance: Option<RescueTimeClient> = Option.none()

export function initializeClient(config: RescueTimeClientConfig): RescueTimeClient {
  const client = new RescueTimeClient(config)
  clientInstance = Option(client)
  return client
}

export function getClient(): Option<RescueTimeClient> {
  return clientInstance
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")
}

function formEncode(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")
}

export class RescueTimeClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(config: RescueTimeClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  }

  private makeRequest(path: string, options: RequestInit = {}): IO<never, Error, Response> {
    const separator = path.includes("?") ? "&" : "?"
    const url = `${this.baseUrl}${path}${separator}key=${this.apiKey}&format=json`

    return IO.tryPromise({
      try: () => fetch(url, options),
      catch: toError,
    }).flatMap((response) =>
      IO.fromEither(
        response.status === 429
          ? Left<Error, Response>(new Error("Rate limit exceeded. RescueTime allows 60 requests/minute, 1000/hour."))
          : !response.ok
            ? Left<Error, Response>(new Error(`RescueTime API error: HTTP ${response.status} ${response.statusText}`))
            : Right<Error, Response>(response),
      ),
    )
  }

  private get(path: string): IO<never, Error, Response> {
    return this.makeRequest(path)
  }

  private post(path: string, body: Record<string, string | number | undefined>): IO<never, Error, Response> {
    const encoded = formEncode({ ...body, key: this.apiKey })
    return this.makeRequest(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encoded,
    })
  }

  private getJson<T>(path: string): IO<never, Error, T> {
    return this.get(path).flatMap((r) =>
      IO.tryPromise({
        try: () => r.json() as Promise<T>,
        catch: toError,
      }),
    )
  }

  // === Analytics ===

  getAnalyticData(params: AnalyticDataParams): IO<never, Error, AnalyticDataResponse> {
    const query = buildQuery(params as Record<string, string | number | undefined>)
    const path = query ? `/anapi/data?${query}` : "/anapi/data"
    return this.getJson<AnalyticDataResponse>(path)
  }

  getDailySummary(): IO<never, Error, readonly DailySummary[]> {
    return this.getJson<readonly DailySummary[]>("/anapi/daily_summary_feed")
  }

  // === Highlights ===

  getHighlights(): IO<never, Error, readonly Highlight[]> {
    return this.getJson<readonly Highlight[]>("/anapi/highlights_feed")
  }

  postHighlight(params: PostHighlightParams): IO<never, Error, Highlight> {
    return this.post("/anapi/highlights_post", {
      highlight_date: params.highlight_date,
      description: params.description,
      source: params.source,
    }).flatMap((r) =>
      IO.tryPromise({
        try: () => r.json() as Promise<Highlight>,
        catch: toError,
      }),
    )
  }

  // === Focus Sessions ===

  startFocusSession(duration: number): IO<never, Error, undefined> {
    return this.post("/anapi/start_focustime", { duration }).map(() => undefined)
  }

  endFocusSession(): IO<never, Error, undefined> {
    return this.post("/anapi/end_focustime", {}).map(() => undefined)
  }

  getFocusSessionsStarted(): IO<never, Error, readonly FocusSessionEvent[]> {
    return this.getJson<readonly FocusSessionEvent[]>("/anapi/focustime_started_feed")
  }

  getFocusSessionsEnded(): IO<never, Error, readonly FocusSessionEvent[]> {
    return this.getJson<readonly FocusSessionEvent[]>("/anapi/focustime_ended_feed")
  }

  // === Offline Time ===

  logOfflineTime(params: OfflineTimeParams): IO<never, Error, undefined> {
    return this.post("/anapi/offline_time_post", {
      start_time: params.start_time,
      end_time: params.end_time,
      duration: params.duration,
      activity_name: params.activity_name,
      activity_details: params.activity_details,
    }).map(() => undefined)
  }
}
