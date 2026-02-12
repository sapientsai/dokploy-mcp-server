# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A comprehensive MCP (Model Context Protocol) server for [Dokploy](https://dokploy.com/) - the open-source, self-hosted PaaS. Provides **107 tools** across 12 categories for managing deployments, applications, databases, domains, and servers through AI assistants.

Built with **FastMCP**, **ts-builds**, and **Zod**. Supports stdio (default for npx/CLI) and httpStream (for Docker/remote) transports.

## Development Commands

```bash
pnpm validate        # Main command: format + lint + test + build (use before commits)

pnpm format          # Format code with Prettier
pnpm format:check    # Check formatting only

pnpm lint            # Fix ESLint issues
pnpm lint:check      # Check ESLint issues only

pnpm test            # Run tests once
pnpm test:watch      # Run tests in watch mode
pnpm test:coverage   # Run tests with coverage

pnpm build           # Production build (outputs to dist/)
pnpm dev             # Development build with watch mode

pnpm typecheck       # Check TypeScript types

pnpm inspect         # Build + open MCP Inspector to verify tools
```

### Running a Single Test

```bash
pnpm test -- --testNamePattern="pattern"    # Filter by test name
pnpm test -- test/specific.spec.ts          # Run specific file
```

## Architecture

### Project Structure

```
src/
├── index.ts                    # FastMCP server setup, tool registration, transport config
├── bin.ts                      # CLI entry point (stdio default, --version, --help)
├── client/
│   └── dokploy-client.ts       # API client (singleton, x-api-key auth, GET/POST)
├── tools/
│   ├── index.ts                # Re-exports all tool registration functions
│   ├── project-tools.ts        # 6 tools - CRUD + duplicate
│   ├── application-tools.ts    # 20 tools - full app lifecycle
│   ├── compose-tools.ts        # 12 tools - Docker Compose management
│   ├── deployment-tools.ts     # 5 tools - deployment tracking
│   ├── docker-tools.ts         # 7 tools - container management
│   ├── domain-tools.ts         # 9 tools - domain/DNS management
│   ├── server-tools.ts         # 8 tools - remote server management
│   ├── settings-tools.ts       # 7 tools - health, version, cleanup
│   ├── database-tools.ts       # 13 unified tools (dbType param for all 5 DB types)
│   ├── backup-tools.ts         # 6 tools - backup scheduling/triggers
│   ├── environment-tools.ts    # 6 tools - project environments
│   └── infrastructure-tools.ts # 8 tools - ports, certs, basic auth
├── types.ts                    # TypeScript types + DB type constants
└── utils/
    └── formatters.ts           # Markdown output formatters
```

### Key Design Patterns

1. **Unified database tools**: One set of 13 tools handles postgres, mysql, mariadb, mongo, and redis via a `dbType` parameter. The tool maps to the correct API path internally (e.g., `postgres.deploy`, `mysql.deploy`).

2. **tRPC-style API client**: Two methods matching Dokploy's API pattern:
   - `get<T>(path, params?)` → `GET /api/{path}?params` with `x-api-key` header
   - `post<T>(path, body?)` → `POST /api/{path}` with JSON body and `x-api-key` header

3. **Tool modules**: Each `*-tools.ts` exports a `register(server: FastMCP)` function that registers all tools for that category. All registered in `src/index.ts`.

4. **Tool naming**: `dokploy_{category}_{action}` (e.g., `dokploy_application_deploy`, `dokploy_database_start`)

### Build System: ts-builds + tsdown

- **ts-builds**: Centralized toolchain providing all build scripts
- **tsdown**: Bundler with custom config for dual entry points (index + bin)
- **Version injection**: `__VERSION__` defined at build time from package.json
- **ESM-only output**: `dist/index.js` and `dist/bin.js`
- **TypeScript**: `tsconfig.json` extends `ts-builds/tsconfig`
- **Prettier**: Uses `ts-builds/prettier` shared config

### Environment Variables

- `DOKPLOY_URL` (required) - Dokploy instance URL
- `DOKPLOY_API_KEY` (required) - API key for authentication
- `TRANSPORT_TYPE` (optional) - `stdio` (default) or `httpStream`
- `PORT` (optional) - HTTP port for httpStream mode (default: 3000)
- `HOST` (optional) - HTTP host for httpStream mode (default: 0.0.0.0)

## Key Files

- `src/index.ts` - Server entry point, registers all 12 tool modules
- `src/bin.ts` - CLI entry point (`npx dokploy-mcp-server`)
- `src/client/dokploy-client.ts` - Dokploy API client with GET/POST
- `src/types.ts` - All TypeScript types + `DB_TYPES` / `DB_ID_FIELDS` constants
- `src/tools/*.ts` - Tool modules (one per API category)
- `src/utils/formatters.ts` - Markdown formatters for API responses
- `test/hello-world.spec.ts` - Tests for client, types, and formatters
- `tsdown.config.ts` - Custom build config (dual entry, version injection)
- `.env.example` - Environment variable reference

## Publishing

```bash
npm version patch|minor|major
npm publish --access public
```

The `prepublishOnly` hook automatically runs `pnpm validate` before publishing.
