# Self-host image for the Myra Agents backend (@myra/server).
#
# Build from the repo root (it needs the bun workspace + @myra/shared):
#   docker build -f packages/server/Dockerfile -t myra-server .
#   docker run --rm -p 4319:4319 \
#     -e MYRA_STORE=sqlite -e MYRA_DIR=/data -v myra-data:/data myra-server
#
# The server never serves HTML — point a web/desktop client at it as a
# connection. Set MYRA_EXECUTOR=local (default) to run agents inside the
# container; the sandbox executor is a skeleton (see sandbox-executor.ts).
FROM oven/bun:1 AS base
WORKDIR /app

# Install workspace deps first for layer caching. Copy the root manifest plus
# every workspace package manifest, then the lockfile.
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
RUN bun install --frozen-lockfile

# Bring in the source the server actually needs.
COPY packages/shared packages/shared
COPY packages/server packages/server

ENV PORT=4319
ENV MYRA_DIR=/data
EXPOSE 4319

CMD ["bun", "packages/server/src/index.ts"]
