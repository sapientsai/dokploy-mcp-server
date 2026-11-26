import { defineConfig } from "tsdown"

const isProduction = process.env.NODE_ENV === "production"

export default defineConfig([
  // The library and the Worker build in one pass. Nothing here imports Node built-ins, so a shared
  // chunk can't leak them into the Worker; `pnpm check:worker` enforces that.
  {
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
  },
  // The `quota-hook` command, for Node, built on its own so its Node built-ins stay out of the Worker.
  {
    clean: false,
    dts: false,
    entry: { hook: "src/hook/main.ts" },
    deps: { neverBundle: ["functype", /^functype\//] },
    format: ["esm"],
    minify: isProduction,
    outDir: "dist",
    outExtensions: () => ({ js: ".js" }),
    platform: "node",
    sourcemap: false,
    target: "node22",
    treeshake: true,
    banner: { js: "#!/usr/bin/env node" },
  },
])
