# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server for the DAKboard API — manage digital dashboard screens, blocks, devices, loops, and custom metrics. Built with FastMCP + Zod + functype for functional programming patterns.

## Development Commands

```bash
pnpm validate        # Main command: format + lint + typecheck + test + build (use before commits)
pnpm run ci          # validate's checks without fixing, as CI runs them (type `run`: `pnpm ci` is a clean install)
pnpm format          # Format code with Prettier
pnpm lint            # Fix ESLint issues
pnpm test            # Run tests once
pnpm test:watch      # Run tests in watch mode
pnpm build           # Production build (outputs to dist/)
pnpm typecheck       # Check TypeScript types
pnpm inspect         # Test tools via MCP Inspector
```

### Running a Single Test

```bash
pnpm test -- --testNamePattern="pattern"
pnpm test -- src/tools/__tests__/screen-tools.test.ts
```

## Architecture

### Stack

- **FastMCP**: MCP server framework with Zod schema validation
- **functype**: Functional programming (Either for errors, Brand for type-safe IDs, Option for nullables, Try for exception wrapping)
- **ts-builds + tsdown**: Build toolchain with dual entry points (index.js + bin.js)

### File Structure

```
src/
  index.ts                    # FastMCP server setup + 17 tool registrations
  bin.ts                      # CLI entry point (stdio transport)
  types.ts                    # Domain types + API response types
  brands.ts                   # Branded types: ScreenId, BlockId, LoopId, DeviceId, MetricName, ApiKey
  client/
    dakboard-client.ts        # API client factory — all methods return Either<DakboardApiError, T>
  tools/
    index.ts                  # Barrel export
    screen-tools.ts           # list_screens, get_screen, update_screen
    block-tools.ts            # list_blocks, get_block, update_block, visualize_screen_layout
    loop-tools.ts             # list_loops, get_loop
    device-tools.ts           # list_devices, get_device, update_device
    metric-tools.ts           # list/get/create/delete metrics + data points
  utils/
    formatters.ts             # Markdown response formatters using Option for nullable fields
    layout.ts                 # ASCII layout renderer — parses CSS percentages from public screen page
```

### Key Patterns

- **Either<DakboardApiError, T>**: Every client method returns Either — Left for errors, Right for success. Tool handlers use `result.fold()` to convert.
- **Brand<K, string>**: Compile-time ID safety — `ScreenId`, `BlockId`, etc. prevent mixing up IDs at zero runtime cost.
- **Factory function client**: No classes. API key captured in closure, frozen return object. Singleton via `initializeDakboardClient()` / `getDakboardClient()`.
- **Form-encoded PUT bodies**: DAKboard API uses `application/x-www-form-urlencoded` for updates.
- **API key as query param**: `?api_key=...` appended to every request.

### DAKboard Coordinate System (CRITICAL)

DAKboard uses a **non-linear, per-block scaling** to convert API coordinates (x, y, w, h) into CSS percentages for rendering. The scaling factor is computed server-side and varies per block — there is no single formula to convert API coordinates to screen positions.

**When updating blocks via the API, coordinates are recomputed using a different (approximately 1:1) scaling.** This means:

- **Setting a block back to its original API value will NOT restore its original visual position.** The scaling factor changes after an update.
- **Use rendered pixel values (at 1920x1080 design resolution) as API coordinate values** when making updates. For example, if a block should be 680px wide on a 1920x1080 screen, set `w=680` in the API call.
- **The `visualize_screen_layout` tool** with `screen_uuid` fetches the actual CSS percentages from the public screen page for accurate layout visualization. Without the UUID, it falls back to API coordinates which may not match the visual layout.
- **Screen UUIDs** are not available via the API. They must be obtained from the DAKboard web app URL: `https://dakboard.com/screen/uuid/{UUID}`.

### Environment Variables

- `DAKBOARD_API_KEY` (required) — DAKboard API key
- `TRANSPORT_TYPE` — `stdio` (default) or `httpStream`
- `PORT` — HTTP port (default: 3000)
- `HOST` — HTTP host (default: 127.0.0.1)

## Key Files

- `src/index.ts` — FastMCP server with all 17 tool registrations
- `src/bin.ts` — CLI entry point
- `src/client/dakboard-client.ts` — Functional API client
- `src/brands.ts` — Branded type constructors
- `src/types.ts` — All domain types
- `server.json` — MCP server manifest
- `.mcp.json` — Local MCP client config

## Publishing

```bash
npm version patch|minor|major
npm publish --access public
```

The `prepublishOnly` hook automatically runs `pnpm run ci` before publishing.
