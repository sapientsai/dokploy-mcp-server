import { IO, type Wire } from "functype"

import type { LedgerMessage } from "./ledger/durable-object"

/** The Durable Object namespace binding, as much of it as the Worker uses. */
export type LedgerNamespace = {
  idFromName(name: string): unknown
  get(id: never): { fetch(request: Request): Promise<Response> }
}

/** The ledger instance that lists every `service:account` key seen. */
export const ACCOUNTS_LEDGER = "__accounts"

const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$/

export const isAccount = (account: string): boolean => ACCOUNT.test(account)

export const ledgerKey = (service: string, account: string): string => `${service}:${account}`

/** Sends messages to ledgers and reads their JSON answers. */
export const createLedgers = (namespace: LedgerNamespace) => {
  // Keys this isolate already added to the accounts list, so each costs one extra call per isolate.
  const remembered: { keys: ReadonlyArray<string> } = { keys: [] }

  const send = <T>(name: string, message: LedgerMessage): IO<never, Error, T> =>
    IO.tryPromise({
      try: async () => {
        const stub = namespace.get(namespace.idFromName(name) as never)
        return stub.fetch(new Request("https://ledger.internal/", { method: "POST", body: JSON.stringify(message) }))
      },
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).flatMap((response) =>
      response.ok
        ? IO.tryPromise({
            try: () => response.json() as Promise<Wire<T>>,
            catch: () => new Error("The ledger's answer wasn't JSON."),
          })
        : IO.fail(new Error(`The ledger answered HTTP ${response.status}.`)),
    )

  return {
    send,
    /** Adds a key to the accounts list once per isolate, so `quota_status` can find it later. */
    remember(key: string): IO<never, Error, void> {
      if (remembered.keys.includes(key)) return IO.succeed(undefined)
      return send<unknown>(ACCOUNTS_LEDGER, { op: "remember-account", key }).map(() => {
        remembered.keys = [...remembered.keys, key]
      })
    },
    accounts(): IO<never, Error, ReadonlyArray<string>> {
      return send<{ readonly accounts: ReadonlyArray<string> }>(ACCOUNTS_LEDGER, { op: "accounts" }).map(
        (a) => a.accounts,
      )
    },
  }
}

export type Ledgers = ReturnType<typeof createLedgers>
