# Built from the monorepo root, where the lockfile and workspace settings live:
#   docker build -f servers/openfda/Dockerfile -t openfda-mcp-server .
# Only this server is installed.

# Build stage
FROM node:24.21.0-alpine AS builder

# corepack activates the pnpm version pinned in the root package.json's packageManager
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY servers/openfda/package.json servers/openfda/
RUN pnpm install --frozen-lockfile --filter openfda-mcp-server

COPY servers/openfda servers/openfda
RUN pnpm --filter openfda-mcp-server exec tsdown --outDir dist

# Production stage
FROM node:24.21.0-alpine AS production

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY servers/openfda/package.json servers/openfda/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter openfda-mcp-server && pnpm store prune

COPY --from=builder /app/servers/openfda/dist ./servers/openfda/dist

WORKDIR /app/servers/openfda

ENV NODE_ENV=production

# Expose port for HTTP mode
EXPOSE 3000

# Default command runs in HTTP mode
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--transport", "http", "--port", "3000", "--host", "0.0.0.0"]
