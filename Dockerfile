FROM node:24-slim AS deps

WORKDIR /app

# Install dependencies (server)
COPY package.json package-lock.json ./
RUN npm ci

# Install dependencies (UI)
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci

# --- Build ---
FROM deps AS build

# Copy source
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY ui/ ./ui/

# Build server + UI
RUN npm run build

# --- Runtime ---
FROM node:24-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/ui/dist ./ui/dist

RUN addgroup --system app && adduser --system --ingroup app app && \
    mkdir -p /data/models /data/projects /data/config && chown -R app:app /data
USER app

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/auth/status || exit 1

ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["serve", "--config", "/data/config/graph-memory.yaml"]
