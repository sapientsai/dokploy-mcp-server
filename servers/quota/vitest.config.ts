import { configDefaults, defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "ts-builds/vitest"

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Local git worktrees carry their own copy of the suite and dependencies.
      exclude: [...configDefaults.exclude, ".worktrees/**"],
    },
  }),
)
