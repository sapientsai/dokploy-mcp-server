import { Either, Try } from "functype"

/** How the server signs in to the hub. */
export type BeszelAuth =
  | { readonly kind: "password"; readonly email: string; readonly password: string }
  | { readonly kind: "token"; readonly token: string }

export type BeszelConfig = {
  readonly baseUrl: string
  readonly auth: BeszelAuth
}

// eslint-disable-next-line functype/prefer-option -- the shape of process.env
type Env = Readonly<Record<string, string | undefined>>

const nonEmpty = (value: string | undefined): value is string => value !== undefined && value.trim() !== ""

const parseUrl = (raw: string): Either<string, string> =>
  Try(() => new URL(raw)).fold(
    () => Either.left<string, string>(`BESZEL_URL is not a URL: ${raw}`),
    (url) =>
      url.username !== "" || url.password !== ""
        ? Either.left<string, string>(
            "BESZEL_URL must not carry a user or password; set BESZEL_EMAIL and BESZEL_PASSWORD instead.",
          )
        : url.protocol === "http:" || url.protocol === "https:"
          ? Either.right<string, string>(url.href.replace(/\/+$/, ""))
          : Either.left<string, string>(`BESZEL_URL must start with http:// or https://, not ${url.protocol}`),
  )

const readAuth = (env: Env): Either<string, BeszelAuth> => {
  if (nonEmpty(env.BESZEL_TOKEN)) return Either.right({ kind: "token", token: env.BESZEL_TOKEN.trim() })
  if (nonEmpty(env.BESZEL_EMAIL) && nonEmpty(env.BESZEL_PASSWORD)) {
    return Either.right({ kind: "password", email: env.BESZEL_EMAIL.trim(), password: env.BESZEL_PASSWORD })
  }
  if (nonEmpty(env.BESZEL_EMAIL)) return Either.left("BESZEL_PASSWORD is required with BESZEL_EMAIL.")
  return Either.left("Set BESZEL_EMAIL and BESZEL_PASSWORD, or BESZEL_TOKEN.")
}

/** Reads the hub URL and one way to sign in, or says what's missing. */
export const readConfig = (env: Env): Either<string, BeszelConfig> =>
  (nonEmpty(env.BESZEL_URL)
    ? parseUrl(env.BESZEL_URL.trim())
    : Either.left<string, string>("BESZEL_URL is required, e.g. https://beszel.example.com")
  ).flatMap((baseUrl) => readAuth(env).map((auth) => ({ baseUrl, auth })))
