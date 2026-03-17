FROM node:24-alpine AS build

WORKDIR /app

# Install dependencies (server)
COPY package.json package-lock.json ./
RUN npm ci

# Install dependencies (UI)
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci

# Copy source
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY ui/ ./ui/

# Build server + UI
RUN npm run build

# --- Runtime ---
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/ui/dist ./ui/dist

ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["serve", "--config", "/data/config/graph-memory.yaml"]
