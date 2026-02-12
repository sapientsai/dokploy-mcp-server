type RequestOptions = {
  method: "GET" | "POST"
  params?: Record<string, string | number | boolean | undefined>
  body?: Record<string, unknown>
}

export class DokployClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.apiKey = apiKey
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>(path, { method: "GET", params })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, { method: "POST", body })
  }

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = new URL(`/api/${path}`, this.baseUrl)

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      Accept: "application/json",
    }

    const init: RequestInit = {
      method: options.method,
      headers,
    }

    if (options.body) {
      headers["Content-Type"] = "application/json"
      init.body = JSON.stringify(options.body)
    }

    const response = await fetch(url.toString(), init)

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(
        `Dokploy API error (${response.status} ${response.statusText}) on ${options.method} /${path}: ${errorText}`,
      )
    }

    const text = await response.text()
    if (!text) {
      return undefined as T
    }

    return JSON.parse(text) as T
  }
}

let client: DokployClient | undefined

export function initializeDokployClient(baseUrl: string, apiKey: string): DokployClient {
  client = new DokployClient(baseUrl, apiKey)
  return client
}

export function getDokployClient(): DokployClient {
  if (!client) {
    throw new Error(
      "Dokploy client not initialized. Ensure DOKPLOY_URL and DOKPLOY_API_KEY environment variables are set.",
    )
  }
  return client
}
