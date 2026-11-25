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

export const forbidden = (collection: string): UserError =>
  new UserError(`This Beszel user can't read ${collection} (HTTP 403).`, {
    category: "auth",
    suggestions: ["Give the user access to the system, or use a user with the readonly or admin role."],
  })

export const rateLimited = (): UserError =>
  new UserError("The Beszel hub is rate-limiting requests (HTTP 429).", {
    suggestions: ["Wait a minute, then try again. The hub allows 10 sign-ins a minute."],
  })

export const unreachable = (baseUrl: string, cause: Error): UserError =>
  new UserError(`Couldn't reach the Beszel hub at ${baseUrl}: ${cause.message}`, {
    suggestions: ["Check BESZEL_URL, and that the hub is running."],
  })
