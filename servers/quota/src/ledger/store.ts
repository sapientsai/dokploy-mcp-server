import { List, Option, type Wire } from "functype"

import type { CallClass, ScopeFilter, Source, Spend, SpendFilter, StoredObservation } from "./types"

export type SqlValue = string | number | null

type Row = Wire<Readonly<Record<string, SqlValue>>>

/**
 * The part of a Durable Object's `ctx.storage.sql` the ledger uses. Tests pass an adapter over
 * Node's `node:sqlite`, so the same queries run in both.
 */
export type Sql = {
  exec(query: string, ...bindings: ReadonlyArray<SqlValue>): { toArray(): ReadonlyArray<Row> }
}

/** Spends older than this are dropped. The longest window a policy may count is a day. */
export const RETENTION_MS = 7 * 86_400_000
/** A call that never says it finished stops counting as in flight after this. */
export const IN_FLIGHT_TTL_MS = 10 * 60_000

const SCHEMA = List.of(
  `CREATE TABLE IF NOT EXISTS observations (
     resource TEXT PRIMARY KEY, lim REAL NOT NULL, remaining REAL NOT NULL,
     reset_at INTEGER NOT NULL, observed_at INTEGER NOT NULL, source TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS spends (
     id TEXT PRIMARY KEY, at INTEGER NOT NULL, session TEXT NOT NULL, machine TEXT NOT NULL,
     label TEXT NOT NULL, class TEXT NOT NULL, resource TEXT NOT NULL, cost REAL NOT NULL,
     reserve INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS spends_at ON spends (at)`,
  `CREATE TABLE IF NOT EXISTS inflight (
     call_id TEXT PRIMARY KEY, session TEXT NOT NULL, machine TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
)

const num = (value: SqlValue | undefined): number => (typeof value === "number" ? value : Number(value ?? 0))
const str = (value: SqlValue | undefined): string => (value === null || value === undefined ? "" : String(value))

type Clause = { readonly sql: string; readonly args: ReadonlyArray<SqlValue> }

const NO_CLAUSE: Clause = { sql: "", args: [] }

const and = (a: Clause, b: Clause): Clause => ({ sql: a.sql + b.sql, args: [...a.args, ...b.args] })

/** A WHERE fragment and its bindings for one scope. */
const scopeClause = (scope: ScopeFilter): Clause =>
  scope.kind === "machine"
    ? { sql: " AND machine = ?", args: [scope.machine] }
    : scope.kind === "session"
      ? { sql: " AND session = ?", args: [scope.session] }
      : NO_CLAUSE

const filterClause = (filter: SpendFilter): Clause =>
  List.of(
    scopeClause(filter.scope),
    filter.resource === undefined ? NO_CLAUSE : { sql: " AND resource = ?", args: [filter.resource] },
    filter.class === undefined ? NO_CLAUSE : { sql: " AND class = ?", args: [filter.class] },
    // substr, not LIKE, so a label holding % or _ matches only itself.
    filter.labelPrefix === undefined
      ? NO_CLAUSE
      : { sql: " AND substr(label, 1, ?) = ?", args: [filter.labelPrefix.length, filter.labelPrefix] },
    filter.callsOnly === true ? { sql: " AND reserve = 0", args: [] } : NO_CLAUSE,
  ).fold(NO_CLAUSE, and)

const first = (rows: ReadonlyArray<Row>): Option<Row> => Option(rows[0])

const toSpend = (row: Row): Spend => ({
  id: str(row.id),
  at: num(row.at),
  session: str(row.session),
  machine: str(row.machine),
  label: str(row.label),
  class: str(row.class) as CallClass,
  resource: str(row.resource),
  cost: num(row.cost),
  reserve: num(row.reserve) === 1,
})

/** The ledger's tables, for one service and account. */
export const createStore = (sql: Sql) => {
  SCHEMA.forEach((statement) => sql.exec(statement))

  const scalar = (query: string, column: string, ...bindings: ReadonlyArray<SqlValue>): number =>
    first(sql.exec(query, ...bindings).toArray()).fold(
      () => 0,
      (row) => num(row[column]),
    )

  const spendById = (id: string): Option<Spend> =>
    first(sql.exec("SELECT * FROM spends WHERE id = ?", id).toArray()).map(toSpend)

  return {
    observation(resource: string): Option<StoredObservation> {
      return first(sql.exec("SELECT * FROM observations WHERE resource = ?", resource).toArray()).map((row) => ({
        resource,
        limit: num(row.lim),
        remaining: num(row.remaining),
        resetAt: num(row.reset_at),
        observedAt: num(row.observed_at),
        source: str(row.source) as Source,
      }))
    },

    observe(o: StoredObservation): void {
      sql.exec(
        `INSERT INTO observations (resource, lim, remaining, reset_at, observed_at, source) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (resource) DO UPDATE SET lim = excluded.lim, remaining = excluded.remaining,
           reset_at = excluded.reset_at, observed_at = excluded.observed_at, source = excluded.source`,
        o.resource,
        o.limit,
        o.remaining,
        o.resetAt,
        o.observedAt,
        o.source,
      )
    },

    /** Total cost of the spends that match, after `since`, booked future slots included. */
    sumCost(filter: SpendFilter, since: number): number {
      const where = filterClause(filter)
      return scalar(
        `SELECT COALESCE(SUM(cost), 0) AS total FROM spends WHERE at > ?${where.sql}`,
        "total",
        since,
        ...where.args,
      )
    },

    /** The matching spends after `since`, oldest first, for working out when a slot frees. */
    spendsSince(filter: SpendFilter, since: number): ReadonlyArray<{ readonly at: number; readonly cost: number }> {
      const where = filterClause(filter)
      return sql
        .exec(`SELECT at, cost FROM spends WHERE at > ?${where.sql} ORDER BY at, id`, since, ...where.args)
        .toArray()
        .map((row) => ({ at: num(row.at), cost: num(row.cost) }))
    },

    /** How many calls with this exact label the scope made after `since`. */
    repeats(scope: ScopeFilter, label: string, since: number): number {
      const where = scopeClause(scope)
      return scalar(
        `SELECT COUNT(*) AS n FROM spends WHERE at > ? AND label = ? AND reserve = 0${where.sql}`,
        "n",
        since,
        label,
        ...where.args,
      )
    },

    /** The different sessions or machines that spent against `resource` after `since`. */
    activeScopes(kind: "machine" | "session", resource: string, since: number): ReadonlyArray<string> {
      return sql
        .exec(`SELECT DISTINCT ${kind} AS who FROM spends WHERE at > ? AND resource = ?`, since, resource)
        .toArray()
        .map((row) => str(row.who))
    },

    spend(s: Spend): void {
      sql.exec(
        `INSERT INTO spends (id, at, session, machine, label, class, resource, cost, reserve)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET cost = excluded.cost`,
        s.id,
        s.at,
        s.session,
        s.machine,
        s.label,
        s.class,
        s.resource,
        s.cost,
        s.reserve ? 1 : 0,
      )
    },

    spendById,

    /**
     * Lowers a lease to `cost`, never raising it: `quota_release` gives back what a lease didn't use,
     * and a call drawing from a lease moves that part of it onto the call. Only leases can be changed,
     * so no client can zero the record of a call. False when there's no such lease.
     */
    lowerLease(id: string, cost: number): boolean {
      return spendById(id)
        .filter((s) => s.reserve)
        .fold(
          () => false,
          (s) => {
            sql.exec("UPDATE spends SET cost = ? WHERE id = ?", Math.max(0, Math.min(s.cost, cost)), id)
            return true
          },
        )
    },

    inFlight(scope: ScopeFilter, now: number): number {
      const where = scopeClause(scope)
      return scalar(`SELECT COUNT(*) AS n FROM inflight WHERE expires_at > ?${where.sql}`, "n", now, ...where.args)
    },

    start(callId: string, session: string, machine: string, now: number): void {
      sql.exec(
        `INSERT INTO inflight (call_id, session, machine, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (call_id) DO UPDATE SET expires_at = excluded.expires_at`,
        callId,
        session,
        machine,
        now + IN_FLIGHT_TTL_MS,
      )
    },

    finish(callId: string): void {
      sql.exec("DELETE FROM inflight WHERE call_id = ?", callId)
    },

    /** The largest total any one machine or session spent on matching calls after `since`. */
    maxScopeCost(kind: "machine" | "session", filter: Omit<SpendFilter, "scope">, since: number): number {
      const where = filterClause({ ...filter, scope: { kind: "fleet" } })
      return scalar(
        `SELECT COALESCE(MAX(total), 0) AS top FROM (SELECT SUM(cost) AS total FROM spends WHERE at > ?${where.sql} GROUP BY ${kind})`,
        "top",
        since,
        ...where.args,
      )
    },

    /** The biggest spenders after `since`, by session. */
    topSessions(
      since: number,
      limit: number,
    ): ReadonlyArray<{ readonly session: string; readonly machine: string; readonly cost: number }> {
      return sql
        .exec(
          `SELECT session, machine, SUM(cost) AS cost FROM spends WHERE at > ?
           GROUP BY session, machine ORDER BY cost DESC, session LIMIT ?`,
          since,
          limit,
        )
        .toArray()
        .map((row) => ({ session: str(row.session), machine: str(row.machine), cost: num(row.cost) }))
    },

    meta(key: string): Option<string> {
      return first(sql.exec("SELECT value FROM meta WHERE key = ?", key).toArray()).map((row) => str(row.value))
    },

    setMeta(key: string, value: string): void {
      sql.exec(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        key,
        value,
      )
    },

    /** Drops spends past retention and calls whose finish never came. */
    prune(now: number): void {
      sql.exec("DELETE FROM spends WHERE at <= ?", now - RETENTION_MS)
      sql.exec("DELETE FROM inflight WHERE expires_at <= ?", now)
    },
  }
}

export type Store = ReturnType<typeof createStore>
