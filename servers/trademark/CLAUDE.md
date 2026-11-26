# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trademark MCP Server: tools that read USPTO trademark records from the TSDR API (status, images and documents, by serial or registration number). It still runs on FastMCP 3 and Zod 3, with its own ESLint, Prettier, tsup and Vitest setup; porting it to somamcp and ts-builds, as the other servers here use, is a follow-up.

This server lives in `servers/trademark` of the `sapientsai/mcp-servers` monorepo; the root CLAUDE.md has the repo-wide rules. It moved here from `jordanburke/trademark-mcp-server` with its history. Install from the repo root. Release from the root too: `pnpm release trademark <patch|minor|major>` tags `trademark-mcp-server@<version>`, and `git push --follow-tags` publishes this package alone. It has an `mcpName` but no `server.json`, so `publish.yml` skips the MCP Registry for it.

## Commands

```bash
pnpm run ci          # format:check, lint, test and build, as CI runs them
pnpm test            # Vitest
pnpm build           # tsup to dist/
pnpm serve:dev       # the HTTP server with file watching (needs USPTO_API_KEY)
pnpm inspect         # build, then open the MCP Inspector
```

## Things to know

- **The TSDR API needs a key** (`USPTO_API_KEY`). Without one, every request answers 401.
- **No Docker setup here.** Its old Dockerfile, compose files, nginx config and Smithery config didn't move: the root CLAUDE.md asks for a Dockerfile built from the repo root, only for a server something self-hosts. They remain in the history.
