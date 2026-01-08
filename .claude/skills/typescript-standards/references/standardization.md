# Project Standardization Guide

Complete guide for applying typescript-library-template standards to existing TypeScript projects.

## Overview

This guide helps you migrate existing TypeScript projects to use the standardized tooling, build configuration, and workflow from typescript-library-template.

## Pre-Migration Assessment

Before starting, analyze your current project:

### Current State Checklist

- [ ] What build tool are you using? (webpack, rollup, tsc, etc.)
- [ ] What test framework? (Jest, Mocha, AVA, etc.)
- [ ] Current linting setup? (ESLint with what config?)
- [ ] Module format? (CJS only, ESM only, or dual?)
- [ ] TypeScript configuration? (strict mode? target?)
- [ ] Script command naming? (build vs compile, test vs spec?)

### Compatibility Check

This standardization works best for:

- ✅ TypeScript libraries or packages
- ✅ Node.js modules (not browser-only apps)
- ✅ Projects targeting dual module format
- ✅ npm packages intended for publishing

May require adaptation for:

- ⚠️ React/Vue/Angular applications (keep framework tooling)
- ⚠️ Browser-only libraries (may not need CJS)
- ⚠️ Projects with complex webpack configs (evaluate if tsup can replace)
- ⚠️ Monorepos (apply per package, not root)

## Migration Steps

### Step 1: Backup Current Project

```bash
# Create a backup branch
git checkout -b pre-standardization-backup

# Or create a full copy
cp -r . ../project-backup
```

### Step 2: Update package.json Scripts

Replace your existing scripts with the standardized pattern:

```json
{
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

**Key changes:**

- `validate` as the main pre-checkin command
- Clear separation: `format` vs `format:check`, `lint` vs `lint:check`
- Vitest for testing (replaces Jest/Mocha)
- tsup for building (replaces webpack/rollup/tsc)
- `dev` for watch mode development

### Step 3: Update Dependencies

**Remove old dependencies:**

```bash
# Build tools (if using these)
pnpm remove webpack webpack-cli rollup @rollup/plugin-typescript

# Test frameworks (if using these)
pnpm remove jest ts-jest @types/jest mocha chai

# Old linting (if using these)
pnpm remove tslint
```

**Install new dependencies:**

```bash
# Build tool
pnpm add -D tsup cross-env rimraf

# Testing
pnpm add -D vitest @vitest/coverage-v8 @vitest/ui

# Linting and formatting
pnpm add -D eslint @eslint/js @eslint/eslintrc
pnpm add -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
pnpm add -D eslint-config-prettier eslint-plugin-prettier
pnpm add -D eslint-plugin-simple-import-sort eslint-plugin-import
pnpm add -D prettier

# TypeScript
pnpm add -D typescript @types/node ts-node

# Utilities
pnpm add -D globals
```

### Step 4: Create tsup Configuration

Create `tsup.config.ts` in project root:

```typescript
import { defineConfig } from "tsup"

const isDev = process.env.NODE_ENV !== "production"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: isDev,
  clean: true,
  outDir: isDev ? "lib" : "dist",
  minify: !isDev,
  treeshake: !isDev,
})
```

**Customize for your project:**

- **Multiple entry points**: `entry: ["src/index.ts", "src/utils.ts"]`
- **Additional formats**: `format: ["cjs", "esm", "iife"]`
- **External dependencies**: `external: ["peer-dependency-name"]`
- **Bundle splitting**: `splitting: true` (for code splitting)

### Step 5: Create Vitest Configuration

Create `vitest.config.ts` in project root:

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/**/*.test.ts", "**/*.d.ts", "**/node_modules/**"],
    },
  },
})
```

**Migrate tests:**

If migrating from Jest:

```typescript
// Old Jest test
import { describe, test, expect } from "@jest/globals"

test("example", () => {
  expect(true).toBe(true)
})

// New Vitest test (very similar!)
import { describe, it, expect } from "vitest"

it("example", () => {
  expect(true).toBe(true)
})
```

Most Jest tests work with minimal changes. Main differences:

- Import from `vitest` instead of `@jest/globals`
- Use `it` instead of `test` (both work, but `it` is conventional)
- Some advanced mocking APIs may differ

### Step 6: Create ESLint Configuration

Create `eslint.config.mjs` (flat config format):

```javascript
import eslint from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import prettier from "eslint-plugin-prettier"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import globals from "globals"

export default [
  {
    ignores: ["dist/**", "lib/**", "node_modules/**", "coverage/**"],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettier,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "prettier/prettier": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]
```

### Step 7: Create Prettier Configuration

Create `.prettierrc` (or add to package.json):

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

Or in package.json:

```json
{
  "prettier": {
    "semi": false,
    "trailingComma": "all",
    "singleQuote": false,
    "printWidth": 120,
    "tabWidth": 2,
    "endOfLine": "auto"
  }
}
```

### Step 8: Update TypeScript Configuration

Update `tsconfig.json` for strict mode:

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

**Key settings:**

- `strict: true` - Enable all strict checks
- `noImplicitAny: false` - Pragmatic: allow implicit any in some cases
- `strictPropertyInitialization: false` - Easier constructor patterns
- `target: "ESNext"` - Let tsup handle transpilation
- `declaration: true` - Generate .d.ts files (though tsup handles this)

### Step 9: Update package.json Exports

Update your package.json for dual module format:

```json
{
  "name": "your-package",
  "version": "1.0.0",
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
  "files": ["lib", "dist"]
}
```

**For multiple entry points:**

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "import": "./dist/index.mjs"
    },
    "./utils": {
      "types": "./dist/utils.d.ts",
      "require": "./dist/utils.js",
      "import": "./dist/utils.mjs"
    }
  }
}
```

### Step 10: Update .gitignore

Ensure these are ignored:

```
# Build outputs
dist/
lib/

# Dependencies
node_modules/

# Coverage
coverage/
.nyc_output/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Environment
.env
.env.local
```

### Step 11: Test the Migration

```bash
# Clean old builds
rm -rf dist lib build out

# Install dependencies
pnpm install

# Try the dev workflow
pnpm dev

# In another terminal, run tests
pnpm test:watch

# Run full validation
pnpm validate
```

**If validation passes**, migration is successful!

### Step 12: Update CI/CD Pipelines

Update GitHub Actions workflows:

**Before:**

```yaml
- run: npm run build
- run: npm run lint
- run: npm run test
```

**After:**

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v2
  with:
    version: 10

- run: pnpm install
- run: pnpm validate
```

Simple and consistent!

### Step 13: Update Documentation

Update your project documentation:

**README.md:**

```markdown
## Development

# Install dependencies

pnpm install

# Development mode (watch)

pnpm dev

# Run tests

pnpm test

# Validate before commit

pnpm validate
```

**CLAUDE.md:**

Add standardized commands section (see template's CLAUDE.md).

## Migration Patterns

### From Webpack to tsup

**Old webpack.config.js:**

```javascript
module.exports = {
  entry: "./src/index.ts",
  output: {
    filename: "bundle.js",
    library: "MyLib",
    libraryTarget: "umd",
  },
  module: {
    rules: [{ test: /\.ts$/, use: "ts-loader" }],
  },
}
```

**New tsup.config.ts:**

```typescript
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // More modern than UMD
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
})
```

Benefits:

- ✅ Simpler configuration
- ✅ Built-in TypeScript support
- ✅ Automatic dual format
- ✅ Much faster builds

### From Rollup to tsup

**Old rollup.config.js:**

```javascript
import typescript from "@rollup/plugin-typescript"

export default {
  input: "src/index.ts",
  output: [
    { file: "dist/index.js", format: "cjs" },
    { file: "dist/index.esm.js", format: "es" },
  ],
  plugins: [typescript()],
}
```

**New tsup.config.ts:**

```typescript
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
})
```

Same output, less config!

### From Jest to Vitest

**Old jest.config.js:**

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverageFrom: ["src/**/*.ts"],
  coveragePathIgnorePatterns: ["/node_modules/", "/test/"],
}
```

**New vitest.config.ts:**

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.spec.ts", "**/*.test.ts"],
    },
  },
})
```

**Test migration:**

Most Jest tests work as-is! Just change imports:

```typescript
// Change this:
import { describe, test, expect } from "@jest/globals"

// To this:
import { describe, it, expect } from "vitest"
```

### From TSLint to ESLint

If you're still using TSLint (deprecated):

1. **Remove TSLint**: `pnpm remove tslint`
2. **Install ESLint**: Follow Step 6 above
3. **Migrate rules**: Most TSLint rules have ESLint equivalents
4. **Run migration**: `npx tslint-to-eslint-config` (if needed)

## Common Issues and Solutions

### Issue: "Module not found" after migration

**Problem**: Import paths changed or external dependencies not configured.

**Solution**:

```typescript
// tsup.config.ts
export default defineConfig({
  external: ["peer-dependency-name"], // Don't bundle peer deps
})
```

### Issue: Tests not running

**Problem**: Test files not found or wrong pattern.

**Solution**: Check vitest.config.ts includes your test pattern:

```typescript
test: {
  include: ['**/*.{test,spec}.{ts,tsx}'],  // Adjust pattern
}
```

### Issue: Build outputs to wrong directory

**Problem**: Old build artifacts in different locations.

**Solution**:

```bash
# Clean everything
rm -rf dist lib build out .next .nuxt

# Rebuild
pnpm build
```

### Issue: Types not generated

**Problem**: TypeScript declaration files missing.

**Solution**: Ensure tsup.config.ts has `dts: true`:

```typescript
export default defineConfig({
  dts: true, // Generate .d.ts files
})
```

### Issue: Linting fails on valid code

**Problem**: ESLint rules too strict or misconfigured.

**Solution**: Adjust rules in eslint.config.mjs:

```javascript
rules: {
  "@typescript-eslint/no-explicit-any": "warn", // Change from "error" to "warn"
  // Or disable specific rules:
  "@typescript-eslint/no-unused-vars": "off",
}
```

### Issue: Format conflicts between Prettier and ESLint

**Problem**: Competing formatting rules.

**Solution**: Ensure eslint-config-prettier is loaded:

```javascript
import prettier from "eslint-config-prettier"

export default [
  // ... other configs
  prettier, // Must be last to override other rules
]
```

## Validation Checklist

After migration, verify:

- [ ] `pnpm install` completes without errors
- [ ] `pnpm dev` builds successfully
- [ ] `pnpm test` passes all tests
- [ ] `pnpm lint` reports no errors
- [ ] `pnpm format:check` shows code is formatted
- [ ] `pnpm build` produces dist/ with .js, .mjs, and .d.ts files
- [ ] `pnpm validate` passes completely
- [ ] Old build artifacts removed
- [ ] package.json exports configured correctly
- [ ] CI/CD updated to use `pnpm validate`
- [ ] Documentation updated with new commands

## Rollback Plan

If migration fails or causes issues:

```bash
# Revert to backup
git checkout pre-standardization-backup

# Or restore from copy
rm -rf project-dir
cp -r ../project-backup project-dir
```

## Benefits After Migration

Once standardized, you gain:

1. **Consistency** - Same commands across all projects
2. **Modern tooling** - Faster builds with tsup, better DX with Vitest
3. **Dual format** - Automatic CommonJS and ES module support
4. **Type safety** - Strict TypeScript configuration
5. **Quality gates** - Single `validate` command ensures everything passes
6. **CI/CD simplicity** - One command to rule them all
7. **Documentation** - Clear, consistent developer experience

## Next Steps

After successful migration:

1. **Train your team** - Share new commands and workflow
2. **Update CI/CD** - Simplify to `pnpm validate`
3. **Publish new version** - If npm package, publish with new build
4. **Monitor issues** - Watch for any compatibility problems
5. **Iterate** - Adjust configuration as needed

## Resources

- **Template Repository**: https://github.com/jordanburke/typescript-library-template
- **tsup Documentation**: https://tsup.egoist.dev/
- **Vitest Migration**: https://vitest.dev/guide/migration.html
- **ESLint Flat Config**: https://eslint.org/docs/latest/use/configure/configuration-files
