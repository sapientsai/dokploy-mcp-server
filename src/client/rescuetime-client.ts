import { IO, Option, Ref, Try } from "functype"
import { UserError } from "somamcp"

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
  UserRecord,
} from "../types"
import { localDate } from "../utils/dates"
import { resolveZone } from "../utils/time"

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

const KEY_SUGGESTIONS = ["Check RESCUETIME_API_KEY. Get a key at https://www.rescuetime.com/anapi/manage."]

const authError = (detail: string): UserError =>
  new UserError(`RescueTime rejected the API key (${detail}).`, { category: "auth", suggestions: KEY_SUGGESTIONS })

/** RescueTime's docs: 403 means the key is valid but lacks permission for the resource, so don't blame the key. */
const forbiddenError = (): UserError =>
  new UserError(
    "RescueTime refused this request (HTTP 403): the key is valid but lacks permission for this resource.",
    {
      category: "auth",
      suggestions: [],
    },
  )

const rateLimitError = (): UserError =>
  new UserError("Rate limit exceeded. RescueTime allows 60 requests/minute, 1000/hour.", {
    suggestions: ["Wait a minute, then try again."],
  })

function readBody(response: Response): IO<never, never, string> {
  return IO.tryPromise({ try: () => response.text(), catch: toError }).recover("")
}

type ErrorBody = { readonly messages?: unknown; readonly message?: unknown; readonly error?: unknown }

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0

/**
 * RescueTime's own explanation from an error body. The Analytic API sends {"messages":"key not found"};
 * the Resource API sends {"message": …} or {"error":"Not Found"}.
 */
function serverMessage(body: string): string {
  return Try(() => JSON.parse(body) as ErrorBody)
    .toOption()
    .flatMap((j) => Option([j.messages, j.message, j.error].find(isText)))
    .fold(
      () => "",
      (m) => `: ${m.slice(0, 200)}`,
    )
}

/**
 * A bad key reads differently on the two APIs: the Resource API answers 401, while the Analytic Data API
 * answers 400 with {"messages":"key not found"}. A malformed query is also a 400 there, with "query error".
 */
function checkResponse(response: Response): IO<never, Error, Response> {
  if (response.ok) return IO.succeed(response)
  if (response.status === 401) return IO.fail(authError("HTTP 401"))
  if (response.status === 403) return IO.fail(forbiddenError())
  if (response.status === 429) return IO.fail(rateLimitError())
  return readBody(response).flatMap((body) =>
    IO.fail(
      response.status === 400 && body.includes("key not found")
        ? authError("HTTP 400: key not found")
        : new Error(`RescueTime API error: HTTP ${response.status} ${response.statusText}${serverMessage(body)}`),
    ),
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
  private readonly timeZoneCache = Ref<Option<string>>(Option.none())

  constructor(config: RescueTimeClientConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.pollDelayMs = config.pollDelayMs ?? DEFAULT_POLL_DELAY_MS
  }

  private analyticUrl(path: string, withKey: boolean): string {
    const separator = path.includes("?") ? "&" : "?"
    const key = withKey ? `key=${encodeURIComponent(this.apiKey)}&` : ""
    return `${this.baseUrl}${path}${separator}${key}format=json`
  }

  private send(url: string, init: RequestInit): IO<never, Error, Response> {
    return IO.tryPromise({
      try: () => fetch(url, init),
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

  /** Analytic Data API reads send the key as a Bearer header, as RescueTime recommends, never in the URL. */
  private get(path: string): IO<never, Error, Response> {
    return this.send(this.analyticUrl(path, false), { headers: { Authorization: `Bearer ${this.apiKey}` } })
  }

  /**
   * Analytic Data API writes still carry the key in the URL and the form body. Bearer works for its GETs
   * (checked live 2026-11-13); proving it for POSTs would take a real write, so they stay as they were.
   */
  private post(path: string, body: Record<string, string | number | undefined>): IO<never, Error, Response> {
    return this.send(this.analyticUrl(path, true), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formEncode({ ...body, key: this.apiKey }),
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
      highlight_date: params.highlight_date ?? localDate(),
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

  // === Resource API: Account ===

  /**
   * The account's IANA time zone, e.g. "America/New_York", fetched once and cached. A failed lookup gives
   * None, never an error, so no tool fails because of it. Only `time_zone` is read from the user record.
   */
  accountTimeZone(): IO<never, never, Option<string>> {
    const cached = this.timeZoneCache.get()
    if (cached.isSome()) return IO.succeed(cached)
    // Live it is an array of one user; RescueTime's docs show a bare object too, so read either.
    return this.resourceRequest<readonly UserRecord[] | UserRecord>("/users")
      .map((users) => resolveZone((Array.isArray(users) ? users[0] : (users as UserRecord))?.time_zone))
      .tap((zone) => this.timeZoneCache.set(zone))
      .recover(Option.none<string>())
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
