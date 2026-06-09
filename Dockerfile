# Myra Agents web app — static export served by Caddy (auto-HTTPS).
# The desktop shell opens this origin's /auth/desktop/ bridge during login
# (point it here via MYRA_WEB_APP_URL). NEXT_PUBLIC_* are INLINED at build
# time, so they must be passed as --build-arg (not runtime env).
#
#   docker build \
#     --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
#     --build-arg NEXT_PUBLIC_MYRA_HUB_URL=https://hub.example.com \
#     -t myra-web .
#
# Requires the packages/shared submodule to be checked out in the build
# context:  git submodule update --init

# ---- build (static export -> /app/out) ----
FROM oven/bun:1.3.11 AS build
WORKDIR /app

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_MYRA_HUB_URL
ARG NEXT_PUBLIC_CLERK_JWT_TEMPLATE
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_MYRA_HUB_URL=$NEXT_PUBLIC_MYRA_HUB_URL \
    NEXT_PUBLIC_CLERK_JWT_TEMPLATE=$NEXT_PUBLIC_CLERK_JWT_TEMPLATE \
    NODE_ENV=production

# Install deps first for layer caching. Copy every workspace manifest so the
# bun workspace resolves before the full source is present.
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# Source (incl. the checked-out packages/shared submodule).
COPY . .
RUN bun run build

# ---- serve (static files, auto-HTTPS via Caddy) ----
FROM caddy:2-alpine
COPY --from=build /app/out /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
