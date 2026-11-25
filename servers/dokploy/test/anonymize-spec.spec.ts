import { describe, expect, it } from "vitest"

import { type Anonymized, anonymizeSpec, EXAMPLE_HOST, instanceHosts } from "../scripts/anonymize-spec"

const specFor = (serverUrl: string, docsUrl: string) => ({
  openapi: "3.0.3",
  servers: [{ url: serverUrl }],
  externalDocs: { url: docsUrl },
  paths: { "/project.all": { get: { description: "See https://docs.dokploy.com" } } },
})

const textOf = (result: Anonymized): string => {
  if (!result.ok) throw new Error(result.reason)
  return result.text
}

describe("instanceHosts", () => {
  it("takes the hosts the spec names for itself, as well as the one it was fetched from", () => {
    const spec = specFor("https://panel.internal.test/api", "https://docs-host.test/api/settings.getOpenApiDocument")
    expect(instanceHosts(spec, "http://10.0.0.5:3000")).toEqual(["panel.internal.test", "docs-host.test", "10.0.0.5"])
  })

  it("skips relative URLs, non-strings, loopback and the example host", () => {
    const spec = { servers: [{ url: "/api" }, { url: 42 }, { url: `https://${EXAMPLE_HOST}/api` }] }
    expect(instanceHosts(spec, "http://localhost:3000")).toEqual([])
  })

  it("puts a host that contains another first", () => {
    const spec = specFor("https://real.test/api", "https://dokploy.real.test/api")
    expect(instanceHosts(spec, "https://real.test")).toEqual(["dokploy.real.test", "real.test"])
  })

  it("takes a Unicode host both as written and as punycode", () => {
    expect(instanceHosts({}, "https://bücher.test")).toEqual(["xn--bcher-kva.test", "bücher.test"])
  })
})

describe("anonymizeSpec", () => {
  it("rewrites a host the spec names even when it was fetched by IP", () => {
    const spec = specFor(
      "https://panel.internal.test/api",
      "https://panel.internal.test/api/settings.getOpenApiDocument",
    )
    const text = textOf(anonymizeSpec(spec, "http://10.0.0.5:3000"))
    expect(text).not.toContain("panel.internal.test")
    expect(JSON.parse(text)).toMatchObject({
      servers: [{ url: `https://${EXAMPLE_HOST}/api` }],
      externalDocs: { url: `https://${EXAMPLE_HOST}/api/settings.getOpenApiDocument` },
    })
  })

  it("rewrites the fetched host in any case, and leaves other hosts alone", () => {
    const spec = {
      ...specFor("https://dokploy.real.test/api", "https://dokploy.real.test/docs"),
      info: { description: "Served by Dokploy.Real.Test" },
    }
    const text = textOf(anonymizeSpec(spec, "https://dokploy.real.test:8443"))
    expect(text.toLowerCase()).not.toContain("dokploy.real.test")
    expect(text).toContain(`Served by ${EXAMPLE_HOST}`)
    expect(text).toContain("https://docs.dokploy.com")
  })

  it("replaces a containing host whole", () => {
    const spec = specFor("https://real.test/api", "https://dokploy.real.test/api")
    const text = textOf(anonymizeSpec(spec, "https://real.test"))
    expect(JSON.parse(text).externalDocs.url).toBe(`https://${EXAMPLE_HOST}/api`)
  })

  it("leaves a host or IP that only contains the instance host", () => {
    const spec = { ...specFor("/api", "/docs"), info: { description: "Peers 110.0.0.50 and notreal.test" } }
    const text = textOf(anonymizeSpec(spec, "http://10.0.0.5:3000"))
    expect(JSON.parse(text).info.description).toBe("Peers 110.0.0.50 and notreal.test")
  })

  it("rewrites a Unicode host as written", () => {
    const spec = specFor("https://bücher.test/api", "/docs")
    const text = textOf(anonymizeSpec(spec, "http://10.0.0.5"))
    expect(text).not.toContain("bücher.test")
    expect(JSON.parse(text).servers[0].url).toBe(`https://${EXAMPLE_HOST}/api`)
  })

  it("rewrites a host that follows a newline or a tab", () => {
    const spec = { ...specFor("/api", "/docs"), info: { description: "Reach it at:\npanel.real.test\tor\n10.0.0.5" } }
    const text = textOf(anonymizeSpec(spec, "http://10.0.0.5"))
    expect(text).not.toContain("10.0.0.5")
    expect(JSON.parse(text).info.description).toBe(`Reach it at:\npanel.real.test\tor\n${EXAMPLE_HOST}`)
  })

  it("rewrites a host in an object key", () => {
    const spec = { ...specFor("/api", "/docs"), "x-hosts": { "panel.real.test": true } }
    const text = textOf(anonymizeSpec(spec, "https://panel.real.test"))
    expect(JSON.parse(text)["x-hosts"]).toEqual({ [EXAMPLE_HOST]: true })
  })

  it.each(["http://dokploy:3000", "https://example.com"])("refuses %s, which the example host contains", (url) => {
    const result = anonymizeSpec(specFor("/api", "/docs"), url)
    expect(result.ok).toBe(false)
  })
})
