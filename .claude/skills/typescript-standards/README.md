# TypeScript Standards Skill

Claude Code skill for creating and standardizing TypeScript library projects.

## Overview

This skill provides comprehensive guidance for:

- Creating new TypeScript libraries from the typescript-library-template
- Applying standardized tooling and scripts to existing projects
- Configuring modern build tools (tsup, Vitest, ESLint, Prettier)
- Setting up dual module format (CommonJS + ES modules)

## Skill Contents

```
typescript-standards/
├── SKILL.md                        # Main skill guide (loaded by Claude Code)
└── references/
    ├── template-setup.md           # Complete guide for new projects
    ├── standardization.md          # Migration guide for existing projects
    └── tooling-reference.md        # Configuration reference for all tools
```

## When Claude Code Uses This Skill

The skill automatically activates when:

- Creating new TypeScript libraries or npm packages
- Standardizing build scripts across TypeScript projects
- Setting up or migrating to dual module format
- Configuring tsup, Vitest, ESLint, or Prettier
- Publishing packages to npm
- Migrating from webpack, rollup, Jest, or other tools

## Installation

### For Use in Other Projects

```bash
# Copy to Claude Code skills directory
cp -r .claude/skills/typescript-standards ~/.claude/skills/

# Verify installation
ls ~/.claude/skills/typescript-standards
```

### For Marketplace Distribution

This skill is configured for marketplace distribution via `.claude-plugin/marketplace.json`.

## Key Features

### 1. Template Setup Guide

Complete walkthrough for creating new libraries:

- Clone and customize the template
- Project configuration checklist
- Development workflow
- Publishing to npm
- CI/CD setup

See: `references/template-setup.md`

### 2. Standardization Guide

Migrate existing projects to template standards:

- Step-by-step migration process
- Tool-by-tool configuration updates
- Test migration (Jest → Vitest)
- Build migration (webpack/rollup → tsup)
- Common issues and solutions

See: `references/standardization.md`

### 3. Tooling Reference

Comprehensive configuration reference:

- tsup - Build configuration with all options
- Vitest - Testing configuration and patterns
- ESLint - Flat config format with TypeScript
- Prettier - Code formatting standards
- TypeScript - Strict mode configuration

See: `references/tooling-reference.md`

## Standardized Commands

The skill teaches this consistent command pattern:

```bash
# Main validation
pnpm validate        # Format → Lint → Test → Build

# Individual operations
pnpm format          # Write formatted code
pnpm format:check    # Validate formatting only
pnpm lint            # Fix ESLint issues
pnpm lint:check      # Check linting only
pnpm test            # Run tests
pnpm test:watch      # Watch mode
pnpm test:coverage   # With coverage
pnpm build           # Production build
pnpm dev             # Development watch
```

## Core Principles

1. **Consistency** - Same commands work across all projects
2. **Dual Format** - CommonJS + ES modules with TypeScript declarations
3. **Type Safety** - Strict TypeScript with pragmatic exceptions
4. **Modern Tooling** - Fast builds (tsup), fast tests (Vitest)
5. **Quality Gates** - Single `validate` command ensures everything passes

## Example Usage

### Creating a New Library

```typescript
// User: "Create a new TypeScript library for date utilities"
// Claude Code (using this skill):
// 1. Guides through cloning template
// 2. Provides customization checklist
// 3. Explains development workflow
// 4. Assists with implementation
// 5. Validates before publish
```

### Standardizing Existing Project

```typescript
// User: "Apply typescript-library-template standards to this project"
// Claude Code (using this skill):
// 1. Analyzes current setup
// 2. Proposes migration plan
// 3. Updates dependencies
// 4. Copies configurations
// 5. Migrates tests and build
// 6. Validates everything works
```

## Configuration Templates

The skill provides complete, working configurations for:

### tsup.config.ts

Environment-based builds with dual format output

### vitest.config.ts

Testing with coverage and multiple reporters

### eslint.config.mjs

Flat config with TypeScript, Prettier, and import sorting

### package.json

Standardized scripts and dual module exports

### tsconfig.json

Strict TypeScript with pragmatic defaults

## Validation Checklist

The skill ensures projects meet these standards:

- [ ] Dual module format (CJS + ESM + types)
- [ ] Standardized scripts (`validate`, `format`, `lint`, etc.)
- [ ] Modern build tool (tsup)
- [ ] Modern test framework (Vitest)
- [ ] Strict TypeScript configuration
- [ ] ESLint + Prettier integration
- [ ] Pre-publish validation (`prepublishOnly`)
- [ ] Proper package.json exports
- [ ] Documentation (CLAUDE.md, README.md)

## Advanced Features

### Multiple Entry Points

The skill guides setting up subpath exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./utils": "./dist/utils.js"
  }
}
```

### Custom Build Configurations

Adapting tsup for specific needs:

- Browser-compatible builds
- Peer dependency handling
- Custom minification
- Code splitting

### Migration Patterns

Common migration scenarios:

- webpack → tsup
- rollup → tsup
- Jest → Vitest
- TSLint → ESLint
- Old ESLint configs → Flat config

## Troubleshooting

The skill includes solutions for common issues:

- Module resolution errors
- Test migration problems
- Build configuration issues
- Type generation failures
- Dual format compatibility

## Resources

- **Template Repository**: https://github.com/jordanburke/typescript-library-template
- **Example Implementation**: See the functype project for advanced usage
- **Marketplace Distribution**: `.claude-plugin/marketplace.json`

## Contributing

To improve this skill:

1. Edit files in `.claude/skills/typescript-standards/`
2. Test changes with Claude Code
3. Update documentation as needed
4. Commit changes to the repository

## Version History

- **1.0.0** - Initial release
  - Template setup guide
  - Standardization guide
  - Tooling reference
  - Marketplace configuration

## License

MIT - Same as the typescript-library-template repository
