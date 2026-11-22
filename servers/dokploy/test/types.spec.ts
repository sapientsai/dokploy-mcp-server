import { describe, expect, it } from "vitest"

import { DB_ID_FIELDS, DB_TYPES } from "../src/types"

describe("DB_TYPES", () => {
  it("exposes the 6 supported database types in order", () => {
    expect(DB_TYPES).toEqual(["postgres", "mysql", "mariadb", "mongo", "redis", "libsql"])
  })
})

describe("DB_ID_FIELDS", () => {
  it.each([
    ["postgres", "postgresId"],
    ["mysql", "mysqlId"],
    ["mariadb", "mariadbId"],
    ["mongo", "mongoId"],
    ["redis", "redisId"],
    ["libsql", "libsqlId"],
  ] as const)("maps %s → %s", (dbType, idField) => {
    expect(DB_ID_FIELDS[dbType]).toBe(idField)
  })

  it("has an entry for every type in DB_TYPES", () => {
    for (const t of DB_TYPES) {
      expect(DB_ID_FIELDS[t]).toBeDefined()
    }
  })
})
