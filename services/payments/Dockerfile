FROM node:22-alpine AS base
WORKDIR /app

# -----------
# Dependências de produção, só do que o payments usa

FROM base AS deps

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/messaging/package.json packages/messaging/
COPY services/orders/package.json services/orders/
COPY services/invoices/package.json services/invoices/
COPY services/payments/package.json services/payments/

RUN npm ci --omit=dev --workspace=@microservices/payments

# -----------

FROM base AS runner

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 api

COPY --from=deps --chown=api:nodejs /app ./
COPY --chown=api:nodejs packages/contracts ./packages/contracts
COPY --chown=api:nodejs packages/messaging ./packages/messaging
COPY --chown=api:nodejs services/payments ./services/payments

WORKDIR /app/services/payments
USER api

ENV PORT=3335
EXPOSE 3335

CMD ["node", "--experimental-strip-types", "--no-warnings", "src/server.ts"]
