FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node --test tests/backend.test.mjs tests/release.test.mjs

FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ARG HEARTH_COMMIT=development
ENV NODE_ENV=production \
    PORT=3000 \
    HEARTH_COMMIT=${HEARTH_COMMIT} \
    GROCERY_DB_PATH=/app/data/household.sqlite
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server ./server
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/health', {signal: AbortSignal.timeout(3000)}); const health = await response.json(); if (!response.ok || health.ok !== true || health.database !== 'sqlite') process.exit(1);"
CMD ["node", "server/index.mjs"]
