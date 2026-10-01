FROM node:22.14.0-alpine AS base

FROM base AS pruner
RUN npm install -g turbo@2.9.4
WORKDIR /app
COPY . .
RUN turbo prune core --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/package-lock.json ./package-lock.json
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm ci --no-audit --fund=false
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./tsconfig.base.json
RUN npx turbo run build --filter=core...

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 coploy && \
    adduser --system --uid 1001 coploy

COPY --from=installer --chown=coploy:coploy /app/ .

USER coploy
EXPOSE 3333
ENV NODE_ENV=production
CMD ["node", "apps/core/build/server.js"]
