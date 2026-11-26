import { UserError } from "somamcp"

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)))

/** Report a tool failure to the client as-is, so SomaMCP doesn't label it an internal server error. */
export const toUserError = (e: Error): UserError => (e instanceof UserError ? e : new UserError(e.message))

const PASSWORD_HINT = "Check BESZEL_EMAIL and BESZEL_PASSWORD."
const TOKEN_HINT = "BESZEL_TOKEN may have expired. Mint a new one, or sign in with BESZEL_EMAIL and BESZEL_PASSWORD."

export const wrongCredentials = (): UserError =>
  new UserError("Beszel refused the sign-in: wrong email or password (HTTP 400).", {
    category: "auth",
    suggestions: [PASSWORD_HINT],
  })

export const mfaRequired = (): UserError =>
  new UserError("This Beszel user has multi-factor sign-in on, which this server can't complete (HTTP 401).", {
    category: "auth",
    suggestions: ["Use a user without MFA, or set BESZEL_TOKEN to a token minted for this user."],
  })

export const passwordSignInRefused = (detail: string): UserError =>
  new UserError(`Beszel doesn't allow password sign-in for this user (HTTP 403${detail}).`, {
    category: "auth",
    suggestions: ["The hub may run with DISABLE_PASSWORD_AUTH=true. Set BESZEL_TOKEN instead."],
  })

export const tokenRefused = (usingToken: boolean): UserError =>
  new UserError("Beszel no longer accepts this server's sign-in token (HTTP 401).", {
    category: "auth",
    suggestions: [usingToken ? TOKEN_HINT : PASSWORD_HINT],
  })

/**
 * PocketBase answers 403 on a list only when the collection has no list rule, i.e. superusers only.
 * A system the user isn't shared on gives no 403: its records just don't come back.
 */
export const forbidden = (collection: string): UserError =>
  new UserError(`This hub lets only superusers list ${collection} (HTTP 403).`, {
    category: "auth",
    suggestions: [
      "A newer Beszel may have changed this collection's access rules. This server was checked against Beszel 0.21.",
    ],
  })

export const rateLimited = (): UserError =>
  new UserError("The Beszel hub is rate-limiting requests (HTTP 429).", {
    suggestions: ["Wait a minute, then try again. The hub allows 10 sign-ins a minute."],
  })

export const unreachable = (baseUrl: string, cause: Error): UserError =>
  new UserError(`Couldn't reach the Beszel hub at ${baseUrl}: ${cause.message}`, {
    suggestions: ["Check BESZEL_URL, and that the hub is running."],
  })

/**
 * Beszel's rules let a user change a system only when it's shared with them, and never when their role is
 * `readonly`. PocketBase then answers 404 (the rule hides the record) or 403 (only superusers may).
 */
export const writeRefused = (collection: string, id: string, status: number): UserError =>
  new UserError(`Beszel refused to change ${collection} record ${id} (HTTP ${status}).`, {
    category: "auth",
    suggestions: [
      "A Beszel user with the readonly role can't change anything. Sign in as a user with the user or admin role.",
      "A user can change only the systems shared with it.",
    ],
  })

export const writeInvalid = (collection: string, problems: ReadonlyArray<string>): UserError =>
  new UserError(
    `Beszel refused the ${collection} change as invalid (HTTP 400)${problems.length === 0 ? "." : `: ${problems.join("; ")}`}`,
  )
