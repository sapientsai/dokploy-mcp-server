/**
 * Bulk Data Client
 * Downloads and parses FDA Orange Book and Purple Book data files
 */

import { unzipSync } from "fflate"

import type { OrangeBookExclusivity, OrangeBookPatent, OrangeBookProduct, PurpleBookEntry } from "../types/fda.js"
import { loggers } from "./logger.js"

const ORANGE_BOOK_ZIP_URL = "https://www.fda.gov/media/76860/download"
const PURPLE_BOOK_API_URL = "https://purplebooksearch.fda.gov/api/v1/fdaproducts"
const PURPLE_BOOK_API_TOKEN = "18dd75c5-23c2-4318-970b-ca97c34470cb"

type CacheEntry<T> = {
  data: T
  fetchedAt: number
  ttlMs: number
}

type OrangeBookData = {
  products: OrangeBookProduct[]
  patents: OrangeBookPatent[]
  exclusivities: OrangeBookExclusivity[]
}

export class BulkDataClient {
  private orangeBookCache: CacheEntry<OrangeBookData> | undefined
  private purpleBookCache: CacheEntry<PurpleBookEntry[]> | undefined

  private isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
    if (!entry) return false
    return Date.now() - entry.fetchedAt < entry.ttlMs
  }

  async downloadBinary(url: string): Promise<Uint8Array> {
    loggers.bulk(`Downloading: ${url}`)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
    }
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  }

  parseTildeDelimited<T extends Record<string, string>>(text: string): T[] {
    const lines = text.split("\n").filter((line) => line.trim() !== "")
    if (lines.length < 2) return []

    const headers = lines[0].split("~").map((h) => h.trim())
    const results: T[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split("~")
      const record: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        record[headers[j]] = (values[j] ?? "").trim()
      }
      results.push(record as T)
    }

    return results
  }

  parseCSV<T extends Record<string, string>>(text: string): T[] {
    const lines = text.split("\n").filter((line) => line.trim() !== "")
    if (lines.length < 2) return []

    const headers = this.parseCSVLine(lines[0])
    const results: T[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i])
      const record: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        record[headers[j]] = (values[j] ?? "").trim()
      }
      results.push(record as T)
    }

    return results
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          current += char
        }
      } else {
        if (char === '"') {
          inQuotes = true
        } else if (char === ",") {
          result.push(current.trim())
          current = ""
        } else {
          current += char
        }
      }
    }
    result.push(current.trim())
    return result
  }

  async getOrangeBookData(): Promise<OrangeBookData> {
    if (this.isCacheValid(this.orangeBookCache)) {
      loggers.bulk("Using cached Orange Book data")
      return this.orangeBookCache.data
    }

    loggers.bulk("Downloading Orange Book ZIP...")
    const zipData = await this.downloadBinary(ORANGE_BOOK_ZIP_URL)
    const files = unzipSync(zipData)

    const decoder = new TextDecoder("utf-8")
    let products: OrangeBookProduct[] = []
    let patents: OrangeBookPatent[] = []
    let exclusivities: OrangeBookExclusivity[] = []

    for (const [filename, content] of Object.entries(files)) {
      const lowerName = filename.toLowerCase()
      const text = decoder.decode(content)

      if (lowerName.includes("products")) {
        products = this.parseTildeDelimited<Record<string, string>>(text).map((r) => ({
          ingredient: r["Ingredient"] ?? r["ingredient"] ?? "",
          dfRoute: r["DF;Route"] ?? r["df;route"] ?? r["DF_Route"] ?? "",
          tradeName: r["Trade_Name"] ?? r["trade_name"] ?? "",
          applicant: r["Applicant"] ?? r["applicant"] ?? "",
          applType: r["Appl_Type"] ?? r["appl_type"] ?? "",
          applNo: r["Appl_No"] ?? r["appl_no"] ?? "",
          productNo: r["Product_No"] ?? r["product_no"] ?? "",
          teCode: r["TE_Code"] ?? r["te_code"] ?? "",
          approvalDate: r["Approval_Date"] ?? r["approval_date"] ?? "",
          rld: r["RLD"] ?? r["rld"] ?? "",
          rs: r["RS"] ?? r["rs"] ?? "",
          type: r["Type"] ?? r["type"] ?? "",
          applicantFullName: r["Applicant_Full_Name"] ?? r["applicant_full_name"] ?? "",
        }))
        loggers.bulk(`Parsed ${products.length} Orange Book products`)
      } else if (lowerName.includes("patent")) {
        patents = this.parseTildeDelimited<Record<string, string>>(text).map((r) => ({
          applType: r["Appl_Type"] ?? r["appl_type"] ?? "",
          applNo: r["Appl_No"] ?? r["appl_no"] ?? "",
          productNo: r["Product_No"] ?? r["product_no"] ?? "",
          patentNo: r["Patent_No"] ?? r["patent_no"] ?? "",
          patentExpireDate: r["Patent_Expire_Date_Text"] ?? r["patent_expire_date_text"] ?? "",
          drugSubstanceFlag: r["Drug_Substance_Flag"] ?? r["drug_substance_flag"] ?? "",
          drugProductFlag: r["Drug_Product_Flag"] ?? r["drug_product_flag"] ?? "",
          patentUseCode: r["Patent_Use_Code"] ?? r["patent_use_code"] ?? "",
          delistFlag: r["Delist_Flag"] ?? r["delist_flag"] ?? "",
          submissionDate: r["Submission_Date"] ?? r["submission_date"] ?? "",
        }))
        loggers.bulk(`Parsed ${patents.length} Orange Book patents`)
      } else if (lowerName.includes("exclusivity")) {
        exclusivities = this.parseTildeDelimited<Record<string, string>>(text).map((r) => ({
          applType: r["Appl_Type"] ?? r["appl_type"] ?? "",
          applNo: r["Appl_No"] ?? r["appl_no"] ?? "",
          productNo: r["Product_No"] ?? r["product_no"] ?? "",
          exclusivityCode: r["Exclusivity_Code"] ?? r["exclusivity_code"] ?? "",
          exclusivityDate: r["Exclusivity_Date"] ?? r["exclusivity_date"] ?? "",
        }))
        loggers.bulk(`Parsed ${exclusivities.length} Orange Book exclusivities`)
      }
    }

    const data: OrangeBookData = { products, patents, exclusivities }

    this.orangeBookCache = {
      data,
      fetchedAt: Date.now(),
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    }

    return data
  }

  async getPurpleBookData(): Promise<PurpleBookEntry[]> {
    if (this.isCacheValid(this.purpleBookCache)) {
      loggers.bulk("Using cached Purple Book data")
      return this.purpleBookCache.data
    }

    loggers.bulk("Fetching Purple Book data from API...")

    const url = `${PURPLE_BOOK_API_URL}?token=${PURPLE_BOOK_API_TOKEN}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch Purple Book data: ${response.status} ${response.statusText}`)
    }

    const rawEntries = (await response.json()) as Array<Record<string, string>>
    loggers.bulk(`Received ${rawEntries.length} Purple Book entries from API`)

    const entries: PurpleBookEntry[] = rawEntries.map((r) => ({
      blaNumber: r.bla_number ?? "",
      proprietaryName: r.proprietary_name ?? "",
      properName: r.proper_name ?? "",
      applicant: r.applicant ?? "",
      blaType: r.license_type ?? "",
      strength: r.strength ?? "",
      dosageForm: r.dosage_form ?? "",
      route: r.route_of_administration ?? "",
      productPresentation: r.product_presentation ?? "",
      status: r.status ?? "",
      licensingStatus: r.licensure ?? "",
      referenceProductBla: r.ref_product_proper_name?.trim() ?? "",
      referenceProductProprietaryName: r.ref_prod_proprietary_name ?? "",
      biosimilar: (r.license_type ?? "") === "351(k)",
      interchangeable: (r.interchangeable_approval_date ?? "").trim() !== "",
      approvalDate: r.approval_date ?? r.date_of_first_licensure ?? "",
    }))

    this.purpleBookCache = {
      data: entries,
      fetchedAt: Date.now(),
      ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    }

    return entries
  }

  clearCache(): void {
    this.orangeBookCache = undefined
    this.purpleBookCache = undefined
  }
}

// Singleton instance
export const bulkDataClient = new BulkDataClient()
