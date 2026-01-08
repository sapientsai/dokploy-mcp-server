## typescript-library-template

[![Node.js CI](https://github.com/jordanburke/typescript-library-template/actions/workflows/node.js.yml/badge.svg)](https://github.com/jordanburke/typescript-library-template/actions/workflows/node.js.yml)
[![CodeQL](https://github.com/jordanburke/typescript-library-template/actions/workflows/codeql.yml/badge.svg)](https://github.com/jordanburke/typescript-library-template/actions/workflows/codeql.yml)

A modern TypeScript library template with standardized build scripts and tooling.

## Features

- **Modern Build System**: [ts-builds](https://github.com/jordanburke/ts-builds) + [tsdown](https://tsdown.dev/) for fast bundling
- **Testing**: [Vitest](https://vitest.dev/) with coverage reporting
- **Code Quality**: ESLint + Prettier with automatic formatting and fixing
- **Dual Format**: Outputs both CommonJS and ES modules with proper TypeScript declarations
- **Standardized Scripts**: Consistent commands via ts-builds across all projects

## Quick Start

1. **Use this template** to create a new repository
2. **Clone your new repository**
3. **Install dependencies**: `pnpm install`
4. **Start developing**: `pnpm dev` (builds with watch mode)
5. **Before committing**: `pnpm validate` (format + lint + test + build)

## Development Commands

### Pre-Checkin Command

```bash
pnpm validate  # Main command: format, lint, test, and build everything
```

### Individual Commands

```bash
# Formatting
pnpm format        # Format code with Prettier
pnpm format:check  # Check formatting without writing

# Linting
pnpm lint          # Fix ESLint issues
pnpm lint:check    # Check ESLint issues without fixing

# Testing
pnpm test          # Run tests once
pnpm test:watch    # Run tests in watch mode
pnpm test:coverage # Run tests with coverage report

# Building
pnpm build         # Production build
pnpm dev           # Development mode with watch

# Type Checking
pnpm typecheck     # Check TypeScript types
```

## Publishing

The template automatically runs `pnpm validate` before publishing via the `prepublishOnly` script.

```bash
npm version patch|minor|major
npm publish --access public
```

## Project Structure

```
src/
├── index.ts          # Main library entry point
test/
├── *.spec.ts         # Test files
dist/                 # Built output (CommonJS + ES modules + types)
```

## Tooling

- **Build**: [ts-builds](https://github.com/jordanburke/ts-builds) - Centralized TypeScript toolchain
- **Bundler**: [tsdown](https://tsdown.dev/) - Fast TypeScript bundler (successor to tsup)
- **Test**: [Vitest](https://vitest.dev/) - Fast unit test framework
- **Lint**: [ESLint](https://eslint.org/) with TypeScript support
- **Format**: [Prettier](https://prettier.io/) with ESLint integration
- **Package Manager**: [pnpm](https://pnpm.io/) for fast, efficient installs

## Claude Code Skill

This repository includes a Claude Code skill to help you apply these standards to other projects:

**Location**: `.claude/skills/typescript-standards/`

**Usage**: When using Claude Code, the skill automatically provides guidance for:

- Creating new libraries from this template
- Applying these standards to existing TypeScript projects
- Configuring tooling (ts-builds, Vitest, ESLint, Prettier)
- Setting up dual module format

**Installation** (for use in other projects):

```bash
# Copy the skill to your Claude Code skills directory
cp -r .claude/skills/typescript-standards ~/.claude/skills/
```

**References**:

- [CLAUDE.md](./CLAUDE.md) - Development guidance for this project
- [STANDARDIZATION_GUIDE.md](./STANDARDIZATION_GUIDE.md) - Guide for applying these patterns to existing projects
- [.claude/skills/typescript-standards/](./.claude/skills/typescript-standards/) - Complete skill documentation

---

_This template is based on the earlier work of https://github.com/orabazu/tsup-library-template but updated with modern tooling and standardized scripts._
