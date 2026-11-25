import { describe, expect, it } from "vitest"

import { anonymizeSpec, EXAMPLE_HOST, instanceHosts } from "../scripts/anonymize-spec"

const specFor = (serverUrl: string, docsUrl: string) => ({
  openapi: "3.0.3",
  servers: [{ url: serverUrl }],
  externalDocs: { url: docsUrl },
  paths: { "/project.all": { get: { description: "See https://docs.dokploy.com" } } },
})

describe("instanceHosts", () => {
  it("takes the hosts the spec names for itself, as well as the one it was fetched from", () => {
    const spec = specFor("https://panel.internal.test/api", "https://docs-host.test/api/settings.getOpenApiDocument")
    expect(instanceHosts(spec, "http://10.0.0.5:3000")).toEqual(["panel.internal.test", "docs-host.test", "10.0.0.5"])
  })

  it("skips relative URLs, non-strings and the example host", () => {
    const spec = { servers: [{ url: "/api" }, { url: 42 }, { url: `https://${EXAMPLE_HOST}/api` }] }
    expect(instanceHosts(spec, "https://dokploy.real.test")).toEqual(["dokploy.real.test"])
  })

  it("puts a host that contains another first", () => {
    const spec = specFor("https://real.test/api", "https://dokploy.real.test/api")
    expect(instanceHosts(spec, "https://real.test")).toEqual(["dokploy.real.test", "real.test"])
  })
})

describe("anonymizeSpec", () => {
  it("rewrites a host the spec names even when it was fetched by IP", () => {
    const spec = specFor(
      "https://panel.internal.test/api",
      "https://panel.internal.test/api/settings.getOpenApiDocument",
    )
    const text = anonymizeSpec(spec, "http://10.0.0.5:3000")
    expect(text).not.toContain("panel.internal.test")
    expect(JSON.parse(text)).toMatchObject({
      servers: [{ url: `https://${EXAMPLE_HOST}/api` }],
      externalDocs: { url: `https://${EXAMPLE_HOST}/api/settings.getOpenApiDocument` },
    })
  })

  it("rewrites the fetched host in any case, and leaves other hosts alone", () => {
    const spec = { ...specFor("/api", "/docs"), info: { description: "Served by Dokploy.Real.Test" } }
    const text = anonymizeSpec(spec, "https://dokploy.real.test:8443")
    expect(text.toLowerCase()).not.toContain("dokploy.real.test")
    expect(text).toContain(`Served by ${EXAMPLE_HOST}`)
    expect(text).toContain("https://docs.dokploy.com")
  })

  it("replaces a containing host whole", () => {
    const spec = specFor("https://real.test/api", "https://dokploy.real.test/api")
    const text = anonymizeSpec(spec, "https://real.test")
    expect(JSON.parse(text).externalDocs.url).toBe(`https://${EXAMPLE_HOST}/api`)
  })
})
