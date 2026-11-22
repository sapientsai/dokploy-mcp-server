import baseConfig from "ts-builds/eslint-functype"

export default [
  {
    ignores: ["src/generated/**", "dist/**", "node_modules/**", "coverage/**"],
  },
  ...baseConfig,
]
