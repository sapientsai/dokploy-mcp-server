# Build stage
FROM node:24-alpine AS builder

# Install pnpm (corepack uses the version pinned in package.json's packageManager)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source and config files
COPY tsconfig.json tsdown.config.ts ts-builds.config.json ./
COPY src/ ./src/

# Build the application using tsdown directly with dist output
RUN pnpm exec tsdown --outDir dist

# Production stage
FROM node:24-alpine AS production

# Install pnpm for production install
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Expose port for HTTP mode
EXPOSE 3000

# Default command runs in HTTP mode
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--transport", "http", "--port", "3000", "--host", "0.0.0.0"]
