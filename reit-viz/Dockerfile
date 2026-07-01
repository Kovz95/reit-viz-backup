# reit-viz — the reconstructed, fully editable app (own client + server).
# Builds the Vite/React client + esbuild server bundle, serves on PORT (default 5000).
FROM node:22-bookworm

WORKDIR /app

# The workbook parser (scripts/parse-workbook.py) shells out to python3 (present in
# the base image) and needs python-calamine (.xlsx/.xlsm) and pyxlsb (.xlsb). The
# base image has no pip, so install it and the parser wheels (prebuilt manylinux,
# no Rust toolchain needed). --break-system-packages: bookworm marks the system
# env externally-managed (PEP 668).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages python-calamine pyxlsb

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Produce dist/index.cjs (server) and dist/public (client) via script/build.ts.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5000

# Persist the SQLite DB outside the ephemeral container layer. Mount a volume at
# /app/dbdata (e.g. -v reit-viz-db:/app/dbdata) so saved charts/workspaces
# survive image rebuilds. The dir is created here so it also works unmounted.
ENV DB_PATH=/app/dbdata/data.db
RUN mkdir -p /app/dbdata

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
