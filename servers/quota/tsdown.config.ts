import { defineConfig } from "tsdown"

const isProduction = process.env.NODE_ENV === "production"

// The library and the Worker build in one pass. Nothing here imports Node built-ins, so a shared
// chunk can't leak them into the Worker; `pnpm check:worker` enforces that.
export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: "src/index.ts",
    worker: "src/worker.ts",
  },
  deps: { neverBundle: ["somamcp", /^somamcp\//, "functype", /^functype\//, "zod"] },
  format: ["esm"],
  minify: isProduction,
  outDir: "dist",
  outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  platform: "neutral",
  sourcemap: !isProduction,
  target: "es2022",
  treeshake: true,
})
