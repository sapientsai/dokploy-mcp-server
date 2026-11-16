import { type Either, Right } from "functype"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  handleSearchDeviceAdverseEvents,
  handleSearchDeviceClassifications,
  handleSearchDeviceEnforcement,
} from "../src/handlers/device-handlers.js"
import {
  handleSearchDrugAdverseEvents,
  handleSearchDrugEnforcement,
  handleSearchDrugLabels,
  handleSearchDrugsFDA,
  handleSearchDrugShortages,
} from "../src/handlers/drug-handlers.js"
import type { DeviceAdverseEvent, DrugAdverseEvent, DrugLabel, DrugsFDA, FDAResponse } from "../src/types/fda.js"
import { fdaAPIClient } from "../src/utils/api-client.js"

afterEach(() => {
  vi.restoreAllMocks()
})

const respond = <T>(results: T[]): Either<Error, FDAResponse<T>> => Right({ results })

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
    expect(noUnit?.patient.age).toBe("45")
    expect(noUnit?.patient.weight).toBe("70 kg")
  })

  it("decodes the FAERS age unit, and keeps an unknown unit code visible", async () => {
    const age = async (patientonsetage: string, patientonsetageunit: string) =>
      (await adverseEvent({ patient: { patientonsetage, patientonsetageunit } }))?.patient.age
    expect(await age("63", "801")).toBe("63 years")
    expect(await age("1", "801")).toBe("1 year")
    expect(await age("6", "800")).toBe("6 decades")
    expect(await age("18", "802")).toBe("18 months")
    expect(await age("3", "803")).toBe("3 weeks")
    expect(await age("10", "804")).toBe("10 days")
    expect(await age("12", "805")).toBe("12 hours")
    expect(await age("63", "999")).toBe("63 (age unit code 999)")
    expect(await age("63", "")).toBe("63")
  })

  it("decodes reaction outcome codes, and passes an unknown code through", async () => {
    const outcomes = async (...codes: Array<string | undefined>) =>
      (
        await adverseEvent({ patient: { reaction: codes.map((reactionoutcome) => ({ reactionoutcome })) } })
      )?.reactions.map((r) => r.outcome)
    expect(await outcomes("1", "2", "3")).toEqual([
      "Recovered/resolved",
      "Recovering/resolving",
      "Not recovered/not resolved",
    ])
    expect(await outcomes("4", "5", "6")).toEqual(["Recovered/resolved with sequelae", "Fatal", "Unknown"])
    expect(await outcomes("9", undefined)).toEqual(["9", undefined])
  })

  it("returns empty lists when the patient is missing", async () => {
    const event = await adverseEvent({ safetyreportid: "1" })
    expect(event).toMatchObject({ drugs: [], reactions: [], drugCount: 0, reactionCount: 0 })
    expect(event?.patient).toEqual({ age: undefined, sex: undefined, weight: undefined })
  })

  it("keeps the first three drugs and reactions, and counts them all", async () => {
    const drugs = Array.from({ length: 5 }, (_, i) => ({ medicinalproduct: `D${i}` }))
    const reactions = Array.from({ length: 5 }, (_, i) => ({ reactionmeddrapt: `R${i}` }))
    const event = await adverseEvent({ patient: { drug: drugs, reaction: reactions } })
    expect(event?.drugs.map((d) => d.name)).toEqual(["D0", "D1", "D2"])
    expect(event?.reactions.map((r) => r.reaction)).toEqual(["R0", "R1", "R2"])
    expect(event).toMatchObject({ drugCount: 5, reactionCount: 5 })
  })

  it("keeps every drug and reaction that matches the search, in report order", async () => {
    const event: DrugAdverseEvent = {
      patient: {
        drug: [
          { medicinalproduct: "DIOVAN" },
          { medicinalproduct: "DILTIAZEM" },
          { medicinalproduct: "ECOTRIN" },
          { medicinalproduct: "METFORMIN" },
          { medicinalproduct: "Atorvastatin Calcium" },
          { activesubstance: { activesubstancename: "ATORVASTATIN" } },
        ],
        reaction: [
          { reactionmeddrapt: "Nausea" },
          { reactionmeddrapt: "Dizziness" },
          { reactionmeddrapt: "Fatigue" },
          { reactionmeddrapt: "Myalgia" },
        ],
      },
    }
    vi.spyOn(fdaAPIClient, "searchDrugAdverseEvents").mockResolvedValue(respond([event]))
    const formatted = (await handleSearchDrugAdverseEvents({ drugName: "atorvastatin", reaction: "MYALGIA" })).data?.[0]
    expect(formatted?.drugs.map((d) => d.name)).toEqual([
      "DIOVAN",
      "DILTIAZEM",
      "ECOTRIN",
      "Atorvastatin Calcium",
      "ATORVASTATIN",
    ])
    expect(formatted?.reactions.map((r) => r.reaction)).toEqual(["Nausea", "Dizziness", "Fatigue", "Myalgia"])
    expect(formatted).toMatchObject({ drugCount: 6, reactionCount: 4 })
  })

  it("combines every filter into one openFDA query", async () => {
    const spy = vi.spyOn(fdaAPIClient, "searchDrugAdverseEvents").mockResolvedValue(respond([]))
    await handleSearchDrugAdverseEvents({
      drugName: "aspirin",
      serious: true,
      dateFrom: "2024-01-01",
      dateTo: "2024-01-31",
    })
    expect(spy.mock.calls[0]?.[0].search).toBe(
      'patient.drug.medicinalproduct:"aspirin" AND serious:"1" AND receivedate:[20240101 TO 20240131]',
    )
  })

  it("adds the serious filter only when it is given", async () => {
    const spy = vi.spyOn(fdaAPIClient, "searchDrugAdverseEvents").mockResolvedValue(respond([]))
    await handleSearchDrugAdverseEvents({ serious: false })
    await handleSearchDrugAdverseEvents({})
    expect(spy.mock.calls.map(([params]) => params.search)).toEqual(['serious:"2"', undefined])
  })
})

async function labelWith(label: DrugLabel, sections?: string[], fullText?: boolean) {
  vi.spyOn(fdaAPIClient, "searchDrugLabels").mockResolvedValue(respond([label]))
  return (await handleSearchDrugLabels({ sections, fullText })).data?.[0]
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
    expect(formatted?.truncated).toBeUndefined()
  })

  it("names the sections it cut, and returns them whole with fullText", async () => {
    const long: DrugLabel = { ...label, warnings: ["w".repeat(250)], indications_and_usage: ["i"] }
    const cut = await labelWith(long)
    expect(cut?.truncated).toEqual(["boxedWarning", "warnings"])
    expect(cut?.warnings).toBe(`${"w".repeat(200)}...`)
    const full = await labelWith(long, undefined, true)
    expect(full?.truncated).toBeUndefined()
    expect(full?.boxedWarning).toBe("b".repeat(600))
    expect(full?.warnings).toBe("w".repeat(250))
    expect(full?.indications).toBe("i")
    const section = await labelWith(long, ["warnings"], true)
    expect(section?.warnings).toBe("w".repeat(250))
    expect(section?.boxedWarning).toBeUndefined()
  })

  it("matches a drug name on the brand or the generic name", async () => {
    const spy = vi.spyOn(fdaAPIClient, "searchDrugLabels").mockResolvedValue(respond([]))
    await handleSearchDrugLabels({ drugName: "semaglutide", hasBoxedWarning: true })
    await handleSearchDrugLabels({ drugName: "metformin", route: "oral" })
    await handleSearchDrugLabels({ route: "oral" })
    expect(spy.mock.calls.map(([params]) => params.search)).toEqual([
      '(openfda.brand_name:"semaglutide" OR openfda.generic_name:"semaglutide") AND _exists_:boxed_warning',
      'openfda.route:"oral" AND (openfda.brand_name:"metformin" OR openfda.generic_name:"metformin")',
      'openfda.route:"oral"',
    ])
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
    expect(full?.mdrText.map((t) => t.truncated)).toEqual([false, false])
    expect(empty).toMatchObject({ devices: [], mdrText: [] })
  })
})

describe("truncation flags", () => {
  it("flags a cut MDR text", async () => {
    const event: DeviceAdverseEvent = { mdr_text: [{ text: "t".repeat(301) }, { text: "short" }] }
    vi.spyOn(fdaAPIClient, "searchDeviceAdverseEvents").mockResolvedValue(respond([event]))
    const formatted = (await handleSearchDeviceAdverseEvents({})).data?.[0]
    expect(formatted?.mdrText.map((t) => t.truncated)).toEqual([true, false])
    expect(formatted?.mdrText[0]?.text).toBe(`${"t".repeat(300)}...`)
  })

  it("names the cut fields on drug and device recalls, shortages and classifications", async () => {
    const long = "x".repeat(201)
    vi.spyOn(fdaAPIClient, "searchDrugEnforcement").mockResolvedValue(
      respond([{ product_description: long, reason_for_recall: "short", distribution_pattern: long }, {}]),
    )
    vi.spyOn(fdaAPIClient, "searchDeviceEnforcement").mockResolvedValue(respond([{ reason_for_recall: long }]))
    vi.spyOn(fdaAPIClient, "searchDrugShortages").mockResolvedValue(respond([{ description: long }]))
    vi.spyOn(fdaAPIClient, "searchDeviceClassifications").mockResolvedValue(respond([{ definition: "short" }]))
    const [drugRecall, emptyRecall] = (await handleSearchDrugEnforcement({})).data ?? []
    expect(drugRecall?.truncated).toEqual(["productDescription", "distributionPattern"])
    expect(drugRecall?.reasonForRecall).toBe("short")
    expect(emptyRecall?.truncated).toBeUndefined()
    expect((await handleSearchDeviceEnforcement({})).data?.[0]?.truncated).toEqual(["reasonForRecall"])
    expect((await handleSearchDrugShortages({})).data?.[0]?.truncated).toEqual(["description"])
    expect((await handleSearchDeviceClassifications({})).data?.[0]?.truncated).toBeUndefined()
  })
})

describe("malformed lists", () => {
  it("treats a non-array list field as missing", async () => {
    const event = { patient: { drug: "notarray" } } as unknown as DrugAdverseEvent
    expect((await adverseEvent(event))?.drugs).toEqual([])
  })
})
