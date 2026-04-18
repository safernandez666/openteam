# ── Build stage ──
FROM node:22-slim AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/
COPY packages/ui/package.json packages/ui/
COPY packages/cli/package.json packages/cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY tsconfig.json ./

# Build all packages
RUN pnpm build

# ── Runtime stage ──
FROM node:22-slim

RUN npm install -g pnpm@9

WORKDIR /app

# Copy built output + node_modules
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/package.json /app/packages/core/dist ./packages/core/
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder /app/packages/web/package.json /app/packages/web/dist ./packages/web/
COPY --from=builder /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/packages/ui/dist ./packages/ui/dist
COPY --from=builder /app/packages/cli/package.json /app/packages/cli/dist ./packages/cli/

ENV NODE_ENV=production
EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:4200/api/health || exit 1

CMD ["node", "packages/cli/dist/index.js", "start"]
