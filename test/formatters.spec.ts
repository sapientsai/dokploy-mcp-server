import { Right } from "functype"
import { afterEach, describe, expect, it, vi } from "vitest"

import { handleSearchDeviceAdverseEvents } from "../src/handlers/device-handlers.js"
import {
  handleSearchDrugAdverseEvents,
  handleSearchDrugLabels,
  handleSearchDrugsFDA,
} from "../src/handlers/drug-handlers.js"
import type { DeviceAdverseEvent, DrugAdverseEvent, DrugLabel, DrugsFDA } from "../src/types/fda.js"
import { fdaAPIClient } from "../src/utils/api-client.js"

afterEach(() => {
  vi.restoreAllMocks()
})

const respond = <T>(results: T[]) => Right({ results })

async function adverseEvent(event: DrugAdverseEvent) {
  vi.spyOn(fdaAPIClient, "searchDrugAdverseEvents").mockResolvedValue(respond([event]))
  return (await handleSearchDrugAdverseEvents({})).data?.[0]
}

describe("drug adverse event formatting", () => {
  it("maps patientsex 1 and 2 and leaves other codes undefined", async () => {
    expect((await adverseEvent({ patient: { patientsex: "1" } }))?.patient.sex).toBe("Male")
    expect((await adverseEvent({ patient: { patientsex: "2" } }))?.patient.sex).toBe("Female")
    expect((await adverseEvent({ patient: { patientsex: "0" } }))?.patient.sex).toBeUndefined()
    expect((await adverseEvent({ patient: { patientsex: "constructor" } }))?.patient.sex).toBeUndefined()
  })

  it("treats empty age and weight as missing, and keeps the age when the unit is missing", async () => {
    const empty = await adverseEvent({ patient: { patientonsetage: "", patientweight: "" } })
    expect(empty?.patient).toEqual({ age: undefined, sex: undefined, weight: undefined })

    const noUnit = await adverseEvent({ patient: { patientonsetage: "45", patientweight: "70" } })
    expect(noUnit?.patient.age).toBe("45 ")
    expect(noUnit?.patient.weight).toBe("70 kg")
  })

  it("returns empty lists when the patient is missing", async () => {
    const event = await adverseEvent({ safetyreportid: "1" })
    expect(event).toMatchObject({ drugs: [], reactions: [] })
    expect(event?.patient).toEqual({ age: undefined, sex: undefined, weight: undefined })
  })

  it("keeps the first three drugs and reactions", async () => {
    const drugs = Array.from({ length: 5 }, (_, i) => ({ medicinalproduct: `D${i}` }))
    const reactions = Array.from({ length: 5 }, (_, i) => ({ reactionmeddrapt: `R${i}` }))
    const event = await adverseEvent({ patient: { drug: drugs, reaction: reactions } })
    expect(event?.drugs.map((d) => d.name)).toEqual(["D0", "D1", "D2"])
    expect(event?.reactions.map((r) => r.reaction)).toEqual(["R0", "R1", "R2"])
  })

  it("adds the serious filter only when it is given", async () => {
    const spy = vi.spyOn(fdaAPIClient, "searchDrugAdverseEvents").mockResolvedValue(respond([]))
    await handleSearchDrugAdverseEvents({ serious: false })
    await handleSearchDrugAdverseEvents({})
    expect(spy.mock.calls.map(([params]) => params.search)).toEqual(['serious:"2"', undefined])
  })
})

async function labelWith(label: DrugLabel, sections?: string[]) {
  vi.spyOn(fdaAPIClient, "searchDrugLabels").mockResolvedValue(respond([label]))
  return (await handleSearchDrugLabels({ sections })).data?.[0]
}

describe("drug label formatting", () => {
  const label: DrugLabel = {
    boxed_warning: ["b".repeat(600)],
    warnings: ["w"],
    description: [""],
    openfda: { substance_name: ["A", "B", "C", "D", "E", "F"], route: ["ORAL", "IV", "IM", "SC"] },
  }

  it("includes every present section when no filter is given", async () => {
    const formatted = await labelWith(label)
    expect(formatted?.boxedWarning).toBe(`${"b".repeat(500)}...`)
    expect(formatted?.warnings).toBe("w")
    expect(formatted?.description).toBeUndefined()
    expect(formatted?.overdosage).toBeUndefined()
    expect(formatted?.activeIngredients).toEqual(["A", "B", "C", "D", "E"])
    expect(formatted?.route).toEqual(["ORAL", "IV", "IM"])
  })

  it("includes only the named sections, and none for an empty filter", async () => {
    const named = await labelWith(label, ["warnings"])
    expect(named?.warnings).toBe("w")
    expect(named?.boxedWarning).toBeUndefined()

    const none = await labelWith(label, [])
    expect(none?.warnings).toBeUndefined()
    expect(none?.boxedWarning).toBeUndefined()
  })

  it("returns empty lists when openfda is missing", async () => {
    const formatted = await labelWith({ set_id: "s" })
    expect(formatted).toMatchObject({ setId: "s", activeIngredients: [], route: [] })
  })
})

describe("Drugs@FDA and device formatting", () => {
  it("leaves latestSubmission undefined without submissions and keeps three products", async () => {
    const drug: DrugsFDA = {
      application_number: "NDA1",
      products: Array.from({ length: 4 }, (_, i) => ({ brand_name: `P${i}` })),
    }
    vi.spyOn(fdaAPIClient, "searchDrugsFDA").mockResolvedValue(respond([drug]))
    const formatted = (await handleSearchDrugsFDA({})).data?.[0]
    expect(formatted?.latestSubmission).toBeUndefined()
    expect(formatted?.products.map((p) => p.brandName)).toEqual(["P0", "P1", "P2"])
    expect(formatted?.products[0]?.activeIngredients).toEqual([])
  })

  it("uses the first submission when there is one", async () => {
    const drug: DrugsFDA = {
      submissions: [{ submission_type: "ORIG", submission_status: "AP", submission_status_date: "20200101" }],
    }
    vi.spyOn(fdaAPIClient, "searchDrugsFDA").mockResolvedValue(respond([drug]))
    const formatted = (await handleSearchDrugsFDA({})).data?.[0]
    expect(formatted?.latestSubmission).toEqual({ type: "ORIG", status: "AP", statusDate: "20200101" })
    expect(formatted?.products).toEqual([])
  })

  it("keeps three devices and two MDR texts, and empty lists when missing", async () => {
    const event: DeviceAdverseEvent = {
      device: Array.from({ length: 4 }, (_, i) => ({ brand_name: `B${i}` })),
      mdr_text: Array.from({ length: 3 }, (_, i) => ({ text: `T${i}` })),
    }
    vi.spyOn(fdaAPIClient, "searchDeviceAdverseEvents").mockResolvedValue(respond([event, {}]))
    const [full, empty] = (await handleSearchDeviceAdverseEvents({})).data ?? []
    expect(full?.devices.map((d) => d.brandName)).toEqual(["B0", "B1", "B2"])
    expect(full?.mdrText.map((t) => t.text)).toEqual(["T0", "T1"])
    expect(empty).toMatchObject({ devices: [], mdrText: [] })
  })
})

describe("malformed lists", () => {
  it("treats a non-array list field as missing", async () => {
    const event = { patient: { drug: "notarray" } } as unknown as DrugAdverseEvent
    expect((await adverseEvent(event))?.drugs).toEqual([])
  })
})
