# Built from the monorepo root, where the lockfile and workspace settings live:
#   docker build -f servers/patents/Dockerfile -t patents-mcp-server .
# Only this server is installed.

# Build stage
FROM node:24.21.0-alpine AS builder

# corepack activates the pnpm version pinned in the root package.json's packageManager
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY servers/patents/package.json servers/patents/
RUN pnpm install --frozen-lockfile --filter patents-mcp-server

COPY servers/patents servers/patents
RUN pnpm --filter patents-mcp-server exec tsdown --outDir dist

# Production stage
FROM node:24.21.0-alpine AS production

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY servers/patents/package.json servers/patents/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter patents-mcp-server && pnpm store prune

COPY --from=builder /app/servers/patents/dist ./servers/patents/dist

WORKDIR /app/servers/patents

# Set environment defaults
ENV PORT=3000
ENV TRANSPORT=httpStream
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
