import { Left, Right } from "functype"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  handleSearchDrugPatentExpiry,
  handleSearchOrangeBook,
  handleSearchOrangeBookPatents,
  handleSearchPurpleBook,
} from "../src/handlers/bulk-data-handlers.js"
import { bulkDataClient } from "../src/utils/bulk-data-client.js"

import type { OrangeBookExclusivity, OrangeBookPatent, OrangeBookProduct, PurpleBookEntry } from "../src/types/fda.js"

// Mock data
const mockProducts: OrangeBookProduct[] = [
  {
    ingredient: "ATORVASTATIN CALCIUM",
    dfRoute: "TABLET;ORAL",
    tradeName: "LIPITOR",
    applicant: "PFIZER",
    applType: "N",
    applNo: "020702",
    productNo: "001",
    teCode: "AB",
    approvalDate: "Dec 17, 1996",
    rld: "Yes",
    rs: "Yes",
    type: "RX",
    applicantFullName: "PFIZER INC",
  },
  {
    ingredient: "METFORMIN HYDROCHLORIDE",
    dfRoute: "TABLET;ORAL",
    tradeName: "GLUCOPHAGE",
    applicant: "BRISTOL",
    applType: "N",
    applNo: "020357",
    productNo: "001",
    teCode: "AB",
    approvalDate: "Mar 3, 1995",
    rld: "Yes",
    rs: "Yes",
    type: "RX",
    applicantFullName: "BRISTOL-MYERS SQUIBB",
  },
]

const mockPatents: OrangeBookPatent[] = [
  {
    applType: "N",
    applNo: "020702",
    productNo: "001",
    patentNo: "5273995",
    patentExpireDate: "Jun 28, 2011",
    drugSubstanceFlag: "Y",
    drugProductFlag: "N",
    patentUseCode: "",
    delistFlag: "N",
    submissionDate: "Jan 15, 1997",
  },
  {
    applType: "N",
    applNo: "020702",
    productNo: "001",
    patentNo: "4681893",
    patentExpireDate: "Jul 21, 2007",
    drugSubstanceFlag: "Y",
    drugProductFlag: "N",
    patentUseCode: "",
    delistFlag: "N",
    submissionDate: "Jan 15, 1997",
  },
]

const mockExclusivities: OrangeBookExclusivity[] = [
  {
    applType: "N",
    applNo: "020702",
    productNo: "001",
    exclusivityCode: "NCE",
    exclusivityDate: "Dec 17, 2001",
  },
]

const mockPurpleBookEntries: PurpleBookEntry[] = [
  {
    blaNumber: "103795",
    proprietaryName: "HUMIRA",
    properName: "ADALIMUMAB",
    applicant: "ABBVIE INC",
    blaType: "351(a)",
    strength: "40 MG/0.8 ML",
    dosageForm: "INJECTION",
    route: "SUBCUTANEOUS",
    productPresentation: "Prefilled Syringe",
    status: "Active",
    licensingStatus: "Licensed",
    referenceProductBla: "",
    referenceProductProprietaryName: "",
    biosimilar: false,
    interchangeable: false,
    approvalDate: "Dec 31, 2002",
  },
  {
    blaNumber: "761024",
    proprietaryName: "AMJEVITA",
    properName: "ADALIMUMAB-ATTO",
    applicant: "AMGEN INC",
    blaType: "351(k)",
    strength: "40 MG/0.8 ML",
    dosageForm: "INJECTION",
    route: "SUBCUTANEOUS",
    productPresentation: "Prefilled Syringe",
    status: "Active",
    licensingStatus: "Licensed",
    referenceProductBla: "103795",
    referenceProductProprietaryName: "HUMIRA",
    biosimilar: true,
    interchangeable: true,
    approvalDate: "Sep 23, 2016",
  },
]

// Mock the bulkDataClient methods
const orangeBookSpy = vi.spyOn(bulkDataClient, "getOrangeBookData").mockResolvedValue(
  Right({
    products: mockProducts,
    patents: mockPatents,
    exclusivities: mockExclusivities,
  }),
)

const purpleBookSpy = vi.spyOn(bulkDataClient, "getPurpleBookData").mockResolvedValue(Right(mockPurpleBookEntries))

afterEach(() => {
  vi.clearAllMocks()
})

describe("handleSearchOrangeBook", () => {
  it("should search by drug name", async () => {
    const result = await handleSearchOrangeBook({ drugName: "lipitor" })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data![0].tradeName).toBe("LIPITOR")
    expect(result.data![0].patentCount).toBe(2)
    expect(result.data![0].exclusivityCount).toBe(1)
  })

  it("should search by applicant", async () => {
    const result = await handleSearchOrangeBook({ applicant: "pfizer" })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
  })

  it("should return all products when no filters", async () => {
    const result = await handleSearchOrangeBook({})
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.totalResults).toBe(2)
  })

  it("should respect pagination", async () => {
    const result = await handleSearchOrangeBook({ limit: 1 })
    expect(result.data).toHaveLength(1)
    expect(result.totalResults).toBe(2)
    expect(result.displayedResults).toBe(1)
  })

  it("should include dataSource", async () => {
    const result = await handleSearchOrangeBook({})
    expect(result.dataSource).toBeDefined()
    expect(result.dataSource!.name).toBe("FDA Orange Book")
  })
})

describe("handleSearchOrangeBookPatents", () => {
  it("should search patents by drug name", async () => {
    const result = await handleSearchOrangeBookPatents({ drugName: "lipitor" })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    expect(result.data![0].tradeName).toBe("LIPITOR")
  })

  it("should search patents by patent number", async () => {
    const result = await handleSearchOrangeBookPatents({ patentNo: "5273995" })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data![0].patentExpireDate).toBe("Jun 28, 2011")
  })

  it("should include exclusivity data", async () => {
    const result = await handleSearchOrangeBookPatents({ drugName: "lipitor" })
    expect(result.data![0].exclusivities).toHaveLength(1)
    expect(result.data![0].exclusivities[0].code).toBe("NCE")
  })
})

describe("handleSearchPurpleBook", () => {
  it("should search by product name", async () => {
    const result = await handleSearchPurpleBook({ productName: "humira" })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data![0].proprietaryName).toBe("HUMIRA")
  })

  it("should filter biosimilars", async () => {
    const result = await handleSearchPurpleBook({ biosimilar: true })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data![0].proprietaryName).toBe("AMJEVITA")
  })

  it("should filter by license type", async () => {
    const result = await handleSearchPurpleBook({ licenseType: "351(k)" })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data![0].blaType).toBe("351(k)")
  })

  it("should filter interchangeable", async () => {
    const result = await handleSearchPurpleBook({ interchangeable: true })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data![0].interchangeable).toBe(true)
  })
})

describe("handleSearchDrugPatentExpiry", () => {
  it("should return patents sorted by expiry date", async () => {
    const result = await handleSearchDrugPatentExpiry({ drugName: "lipitor" })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    // Should be sorted by earliest expiry first
    expect(result.data![0].patentExpireDate).toBe("Jul 21, 2007")
    expect(result.data![1].patentExpireDate).toBe("Jun 28, 2011")
  })

  it("sorts by expiry date, not by the date's text, with missing dates last", async () => {
    const patent = (patentNo: string, patentExpireDate: string): OrangeBookPatent => ({
      ...mockPatents[0]!,
      patentNo,
      patentExpireDate,
    })
    orangeBookSpy.mockResolvedValueOnce(
      Right({
        products: mockProducts,
        patents: [
          patent("A", "Dec 28, 2030"),
          patent("B", ""),
          patent("C", "Jan 1, 2031"),
          patent("D", "Feb 1, 2027"),
          patent("E", "Sep 5, 2030"),
          patent("F", "Feb 1, 2027"),
        ],
        exclusivities: [],
      }),
    )
    const result = await handleSearchDrugPatentExpiry({ limit: 100 })
    expect(result.data?.map((e) => e.patentNo)).toEqual(["D", "F", "E", "A", "C", "B"])
  })

  it("should include exclusivity by default", async () => {
    const result = await handleSearchDrugPatentExpiry({ drugName: "lipitor" })
    expect(result.data![0].exclusivities).toBeDefined()
  })

  it("should exclude exclusivity when requested", async () => {
    const result = await handleSearchDrugPatentExpiry({ drugName: "lipitor", includeExclusivity: false })
    expect(result.data![0].exclusivities).toEqual([])
  })

  it("should include Purple Book when requested", async () => {
    const result = await handleSearchDrugPatentExpiry({ drugName: "adalimumab", includePurpleBook: true })
    // Orange Book won't match "adalimumab", but Purple Book will
    expect(result.success).toBe(true)
    const purpleEntries = result.data!.filter((e) => e.source === "Purple Book")
    expect(purpleEntries.length).toBeGreaterThan(0)
  })
})

describe("bulk data errors", () => {
  it("returns a failure response when the Orange Book download fails", async () => {
    orangeBookSpy.mockResolvedValueOnce(Left(new Error("Failed to download: 503 Service Unavailable")))
    const result = await handleSearchOrangeBook({ drugName: "lipitor" })
    expect(result).toEqual({ success: false, error: "Failed to download: 503 Service Unavailable" })
  })

  it("returns a failure response when the Purple Book fetch fails", async () => {
    purpleBookSpy.mockResolvedValueOnce(Left(new Error("Failed to fetch Purple Book data: 500 Server Error")))
    const result = await handleSearchPurpleBook({ productName: "humira" })
    expect(result).toEqual({ success: false, error: "Failed to fetch Purple Book data: 500 Server Error" })
  })

  it("still returns Orange Book patents when the Purple Book is unavailable", async () => {
    purpleBookSpy.mockResolvedValueOnce(Left(new Error("Purple Book down")))
    const result = await handleSearchDrugPatentExpiry({ drugName: "lipitor", includePurpleBook: true })
    expect(result.success).toBe(true)
    expect(result.data?.every((entry) => entry.source === "Orange Book")).toBe(true)
    expect(result.data?.length).toBeGreaterThan(0)
  })
})
