# syntax=docker/dockerfile:1
# Torob-yar — Next.js standalone + read-only SQLite baked in; mutable inquiries on a Liara disk.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# toolchain only in this stage, in case better-sqlite3 has no prebuilt binary for the platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --prefer-offline

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_MAP_STYLE=https://tiles.openfreemap.org/styles/positron
ENV NEXT_PUBLIC_MAP_STYLE=$NEXT_PUBLIC_MAP_STYLE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN mkdir -p /app/db && if [ -f data/app.sqlite.gz ]; then gunzip -c data/app.sqlite.gz > /app/db/app.sqlite; else echo "no app.sqlite.gz — image will run on fixtures"; touch /app/db/.none; fi

FROM node:22-bookworm-slim AS run
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SQLITE_PATH=/app/db/app.sqlite \
    DATA_RW_DIR=/app/data-rw \
    APP_VERSION=$APP_VERSION
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/data/fixtures ./data/fixtures
COPY --from=build /app/db ./db
COPY deploy/entrypoint.sh ./deploy/entrypoint.sh
# file tracing must have kept the native SQLite binding
RUN test -f node_modules/better-sqlite3/prebuilds/linux-x64.node || test -f node_modules/better-sqlite3/build/Release/better_sqlite3.node \
    || (echo "better-sqlite3 native binary missing from standalone output" && exit 1)
# Runs as root: the Liara disk is mounted root-owned at /app/data-rw (see docs/DECISIONS.md).
EXPOSE 3000
CMD ["sh", "deploy/entrypoint.sh"]
