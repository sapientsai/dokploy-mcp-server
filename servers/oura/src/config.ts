import { Either, Left, Right } from "functype"

/**
 * How the server authenticates to Oura.
 *
 * - `pat`   -> a personal access token sent verbatim as the Bearer token. Oura stopped issuing
 *              new PATs (Dec 2025), but tokens minted before then still work, so this stays as a
 *              fallback for existing installs.
 * - `oauth` -> an OAuth2 confidential client. Only the stable app credentials (`clientId`,
 *              `clientSecret`) come from the env. The access + refresh tokens are obtained once via
 *              the `login` authorization-code flow and then owned and rotated entirely inside the
 *              token store at `tokenStorePath` (see {@link ./oura/auth}); the env never holds a
 *              refresh token, because Oura rotates them on every use.
 */
export type PatAuth = { readonly mode: "pat"; readonly apiKey: string }
export type OAuthAuth = {
  readonly mode: "oauth"
  readonly clientId: string
  readonly clientSecret: string
  readonly tokenUrl: string
  readonly authorizeUrl: string
  readonly redirectUri: string
  readonly scopes: string
  readonly tokenStorePath: string
}
export type AuthConfig = PatAuth | OAuthAuth

/**
 * Resolved runtime configuration for the Oura MCP server.
 *
 * `apiBase` already includes the `usercollection` segment and switches to Oura's `/sandbox/`
 * demo data when `OURA_SANDBOX` is truthy.
 */
export type OuraConfig = {
  readonly auth: AuthConfig
  readonly apiBase: string
  readonly sandbox: boolean
  readonly transportType: "stdio" | "httpStream"
  readonly port: number
  readonly host: string
}

const PROD_BASE = "https://api.ouraring.com/v2/usercollection"
const SANDBOX_BASE = "https://api.ouraring.com/v2/sandbox/usercollection"
const DEFAULT_TOKEN_URL = "https://api.ouraring.com/oauth/token"
const DEFAULT_AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize"
const DEFAULT_REDIRECT_URI = "http://localhost:8080/callback"
// Full read set so every collection the tool exposes works. Notably `heart_health` (vO2_max,
// daily_cardiovascular_age), `stress`, `spo2`, `workout`, `session`, `tag`, `ring_configuration`
// each gate their own endpoints; Oura 401s ("not authorized ... scope") without them.
const DEFAULT_SCOPES = "email personal daily heartrate tag workout session spo2 ring_configuration stress heart_health"

const isTruthy = (value: string | undefined): boolean =>
  value !== undefined && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())

const trimmed = (value: string | undefined): string | undefined => {
  const t = value?.trim()
  return t ? t : undefined
}

/**
 * Default location of the token store, kept pure over `env` (no `os.homedir()` call) so
 * {@link parseConfig} stays deterministic. Honors `XDG_CONFIG_HOME`, then `HOME`/`USERPROFILE`.
 */
const defaultTokenStorePath = (env: NodeJS.ProcessEnv): string => {
  const configHome = trimmed(env.XDG_CONFIG_HOME) ?? `${trimmed(env.HOME) ?? trimmed(env.USERPROFILE) ?? "."}/.config`
  return `${configHome}/oura-ring-mcp/tokens.json`
}

/**
 * Resolve the auth strategy. OAuth wins when its app credentials are present (it is the forward
 * path); otherwise fall back to a PAT. The refresh token is deliberately NOT an env input — it is
 * minted by `login` and lives in the token store. Returns a message listing both options when
 * neither is configured.
 */
const parseAuth = (env: NodeJS.ProcessEnv): Either<string, AuthConfig> => {
  const clientId = trimmed(env.OURA_CLIENT_ID)
  const clientSecret = trimmed(env.OURA_CLIENT_SECRET)
  const apiKey = trimmed(env.OURA_API_KEY)

  if (clientId !== undefined || clientSecret !== undefined) {
    if (!clientId || !clientSecret) {
      return Left(
        "OAuth requires OURA_CLIENT_ID and OURA_CLIENT_SECRET together. " +
          "Register an app at https://cloud.ouraring.com/oauth/applications and set both, " +
          "then run `oura-ring-mcp-server login` to authorize.",
      )
    }
    return Right({
      mode: "oauth",
      clientId,
      clientSecret,
      tokenUrl: trimmed(env.OURA_TOKEN_URL) ?? DEFAULT_TOKEN_URL,
      authorizeUrl: trimmed(env.OURA_AUTHORIZE_URL) ?? DEFAULT_AUTHORIZE_URL,
      redirectUri: trimmed(env.OURA_REDIRECT_URI) ?? DEFAULT_REDIRECT_URI,
      scopes: trimmed(env.OURA_SCOPES) ?? DEFAULT_SCOPES,
      tokenStorePath: trimmed(env.OURA_TOKEN_STORE) ?? defaultTokenStorePath(env),
    })
  }

  if (apiKey) return Right({ mode: "pat", apiKey })

  return Left(
    "No Oura credentials found. Set OURA_API_KEY (personal access token) OR the OAuth pair " +
      "OURA_CLIENT_ID / OURA_CLIENT_SECRET (then run `oura-ring-mcp-server login`). See " +
      "https://cloud.ouraring.com/oauth/applications to create an OAuth app.",
  )
}

/**
 * Parse process env into an {@link OuraConfig}, or an error message describing the first problem.
 * Pure over its `env` argument so it is trivially testable.
 */
export const parseConfig = (env: NodeJS.ProcessEnv): Either<string, OuraConfig> => {
  const authResult = parseAuth(env)
  if (authResult.isLeft()) return Left(authResult.value)

  const rawTransport = (env.TRANSPORT_TYPE ?? "stdio").trim()
  if (rawTransport !== "stdio" && rawTransport !== "httpStream") {
    return Left(`TRANSPORT_TYPE must be "stdio" or "httpStream" (got "${rawTransport}").`)
  }

  const rawPort = env.PORT?.trim()
  const port = rawPort ? Number(rawPort) : 3000
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Left(`PORT must be an integer between 1 and 65535 (got "${rawPort}").`)
  }

  const sandbox = isTruthy(env.OURA_SANDBOX)

  return Right({
    auth: authResult.value,
    apiBase: sandbox ? SANDBOX_BASE : PROD_BASE,
    sandbox,
    transportType: rawTransport,
    port,
    host: env.HOST?.trim() || "0.0.0.0",
  })
}
