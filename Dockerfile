# Imagens do Trukenza: `server` (mesas) e `client` (página estática).
# Multi-arquitetura (linux/amd64 e linux/arm64, para o Orange Pi); ver docs/docker.md.

# Patch exato: 24.22.1 corrige a CVE-2026-111497 (Brotli do node:zlib); não descer abaixo dele.
ARG NODE_IMAGE=node:24.22.1-alpine
ARG PNPM_VERSION=12.4.2

# Manifestos do workspace: o lockfile só confere com todos os pacotes presentes.
FROM ${NODE_IMAGE} AS workspace
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/game-engine/package.json packages/game-engine/

# Servidor: o Node roda o TypeScript direto (remoção de tipos), sem build.
# Os pacotes do workspace ficam como links do pnpm: o Node não remove tipos de arquivos
# dentro de node_modules, então `pnpm deploy` (que copia) não serve.
FROM workspace AS server-deps
RUN pnpm install --frozen-lockfile --prod --filter @trukenza/server...

FROM ${NODE_IMAGE} AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-deps /app ./
COPY packages/shared/src packages/shared/src
COPY packages/game-engine/src packages/game-engine/src
COPY apps/server/src apps/server/src
USER node
EXPOSE 2580
CMD ["node", "apps/server/src/index.ts"]

# Cliente: compilado na arquitetura de quem constrói (o resultado é só HTML e JS).
FROM --platform=$BUILDPLATFORM workspace AS client-build
RUN pnpm install --frozen-lockfile --filter @trukenza/web...
COPY packages/shared packages/shared
COPY packages/game-engine packages/game-engine
COPY apps/web apps/web
RUN pnpm --filter @trukenza/web build

# nginx sem root (usuário 101, porta 8080), para rodar sem capabilities e só leitura.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS client
COPY --from=client-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
