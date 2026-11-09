import { IO, Left, Option, Ref, Right } from "functype"

import { toError } from "../errors"
import type {
  AnalyticDataParams,
  AnalyticDataResponse,
  DailySummary,
  FocusSessionEvent,
  GlobalState,
  Highlight,
  OfflineTimeParams,
  PostHighlightParams,
  Project,
  ProjectTimesResponse,
  RescueTimeClientConfig,
  StartTimerParams,
  StopSessionResponse,
  TimelineResponse,
} from "../types"

const DEFAULT_BASE_URL = "https://www.rescuetime.com"
const DEFAULT_POLL_DELAY_MS = 1000
/** Polls of an in-flight project-time job before returning the partial result. */
const MAX_PROJECT_TIME_POLLS = 5

const clientInstance = Ref<Option<RescueTimeClient>>(Option.none())

export function initializeClient(config: RescueTimeClientConfig): RescueTimeClient {
  const client = new RescueTimeClient(config)
  clientInstance.set(Option(client))
  return client
}

export function getClient(): Option<RescueTimeClient> {
  return clientInstance.get()
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")
}

function checkResponse(response: Response): IO<never, Error, Response> {
  return IO.fromEither(
    response.status === 429
      ? Left<Error, Response>(new Error("Rate limit exceeded. RescueTime allows 60 requests/minute, 1000/hour."))
      : !response.ok
        ? Left<Error, Response>(new Error(`RescueTime API error: HTTP ${response.status} ${response.statusText}`))
        : Right<Error, Response>(response),
  )
}

function parseJson<T>(response: Response): IO<never, Error, T> {
  return IO.tryPromise({
    try: () => response.json() as Promise<T>,
    catch: toError,
  })
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
  private readonly pollDelayMs: number

  constructor(config: RescueTimeClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.pollDelayMs = config.pollDelayMs ?? DEFAULT_POLL_DELAY_MS
  }

  private makeRequest(path: string, options: RequestInit = {}): IO<never, Error, Response> {
    const separator = path.includes("?") ? "&" : "?"
    const url = `${this.baseUrl}${path}${separator}key=${this.apiKey}&format=json`

    return IO.tryPromise({
      try: () => fetch(url, options),
      catch: toError,
    }).flatMap(checkResponse)
  }

  /** Resource API (`/api/resource/*`): Bearer auth and JSON bodies, with no key in the URL. */
  private resourceRequest<T>(path: string, init: RequestInit = {}): IO<never, Error, T> {
    return IO.tryPromise({
      try: () =>
        fetch(`${this.baseUrl}/api/resource${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json", ...init.headers },
        }),
      catch: toError,
    })
      .flatMap(checkResponse)
      .flatMap((r) => parseJson<T>(r))
  }

  private resourcePost<T>(path: string, body: Record<string, unknown> = {}): IO<never, Error, T> {
    return this.resourceRequest<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
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
    return this.get(path).flatMap((r) => parseJson<T>(r))
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

  postHighlight(params: PostHighlightParams): IO<never, Error, undefined> {
    return this.post("/anapi/highlights_post", {
      highlight_date: params.highlight_date ?? new Date().toISOString().slice(0, 10),
      description: params.description,
      source: params.source,
    }).map(() => undefined)
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
      activity_name: params.activity_name,
      activity_details: params.activity_details,
    }).map(() => undefined)
  }

  // === Resource API: Focus State and Timers ===

  getFocusState(): IO<never, Error, readonly GlobalState[]> {
    return this.resourceRequest<readonly GlobalState[]>("/user_global_states")
  }

  /** An open-ended timer (RescueTime's 24h default) that never blocks apps or sites. */
  startTimer(params: StartTimerParams): IO<never, Error, GlobalState> {
    return this.resourcePost<GlobalState>("/focus/start_session", {
      is_timer: true,
      block_apps_sites: false,
      block_comms: false,
      label_name: params.label_name,
      v2_project_id: params.v2_project_id,
      task_id: params.task_id,
    })
  }

  stopSession(): IO<never, Error, StopSessionResponse> {
    return this.resourcePost<StopSessionResponse>("/focus/cancel_or_stop_session")
  }

  // === Resource API: Projects and Project Time ===

  getProjects(): IO<never, Error, readonly Project[]> {
    return this.resourceRequest<readonly Project[]>("/v2_projects")
  }

  /**
   * One day of project time; omit the date for the account's current local day.
   * RescueTime rejects multi-day windows with HTTP 500, so callers loop by day.
   */
  getProjectTimes(date?: string): IO<never, Error, ProjectTimesResponse> {
    const fetchDay = (jobId?: number) => {
      const query = buildQuery({ date, job_id: jobId })
      return this.resourceRequest<ProjectTimesResponse>(`/labeled_time_project_times${query ? `?${query}` : ""}`)
    }

    const poll = (response: ProjectTimesResponse, attempt: number): IO<never, Error, ProjectTimesResponse> =>
      response.is_complete || response.job_id === null || attempt >= MAX_PROJECT_TIME_POLLS
        ? IO.succeed(response)
        : fetchDay(response.job_id)
            .delay(this.pollDelayMs)
            .flatMap((next) => poll(next, attempt + 1))

    return fetchDay().flatMap((first) => poll(first, 0))
  }

  // === Resource API: Timeline ===

  /** Omit the date to get the account's current local day. */
  getTimeline(date?: string): IO<never, Error, TimelineResponse> {
    const path = date === undefined ? "/timeline/activities" : `/timeline/activities/${encodeURIComponent(date)}`
    return this.resourceRequest<TimelineResponse>(path)
  }
}
