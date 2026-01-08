# Tooling Reference

Comprehensive reference for all tooling configurations used in the typescript-library-template.

## tsup Configuration

tsup is the build tool that handles TypeScript compilation, bundling, and dual module format generation.

### Basic Configuration

File: `tsup.config.ts`

```typescript
import type { Options } from "tsup"

const env = process.env.NODE_ENV

export const tsup: Options = {
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["cjs", "esm"],
  minify: env === "production",
  bundle: env === "production",
  skipNodeModulesBundle: true,
  watch: env === "development",
  target: "es2020",
  outDir: env === "production" ? "dist" : "lib",
  entry: ["src/index.ts", "src/**/*.ts"],
}
```

### Configuration Options Explained

**entry** - Entry points for build:

```typescript
// Single entry
entry: ["src/index.ts"]

// Multiple entries
entry: ["src/index.ts", "src/utils.ts"]

// Glob pattern (all TypeScript files)
entry: ["src/**/*.ts"]
```

**format** - Output module formats:

```typescript
// Dual format (recommended for libraries)
format: ["cjs", "esm"]

// Triple format (includes IIFE for browser)
format: ["cjs", "esm", "iife"]

// Single format
format: ["esm"]
```

**dts** - TypeScript declaration files:

```typescript
// Generate .d.ts files
dts: true

// Generate with custom options
dts: {
  resolve: true,
  entry: ["src/index.ts"],
}
```

**outDir** - Output directory:

```typescript
// Environment-based (development vs production)
outDir: env === "production" ? "dist" : "lib"

// Fixed directory
outDir: "dist"
```

**minify** - Code minification:

```typescript
// Production only (recommended)
minify: env === "production"

// Always minify
minify: true

// Custom minifier
minify: "terser"
```

**sourcemap** - Source map generation:

```typescript
// Development only (recommended)
sourcemap: env !== "production"

// Always generate
sourcemap: true

// Inline sourcemaps
sourcemap: "inline"
```

**bundle** - Bundle dependencies:

```typescript
// Production only (recommended)
bundle: env === "production"

// Never bundle (useful for libraries)
bundle: false
```

**external** - External dependencies (don't bundle):

```typescript
// Exclude peer dependencies
external: ["react", "react-dom"]

// Regex pattern
external: [/^@myorg\//]
```

**splitting** - Code splitting:

```typescript
// Enable code splitting (for better tree-shaking)
splitting: true

// Disable
splitting: false
```

**target** - JavaScript target:

```typescript
// Modern Node.js
target: "es2020"

// Latest features
target: "esnext"

// Older compatibility
target: "es2015"
```

**watch** - Watch mode:

```typescript
// Development mode only
watch: env === "development"

// Always watch
watch: true

// With options
watch: {
  onRebuild(err) {
    if (err) console.error('Build failed:', err)
    else console.log('Build succeeded')
  }
}
```

**clean** - Clean output directory:

```typescript
// Always clean before build (recommended)
clean: true

// Keep previous builds
clean: false
```

### Advanced Patterns

**Multiple Entry Points with Custom Names:**

```typescript
export const tsup: Options = {
  entry: {
    index: "src/index.ts",
    utils: "src/utils/index.ts",
    types: "src/types/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
}
```

This generates:

- `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`
- `dist/utils.js`, `dist/utils.mjs`, `dist/utils.d.ts`
- `dist/types.js`, `dist/types.mjs`, `dist/types.d.ts`

**Browser-Compatible Build:**

```typescript
export const tsup: Options = {
  entry: ["src/index.ts"],
  format: ["esm", "iife"],
  globalName: "MyLib",
  platform: "browser",
  target: "es2015",
  dts: true,
}
```

**Library with Peer Dependencies:**

```typescript
export const tsup: Options = {
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  external: ["react", "react-dom"], // Don't bundle peer deps
  skipNodeModulesBundle: true,
}
```

## Vitest Configuration

Vitest is the test runner - fast, modern alternative to Jest.

### Basic Configuration

File: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.d.ts", "**/*.test.{js,ts}", "**/*.config.{js,ts}"],
    },
  },
})
```

### Configuration Options Explained

**globals** - Global test functions:

```typescript
// Enable globals (describe, it, expect available without import)
globals: true

// Require explicit imports
globals: false
```

**environment** - Test environment:

```typescript
// Node.js environment (for libraries)
environment: "node"

// Browser-like environment (for browser code)
environment: "jsdom"

// Happy DOM (faster alternative to jsdom)
environment: "happy-dom"
```

**include** - Test file patterns:

```typescript
// All common test patterns (default)
include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"]

// Only .spec.ts files
include: ["**/*.spec.ts"]

// Custom directory
include: ["test/**/*.test.ts"]
```

**exclude** - Exclude patterns:

```typescript
exclude: ["node_modules/", "dist/", ".idea/", ".git/", "**/*.d.ts"]
```

**coverage.provider** - Coverage tool:

```typescript
// v8 (faster, Node.js built-in)
provider: "v8"

// istanbul (more accurate in some cases)
provider: "istanbul"
```

**coverage.reporter** - Coverage report formats:

```typescript
// Multiple formats
reporter: ["text", "json", "html"]

// Text only (for CI)
reporter: ["text"]

// With lcov for tools like Codecov
reporter: ["text", "lcov"]
```

**coverage.include** - Files to cover:

```typescript
include: ["src/**/*.ts"]
```

**coverage.exclude** - Files to exclude from coverage:

```typescript
exclude: ["node_modules/", "dist/", "**/*.d.ts", "**/*.test.ts", "**/*.spec.ts", "**/*.config.ts"]
```

**coverage.threshold** - Minimum coverage:

```typescript
coverage: {
  threshold: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  }
}
```

### Advanced Patterns

**Test Setup File:**

```typescript
export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"], // Runs before each test file
  },
})
```

Example `test/setup.ts`:

```typescript
import { expect } from "vitest"

// Custom matchers or global setup
beforeEach(() => {
  // Runs before each test
})
```

**Multiple Environments:**

```typescript
export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ["**/*.dom.test.ts", "jsdom"], // DOM tests use jsdom
      ["**/*.node.test.ts", "node"], // Node tests use node
    ],
  },
})
```

**Watch Mode Options:**

```typescript
export default defineConfig({
  test: {
    watch: false, // Disable watch in CI
    poolOptions: {
      threads: {
        singleThread: true, // For debugging
      },
    },
  },
})
```

## ESLint Configuration

ESLint enforces code quality and style rules.

### Basic Configuration (Flat Config)

File: `eslint.config.mjs`

```javascript
import path from "node:path"
import { fileURLToPath } from "node:url"

import { FlatCompat } from "@eslint/eslintrc"
import js from "@eslint/js"
import typescriptEslint from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import prettier from "eslint-plugin-prettier"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import globals from "globals"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: [
      "**/.gitignore",
      "**/.eslintignore",
      "**/node_modules",
      "**/.DS_Store",
      "**/dist",
      "**/lib",
      "**/coverage",
    ],
  },
  ...compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"),
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "simple-import-sort": simpleImportSort,
      prettier,
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },

      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
    },

    rules: {
      "prettier/prettier": [
        "error",
        {},
        {
          usePrettierrc: true,
        },
      ],

      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
]
```

### Key Configuration Sections

**ignores** - Files to ignore:

```javascript
{
  ignores: ["**/node_modules", "**/dist", "**/lib", "**/coverage", "**/*.d.ts"]
}
```

**extends** - Base configurations:

```javascript
...compat.extends(
  "eslint:recommended",
  "plugin:@typescript-eslint/recommended",
  "plugin:prettier/recommended"
)
```

**plugins** - ESLint plugins:

```javascript
plugins: {
  "@typescript-eslint": typescriptEslint,
  "simple-import-sort": simpleImportSort,
  "prettier": prettier
}
```

**languageOptions** - Parser and globals:

```javascript
languageOptions: {
  globals: {
    ...globals.node,
    ...globals.es2021,
  },
  parser: tsParser,
  ecmaVersion: 2020,
  sourceType: "module"
}
```

**rules** - Custom rule configuration:

```javascript
rules: {
  // Prettier integration
  "prettier/prettier": ["error", {}, { usePrettierrc: true }],

  // TypeScript rules
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/explicit-function-return-type": "off",
  "@typescript-eslint/no-explicit-any": "warn",

  // Import sorting
  "simple-import-sort/imports": "error",
  "simple-import-sort/exports": "error"
}
```

### Common Rule Configurations

**Strict TypeScript:**

```javascript
rules: {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/strict-boolean-expressions": "error",
  "@typescript-eslint/no-unused-vars": ["error", {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_"
  }]
}
```

**Relaxed for Prototyping:**

```javascript
rules: {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-unused-vars": "warn",
  "@typescript-eslint/ban-ts-comment": "off"
}
```

## Prettier Configuration

Prettier handles code formatting automatically.

### Basic Configuration

File: `.prettierrc` or in `package.json`

```json
{
  "semi": false,
  "trailingComma": "all",
  "singleQuote": false,
  "printWidth": 120,
  "tabWidth": 2,
  "endOfLine": "auto"
}
```

### Configuration Options

**semi** - Semicolons:

```json
"semi": false  // No semicolons (recommended)
"semi": true   // Always semicolons
```

**trailingComma** - Trailing commas:

```json
"trailingComma": "all"    // Everywhere possible (recommended)
"trailingComma": "es5"    // ES5 valid locations only
"trailingComma": "none"   // No trailing commas
```

**singleQuote** - Quote style:

```json
"singleQuote": false  // Double quotes (recommended)
"singleQuote": true   // Single quotes
```

**printWidth** - Line width:

```json
"printWidth": 120  // 120 characters (recommended)
"printWidth": 80   // 80 characters (traditional)
```

**tabWidth** - Indentation:

```json
"tabWidth": 2  // 2 spaces (recommended)
"tabWidth": 4  // 4 spaces
```

**endOfLine** - Line endings:

```json
"endOfLine": "auto"  // Auto-detect (recommended)
"endOfLine": "lf"    // Unix (LF)
"endOfLine": "crlf"  // Windows (CRLF)
```

### Ignore Files

Create `.prettierignore`:

```
dist
lib
node_modules
coverage
*.min.js
```

## TypeScript Configuration

TypeScript compiler configuration for strict type checking.

### Basic Configuration

File: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "lib": ["ESNext"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitAny": false,
    "strictPropertyInitialization": false,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "lib", "**/*.spec.ts", "**/*.test.ts"]
}
```

### Key Options Explained

**target** - JavaScript version:

```json
"target": "ESNext"    // Latest JS features
"target": "ES2020"    // Modern but stable
"target": "ES2015"    // Wider compatibility
```

**module** - Module system:

```json
"module": "ESNext"    // For bundlers (recommended)
"module": "CommonJS"  // For Node.js
"module": "NodeNext"  // For modern Node.js
```

**moduleResolution** - How modules are resolved:

```json
"moduleResolution": "bundler"  // For bundlers like tsup (recommended)
"moduleResolution": "node"     // Node.js style
"moduleResolution": "nodenext" // Modern Node.js
```

**strict** - Strict type checking:

```json
"strict": true  // Enable all strict checks (recommended)
```

**noImplicitAny** - Implicit any errors:

```json
"noImplicitAny": false  // Pragmatic (allow some implicit any)
"noImplicitAny": true   // Strict (no implicit any)
```

**strictPropertyInitialization** - Class property initialization:

```json
"strictPropertyInitialization": false  // More flexible (recommended)
"strictPropertyInitialization": true   // Strict initialization
```

### Path Mapping

For absolute imports:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@utils/*": ["src/utils/*"]
    }
  }
}
```

Usage:

```typescript
import { helper } from "@/utils/helper"
import { MyClass } from "@utils/MyClass"
```

## Integration Examples

### package.json Complete Example

```json
{
  "name": "my-library",
  "version": "1.0.0",
  "description": "My TypeScript library",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "import": "./dist/index.mjs"
    }
  },
  "files": ["dist", "lib"],
  "scripts": {
    "validate": "pnpm format && pnpm lint && pnpm test && pnpm build",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint ./src --fix",
    "lint:check": "eslint ./src",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "build": "rimraf dist && cross-env NODE_ENV=production tsup",
    "build:watch": "tsup --watch",
    "dev": "tsup --watch",
    "prepublishOnly": "pnpm validate",
    "ts-types": "tsc --noEmit"
  }
}
```

### Complete File Structure

```
my-library/
├── .claude/
│   └── skills/
│       └── typescript-standards/
├── src/
│   ├── index.ts
│   └── utils/
├── test/
│   └── index.spec.ts
├── .gitignore
├── .prettierrc
├── eslint.config.mjs
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── CLAUDE.md
└── README.md
```

## Troubleshooting

### Build Issues

**Problem**: "Cannot find module"
**Solution**: Check tsup external configuration or package.json exports

**Problem**: "Types not generated"
**Solution**: Ensure `dts: true` in tsup.config.ts

### Test Issues

**Problem**: "Test files not found"
**Solution**: Check vitest.config.ts include patterns

**Problem**: "Coverage incomplete"
**Solution**: Review coverage.exclude and coverage.include in vitest.config.ts

### Linting Issues

**Problem**: "Parsing error"
**Solution**: Ensure @typescript-eslint/parser is configured correctly

**Problem**: "Rule conflicts"
**Solution**: Make sure eslint-config-prettier is last in extends

## Resources

- **tsup**: https://tsup.egoist.dev/
- **Vitest**: https://vitest.dev/
- **ESLint**: https://eslint.org/
- **Prettier**: https://prettier.io/
- **TypeScript**: https://www.typescriptlang.org/
