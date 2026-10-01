# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:24-slim AS base
RUN npm install -g pnpm@12.4.2 turbo@2

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @lane4hq/api --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @lane4hq/api build

# The server is one esbuild bundle, so the runtime image needs no node_modules.
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/apps/api/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
