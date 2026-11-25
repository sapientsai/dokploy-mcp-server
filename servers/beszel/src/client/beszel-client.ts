import { IO, Option, Ref, Try } from "functype"
import { UserError } from "somamcp"

import type { BeszelConfig } from "../config"
import {
  forbidden,
  mfaRequired,
  passwordSignInRefused,
  rateLimited,
  toError,
  tokenRefused,
  unreachable,
  wrongCredentials,
} from "../errors"
import type { ListResult } from "../types"

/** Sign in again this long before the token's `exp`, so a call never goes out on a token about to lapse. */
const REFRESH_MARGIN_MS = 60_000
/** PocketBase caps `perPage` at 1,000. */
const PAGE_SIZE = 500
/** A list never reads more than this many records, whatever the hub holds. */
const DEFAULT_MAX_ITEMS = 5_000

export type ListQuery = {
  readonly filter?: string
  readonly sort?: string
  readonly fields?: string
  readonly page?: number
  readonly perPage?: number
}

type Session = { readonly token: string; readonly expiresAt: Option<number> }

type ErrorBody = { readonly message?: unknown; readonly mfaId?: unknown }

/** The `exp` claim of a PocketBase JWT, in milliseconds. */
export const tokenExpiry = (token: string): Option<number> =>
  Try(() => {
    const payload = token.split(".")[1] ?? ""
    const json = atob(payload.replaceAll("-", "+").replaceAll("_", "/"))
    return (JSON.parse(json) as { readonly exp?: unknown }).exp
  })
    .toOption()
    .flatMap((exp) => (typeof exp === "number" && Number.isFinite(exp) ? Option(exp * 1000) : Option.none<number>()))

const readBody = (response: Response): IO<never, never, ErrorBody> =>
  IO.tryPromise({ try: () => response.text(), catch: toError })
    .map((text) =>
      Try(() => JSON.parse(text) as unknown)
        .toOption()
        .fold(
          (): ErrorBody => ({}),
          (json) => (typeof json === "object" && json !== null ? (json as ErrorBody) : {}),
        ),
    )
    .recover({})

const messageOf = (body: ErrorBody): string =>
  typeof body.message === "string" && body.message !== "" ? `: ${body.message.slice(0, 200)}` : ""

const queryString = (query: ListQuery): string =>
  Object.entries({
    page: query.page,
    perPage: query.perPage,
    sort: query.sort,
    filter: query.filter,
    fields: query.fields,
  })
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&")

export class BeszelClient {
  private readonly session = Ref<Option<Session>>(Option.none())
  private readonly signingIn = Ref<Option<Promise<string>>>(Option.none())

  constructor(
    private readonly config: BeszelConfig,
    private readonly now: () => number = Date.now,
  ) {
    if (config.auth.kind === "token") {
      this.session.set(Option({ token: config.auth.token, expiresAt: tokenExpiry(config.auth.token) }))
    }
  }

  get baseUrl(): string {
    return this.config.baseUrl
  }

  /** One page of a collection's records. */
  list<T>(collection: string, query: ListQuery = {}): IO<never, Error, ListResult<T>> {
    const qs = queryString({ perPage: PAGE_SIZE, ...query })
    return this.authorized(`/api/collections/${collection}/records?${qs}`, collection).map(
      (body) => body as ListResult<T>,
    )
  }

  /** Every record that matches, page by page, up to `maxItems`. */
  listAll<T>(
    collection: string,
    query: ListQuery = {},
    maxItems = DEFAULT_MAX_ITEMS,
  ): IO<never, Error, ReadonlyArray<T>> {
    const step = (page: number, acc: ReadonlyArray<T>): IO<never, Error, ReadonlyArray<T>> =>
      this.list<T>(collection, { ...query, page, perPage: PAGE_SIZE }).flatMap((result) => {
        const items = acc.concat(result.items)
        const done = page >= result.totalPages || result.items.length < PAGE_SIZE || items.length >= maxItems
        return done ? IO.succeed(items.slice(0, maxItems)) : step(page + 1, items)
      })
    return step(1, [])
  }

  private send(path: string, token: string): IO<never, Error, Response> {
    return IO.tryPromise({
      try: () =>
        fetch(`${this.config.baseUrl}${path}`, { headers: { Authorization: token, Accept: "application/json" } }),
      catch: (e) => unreachable(this.config.baseUrl, toError(e)),
    })
  }

  /** A records request, signing in first if needed, and once more if the hub refuses the token. */
  private authorized(path: string, collection: string): IO<never, Error, unknown> {
    const usingPassword = this.config.auth.kind === "password"
    return this.currentToken()
      .flatMap((token) => this.send(path, token))
      .flatMap((response) => {
        if (response.status !== 401) return IO.succeed(response)
        if (!usingPassword) return IO.fail<Error>(tokenRefused(true))
        this.session.set(Option.none())
        return this.currentToken()
          .flatMap((token) => this.send(path, token))
          .flatMap((retry) => (retry.status === 401 ? IO.fail<Error>(tokenRefused(false)) : IO.succeed(retry)))
      })
      .flatMap((response) => this.checkResponse(response, collection))
  }

  private checkResponse(response: Response, collection: string): IO<never, Error, unknown> {
    if (response.ok) return IO.tryPromise({ try: () => response.json() as Promise<unknown>, catch: toError })
    if (response.status === 403) return IO.fail(forbidden(collection))
    if (response.status === 429) return IO.fail(rateLimited())
    return readBody(response).flatMap((body) =>
      IO.fail(
        response.status === 404
          ? new UserError(
              `The hub has no ${collection} collection (HTTP 404). This server was checked against Beszel 0.21.`,
            )
          : new Error(`Beszel answered HTTP ${response.status} for ${collection}${messageOf(body)}`),
      ),
    )
  }

  private currentToken(): IO<never, Error, string> {
    const fresh = this.session.get().filter((s) =>
      s.expiresAt.fold(
        () => true,
        (exp) => exp - REFRESH_MARGIN_MS > this.now(),
      ),
    )
    if (fresh.isSome() || this.config.auth.kind === "token") {
      // A configured token is used even past its `exp`; the hub's 401 then says to mint a new one.
      return IO.succeed(
        this.session.get().fold(
          () => "",
          (s) => s.token,
        ),
      )
    }
    return IO.tryPromise({ try: () => this.sharedSignIn(), catch: toError })
  }

  /** Concurrent calls share one sign-in: the hub allows only 10 a minute. */
  private sharedSignIn(): Promise<string> {
    return this.signingIn.get().fold(
      () => {
        const pending = this.signIn()
          .runOrThrow()
          .finally(() => this.signingIn.set(Option.none()))
        this.signingIn.set(Option(pending))
        return pending
      },
      (pending) => pending,
    )
  }

  private signIn(): IO<never, Error, string> {
    const { auth } = this.config
    if (auth.kind !== "password") return IO.fail(tokenRefused(true))
    return IO.tryPromise({
      try: () =>
        fetch(`${this.config.baseUrl}/api/collections/users/auth-with-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ identity: auth.email, password: auth.password }),
        }),
      catch: (e) => unreachable(this.config.baseUrl, toError(e)),
    }).flatMap((response) => {
      if (response.ok) {
        return IO.tryPromise({
          try: () => response.json() as Promise<{ readonly token?: unknown }>,
          catch: toError,
        }).flatMap((body) =>
          typeof body.token === "string" && body.token !== ""
            ? IO.succeed(body.token).tap((token) => this.session.set(Option({ token, expiresAt: tokenExpiry(token) })))
            : IO.fail<Error>(new Error("Beszel's sign-in answer had no token.")),
        )
      }
      if (response.status === 429) return IO.fail<Error>(rateLimited())
      return readBody(response).flatMap((body) => {
        if (response.status === 400) return IO.fail<Error>(wrongCredentials())
        if (response.status === 401 && body.mfaId !== undefined) return IO.fail<Error>(mfaRequired())
        if (response.status === 403) return IO.fail<Error>(passwordSignInRefused(messageOf(body)))
        return IO.fail<Error>(new Error(`Beszel sign-in failed with HTTP ${response.status}${messageOf(body)}`))
      })
    })
  }
}

const clientInstance = Ref<Option<BeszelClient>>(Option.none())

export function initializeClient(config: BeszelConfig, now?: () => number): BeszelClient {
  const client = new BeszelClient(config, now)
  clientInstance.set(Option(client))
  return client
}

export function getClient(): Option<BeszelClient> {
  return clientInstance.get()
}
