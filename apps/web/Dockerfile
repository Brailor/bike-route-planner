# The web container (ADR 0014): the built app, served by Caddy, which passes /gh to the engine and /geo to Photon.
# Build from the repo root (the workspace's lockfile is there): pnpm web:image.
FROM node:26.13.0-slim AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter web build

FROM caddy:2.11.7-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/apps/web/dist /srv
USER nobody
EXPOSE 8080
