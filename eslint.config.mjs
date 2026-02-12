import baseConfig from "ts-builds/eslint"

export default [
  ...baseConfig,
  {
    files: ["src/**/__tests__/**/*.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]
