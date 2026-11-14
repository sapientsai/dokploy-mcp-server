// Bundle the test Worker the way a consumer's Workers build would.
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const ENTRY = fileURLToPath(new URL("./worker.ts", import.meta.url))

export const bundleWorker = async (): Promise<string> => {
  const result = await build({
    bundle: true,
    conditions: ["workerd", "worker", "browser"],
    entryPoints: [ENTRY],
    format: "esm",
    logLevel: "silent",
    mainFields: ["module", "main"],
    // "neutral" knows no Node built-ins, so importing one fails the build outright.
    platform: "neutral",
    target: "es2022",
    write: false,
  })
  return result.outputFiles[0]?.text ?? ""
}
