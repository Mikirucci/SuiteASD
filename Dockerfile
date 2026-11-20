# syntax=docker/dockerfile:1

# ---- Dependencies: only what the lockfile says, for the web workspace ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund

# ---- Build: the standalone server ----
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web apps/web
# NEXT_PUBLIC_API_URL is read at build time. The default, "/api/v1", is the right one behind the reverse proxy.
RUN npm run build -w apps/web

# ---- Runtime: Node only, non-root user ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
    CMD wget --quiet --spider http://127.0.0.1:3000/login || exit 1

CMD ["node", "apps/web/server.js"]
