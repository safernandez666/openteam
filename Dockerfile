# ── Build stage ──
FROM node:22-slim AS builder

# Native module build tools (better-sqlite3, node-pty)
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json packages/core/tsup.config.ts packages/core/
COPY packages/web/package.json packages/web/tsconfig.json packages/web/tsup.config.ts packages/web/
COPY packages/ui/package.json packages/ui/tsconfig.json packages/ui/vite.config.ts packages/ui/
COPY packages/cli/package.json packages/cli/tsconfig.json packages/cli/tsup.config.ts packages/cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/core/src packages/core/src
COPY packages/web/src packages/web/src
COPY packages/ui/src packages/ui/src
COPY packages/ui/index.html packages/ui/
COPY packages/cli/src packages/cli/src

# Build all packages
RUN pnpm build

# ── Runtime stage ──
FROM node:22-slim

# node-pty needs these at runtime
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Copy built packages with full directory structure
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder /app/packages/web/dist ./packages/web/dist
COPY --from=builder /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/packages/ui/package.json ./packages/ui/package.json
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist
COPY --from=builder /app/packages/cli/package.json ./packages/cli/package.json
COPY --from=builder /app/packages/cli/dist ./packages/cli/dist

# Data volume for persistent workspace data
VOLUME /root/.openteam

ENV NODE_ENV=production
EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:4200/api/health || exit 1

CMD ["node", "packages/cli/dist/index.js", "start", "--host", "0.0.0.0"]
