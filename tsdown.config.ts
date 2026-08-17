import { defineConfig } from "tsdown"

const isProduction = process.env.NODE_ENV === "production"

// The library/worker entries and the Node CLI are built in one pass; unlike
// somamcp itself, nothing here imports Node built-ins, so a shared chunk cannot
// leak them into the worker bundle. `pnpm check:worker` enforces that.
export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: "src/index.ts",
    node: "src/node.ts",
    worker: "src/worker.ts",
  },
  external: ["somamcp", /^somamcp\//, "functype", /^functype\//, "zod"],
  format: ["esm"],
  minify: isProduction,
  outDir: "dist",
  outExtensions: () => ({ dts: ".d.ts", js: ".js" }),
  platform: "neutral",
  sourcemap: !isProduction,
  target: "es2022",
  treeshake: true,
})
