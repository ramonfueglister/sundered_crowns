# World server image. Build from the repository root:
#   docker build -f server/Dockerfile -t sundered-crowns-world .
#   docker run -p 8787:8787 -v $PWD/world-data:/data --env-file .env sundered-crowns-world
# ---- build: bundle server + simulation into one ES module
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
COPY tools/sim ./tools/sim
# the bundle lives two folders deep (build/server) so tools/sim/load.ts finds the data at the app root
RUN npx esbuild server/main.ts --bundle --platform=node --target=node22 --format=esm --packages=external --outfile=build/server/main.mjs

# ---- runtime: production dependencies, data files, the bundle
FROM node:22-slim
ENV NODE_ENV=production PORT=8787 WORLD_DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY public/data ./public/data
COPY data/content/trade_hubs.json ./data/content/trade_hubs.json
# the word filter list (WORLD_WORD_FILTER, default server/config/wordfilter.txt relative to /app)
COPY server/config ./server/config
COPY --from=build /app/build/server ./build/server
RUN mkdir -p /data
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# SIGTERM (deploys, restarts) writes a final snapshot before exit
STOPSIGNAL SIGTERM
CMD ["node", "build/server/main.mjs"]
