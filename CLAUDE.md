# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an MCP (Model Context Protocol) server that provides access to U.S. FDA public datasets including drugs, medical devices, adverse events, recalls, and more. Built with TypeScript and FastMCP.

## Development Commands

All commands delegate to `ts-builds` for consistency:

```bash
pnpm validate        # Main command: format + lint + test + build (use before commits)

pnpm format          # Format code with Prettier
pnpm lint            # Fix ESLint issues
pnpm test            # Run tests once
pnpm build           # Production build (outputs to dist/)
pnpm dev             # Development build with watch mode

pnpm serve:test      # Run server locally (stdio mode)
pnpm serve:test:http # Run server locally (HTTP mode)
```

## Architecture

### Build System

- **ts-builds**: Centralized toolchain for all build scripts
- **tsdown**: Bundler (successor to tsup)
- **Vitest**: Test framework

### Project Structure

```
src/
├── index.ts              # CLI entry point (Commander.js)
├── server.ts             # FastMCP server creation with all 10 tools
├── lib.ts                # Library exports for programmatic use
├── types/
│   └── fda.ts            # FDA API type definitions
├── handlers/
│   ├── drug-handlers.ts  # Drug query handlers (6 tools)
│   └── device-handlers.ts # Device query handlers (4 tools)
├── tools/
│   └── index.ts          # Zod schemas for all tools
└── utils/
    ├── api-client.ts     # FDA API HTTP client
    └── logger.ts         # Debug logger setup
```

### MCP Tools

**Drug Tools (6):**

- `search_drug_adverse_events` - FAERS database
- `search_drug_labels` - SPL labeling information
- `search_drug_ndc` - National Drug Code directory
- `search_drug_recalls` - Enforcement/recall reports
- `search_drugs_at_fda` - Approved drug applications
- `search_drug_shortages` - Current shortages

**Device Tools (4):**

- `search_device_510k` - 510(k) clearances
- `search_device_classifications` - Device classifications
- `search_device_adverse_events` - MDR reports
- `search_device_recalls` - Device enforcement reports

### Key Patterns

- **Handlers**: Each endpoint has a dedicated handler that builds queries, calls the API, and formats results
- **Zod Schemas**: All tool parameters validated with Zod
- **Rate Limiting**: API client is aware of FDA rate limits (40/min without key, 240/min with key)
- **Error Handling**: All handlers return `FDAToolResponse<T>` with success/error status

## Environment Variables

| Variable          | Description                                        |
| ----------------- | -------------------------------------------------- |
| `OPENFDA_API_KEY` | Optional FDA API key for higher rate limits        |
| `DEBUG`           | Enable debug logging (e.g., `DEBUG=openfda-mcp:*`) |

## Testing

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
```

## Publishing

```bash
npm version patch|minor|major
npm publish --access public
```

The `prepublishOnly` hook automatically runs `pnpm validate`.
