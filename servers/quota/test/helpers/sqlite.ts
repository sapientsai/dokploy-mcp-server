import { DatabaseSync } from "node:sqlite"

import type { Sql, SqlValue } from "../../src/ledger/store"

/** An in-memory SQLite database behind the same `exec` a Durable Object's storage offers. */
export const memorySql = (): Sql => {
  const db = new DatabaseSync(":memory:")
  return {
    exec: (query: string, ...bindings: ReadonlyArray<SqlValue>) => {
      const rows = db.prepare(query).all(...bindings) as ReadonlyArray<Readonly<Record<string, SqlValue>>>
      return { toArray: () => rows }
    },
  }
}
