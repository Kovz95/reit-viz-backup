# reit-viz — the reconstructed, fully editable app (own client + server).
# Builds the Vite/React client + esbuild server bundle, serves on PORT (default 5000).
FROM node:22-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Produce dist/index.cjs (server) and dist/public (client) via script/build.ts.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
