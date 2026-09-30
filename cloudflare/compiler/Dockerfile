FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git tar bzip2 && rm -rf /var/lib/apt/lists/*
COPY cloudflare/compiler/package.json cloudflare/compiler/package-lock.json ./
RUN npm ci --omit=dev
COPY toolchain.json firmware-source.mjs ./
COPY scripts/setup-arduino.mjs scripts/setup-firmware.mjs ./scripts/
RUN node scripts/setup-arduino.mjs
COPY src/lib ./src/lib
COPY cloudflare/build-cache.ts ./cloudflare/build-cache.ts
COPY cloudflare/compiler/server.ts ./cloudflare/compiler/server.ts
RUN mkdir -p .firmware-cache && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["./node_modules/.bin/tsx", "cloudflare/compiler/server.ts"]
