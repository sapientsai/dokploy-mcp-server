import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

import { Either, Left, Right } from "functype"

import type { OAuthAuth } from "./config"
import { type AuthDeps, exchangeAuthCode, type TokenSet, writeTokenStore } from "./oura/auth"
import type { OuraError } from "./oura/client"

/** Build the Oura authorization URL for the browser consent step. Pure and unit-testable. */
export const buildAuthorizeUrl = (auth: OAuthAuth, state: string): string => {
  const url = new URL(auth.authorizeUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", auth.clientId)
  url.searchParams.set("redirect_uri", auth.redirectUri)
  url.searchParams.set("scope", auth.scopes)
  url.searchParams.set("state", state)
  return url.toString()
}

/** Best-effort open of a URL in the user's browser. Never throws; the URL is also printed. */
const openBrowser = (url: string): void => {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref()
  } catch {
    // Ignore — the user can open the printed URL manually.
  }
}

export type LoginDeps = AuthDeps & {
  /** Override the browser opener (tests / headless). */
  readonly open?: (url: string) => void
  readonly log?: (message: string) => void
}

const HTML_OK =
  "<html><body style='font-family:sans-serif'><h2>Oura authorization complete</h2>" +
  "<p>You can close this tab and return to the terminal.</p></body></html>"

/**
 * Run the one-time authorization-code flow: print + open the consent URL, capture the redirect on
 * a local one-shot HTTP server, exchange the code, and persist the resulting {@link TokenSet}.
 * The refresh token then lives only in the token store, rotated by the running server.
 */
export const runLogin = (auth: OAuthAuth, deps: LoginDeps = {}): Promise<Either<OuraError, TokenSet>> => {
  const log = deps.log ?? ((m: string) => process.stderr.write(`${m}\n`))
  const open = deps.open ?? openBrowser
  const state = randomUUID()
  const redirect = new URL(auth.redirectUri)
  const port = redirect.port ? Number(redirect.port) : 80

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: Either<OuraError, TokenSet>): void => {
      if (settled) return
      settled = true
      server.close()
      resolve(result)
    }

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://${redirect.host}`)
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get("code")
      const returnedState = url.searchParams.get("state")
      const err = url.searchParams.get("error")

      if (err) {
        res.writeHead(400).end(`Authorization failed: ${err}`)
        finish(Left<OuraError, TokenSet>({ kind: "auth", message: `Oura authorization denied: ${err}` }))
        return
      }
      if (!code || returnedState !== state) {
        res.writeHead(400).end("Invalid callback (missing code or state mismatch).")
        finish(
          Left<OuraError, TokenSet>({
            kind: "auth",
            message: "OAuth callback was missing a code or the state did not match (possible CSRF).",
          }),
        )
        return
      }

      res.writeHead(200, { "Content-Type": "text/html" }).end(HTML_OK)
      void exchangeAuthCode(auth, code, auth.redirectUri, deps).then((exchanged) =>
        exchanged.fold(
          (e) => finish(Left<OuraError, TokenSet>(e)),
          (tokens) =>
            void writeTokenStore(auth.tokenStorePath, tokens, deps).then(
              () => {
                log(`✓ Authorized. Tokens saved to ${auth.tokenStorePath}`)
                finish(Right<OuraError, TokenSet>(tokens))
              },
              (writeErr: unknown) =>
                finish(
                  Left<OuraError, TokenSet>({
                    kind: "auth",
                    message: `Failed to write token store ${auth.tokenStorePath}: ${
                      writeErr instanceof Error ? writeErr.message : String(writeErr)
                    }`,
                  }),
                ),
            ),
        ),
      )
    })

    server.on("error", (e: Error) =>
      finish(
        Left<OuraError, TokenSet>({
          kind: "auth",
          message:
            `Could not start local callback server on ${auth.redirectUri}: ${e.message}. ` +
            `Ensure the port is free and the redirect URI matches your Oura app registration.`,
        }),
      ),
    )

    server.listen(port, () => {
      const authorizeUrl = buildAuthorizeUrl(auth, state)
      log(`Opening browser for Oura authorization (scopes: ${auth.scopes}).`)
      log(`If it does not open, visit:\n  ${authorizeUrl}`)
      log(`Waiting for the redirect to ${auth.redirectUri} ...`)
      open(authorizeUrl)
    })
  })
}
