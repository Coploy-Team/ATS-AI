# Node PINADO (22.14.0): tag flutuante já quebrou produção uma vez — um rebuild
# do orchestrator puxou um patch de Node com regressão de keep-alive (PR #283).
FROM node:22.14.0-alpine AS base

FROM base AS pruner
RUN npm install -g turbo@2
WORKDIR /app
COPY . .
RUN turbo prune careers --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/package-lock.json ./package-lock.json
RUN node -e "const p=require('./package.json'); p.workspaces=p.workspaces.filter(w=>require('fs').existsSync(w.replace('*',''))); require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2))"
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm install --no-audit --fund=false
COPY --from=pruner /app/out/full/ .
# os pacotes estendem o tsconfig da raiz — sem ele o build de tipos grita TS5083
COPY tsconfig.base.json ./tsconfig.base.json

# Vite embute os VITE_* no bundle NO BUILD — por isso são ARG, não env de runtime.
ARG VITE_API_CORE_URL
ENV VITE_API_CORE_URL=$VITE_API_CORE_URL
# Provedor do perfil portátil OTS (vazio = card de import não aparece)
ARG VITE_OTS_PROFILE_PROVIDER
ENV VITE_OTS_PROFILE_PROVIDER=$VITE_OTS_PROFILE_PROVIDER

RUN npx turbo run build --filter=careers...

FROM nginx:alpine AS runner
COPY --from=builder /app/web/careers/dist /usr/share/nginx/html
COPY web/careers/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
