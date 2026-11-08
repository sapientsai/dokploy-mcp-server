# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an MCP (Model Context Protocol) server that provides access to U.S. FDA public datasets including drugs, medical devices, adverse events, recalls, and more. Built with TypeScript and [SomaMCP](https://github.com/sapientsai/SomaMCP) (`createServer` from `somamcp/node`).

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
├── server.ts             # SomaMCP server creation with all 14 tools
├── lib.ts                # Library exports for programmatic use
├── types/
│   └── fda.ts            # FDA API type definitions
├── handlers/
│   ├── drug-handlers.ts  # Drug query handlers (6 tools)
│   ├── device-handlers.ts # Device query handlers (4 tools)
│   ├── bulk-data-handlers.ts # Orange Book & Purple Book handlers (4 tools)
│   └── query.ts          # Shared query building and toSearchResponse
├── version.ts            # Package version read from package.json
├── tools/
│   └── index.ts          # Zod schemas for all tools
└── utils/
    ├── api-client.ts     # createFDAAPIClient: openFDA HTTP client (returns Either)
    ├── bulk-data-client.ts # createBulkDataClient: Orange Book/Purple Book download, parse, Ref cache (returns Either)
    ├── errors.ts         # toError and the failure tool response
    ├── fields.ts         # textField, mapFirst, takeFirst, nonEmpty: Option/List access to FDA records
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

**Bulk Data Tools (4):**

- `search_fda_orange_book` - Approved drug products with therapeutic equivalence (Orange Book)
- `search_fda_orange_book_patents` - Patent info for drug products (Orange Book)
- `search_fda_purple_book` - Licensed biological products (Purple Book)
- `search_fda_drug_patent_expiry` - Unified patent expiry + exclusivity view

**Built-in (SomaMCP):**

- `info` - Server identity, version, build and capability counts (auto-registered by SomaMCP)

### Key Patterns

- **Handlers**: Each endpoint has a dedicated handler that builds queries, calls the API, and formats results
- **Clients are factories**: `createFDAAPIClient()` and `createBulkDataClient()` return object literals; the bulk caches live in functype `Ref`s. `FDAAPIClient` and `BulkDataClient` are class forms that delegate to them. The shared `fdaAPIClient` and `bulkDataClient` stay class instances, as in 2.0.0, so `./lib` callers typed against the classes keep compiling (tests `vi.spyOn` them)
- **Collections**: bulk handlers filter, sort and page through functype `List`, and convert with `.toArray()` at the response boundary. No `List`, `Option` or `Map` may reach `FDAToolResponse.data`.
- **openFDA queries use real spaces**: build `a:"x" AND b:[1 TO 2]` with spaces, never `+AND+`. `URLSearchParams` sends a space as `+`, which openFDA reads as a space; a literal `+` goes out as `%2B`, and openFDA then answers 404 (read as "no results") or 500
- **Zod Schemas**: All tool parameters validated with Zod
- **Rate Limiting**: API client is aware of FDA rate limits (40/min without key, 240/min with key)
- **Error Handling**: Clients return `Either<Error, T>` (functype) instead of throwing; handlers `fold` it into `FDAToolResponse<T>` with success/error status. Lint runs with `--max-warnings=0`, so the functype rules (`prefer-try`, `prefer-option`, `prefer-either`) are enforced

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

CI publishes to npm on a `v*` tag (`.github/workflows/publish.yml`, OIDC trusted publishing). Never run `npm publish` locally.

```bash
npm version patch|minor|major
git push --follow-tags
```
