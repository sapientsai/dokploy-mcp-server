# Build stage
FROM node:24.21.0-alpine AS builder

# corepack activates the pnpm version pinned in package.json's packageManager
RUN corepack enable

WORKDIR /app

# Built from the repo root (docker build -f servers/dokploy/Dockerfile .): the
# lockfile and workspace settings live there, and only this server is installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY servers/dokploy/package.json servers/dokploy/
RUN pnpm install --frozen-lockfile --filter dokploy-mcp-server

COPY servers/dokploy servers/dokploy
RUN pnpm --filter dokploy-mcp-server build

# Production stage
FROM node:24.21.0-alpine AS production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY servers/dokploy/package.json servers/dokploy/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter dokploy-mcp-server && pnpm store prune

COPY --from=builder /app/servers/dokploy/dist ./servers/dokploy/dist

WORKDIR /app/servers/dokploy

# The build has no .git, so the `info` tool reads build identity from these instead.
ARG BUILD_COMMIT
ARG BUILD_BRANCH
ARG BUILD_DATE
ENV SOMAMCP_BUILD_COMMIT=${BUILD_COMMIT} \
    SOMAMCP_BUILD_BRANCH=${BUILD_BRANCH} \
    SOMAMCP_BUILD_DATE=${BUILD_DATE}

# Containers serve MCP over HTTP at /mcp. DOKPLOY_URL and DOKPLOY_API_KEY are
# required at runtime and deliberately have no defaults.
ENV NODE_ENV=production \
    TRANSPORT_TYPE=httpStream \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

USER node

# 127.0.0.1 rather than localhost, which can resolve to IPv6 and miss the listener
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "dist/bin.js"]
