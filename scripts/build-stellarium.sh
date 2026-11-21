#!/usr/bin/env bash
# Recompile Stellarium Web Engine (WASM) depuis le dépôt officiel et installe
# le résultat dans public/stellarium. Voir public/stellarium/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${SWE_SRC:-$ROOT/.cache/stellarium-web-engine}"
REF="${SWE_REF:-master}"

if [ ! -d "$SRC/.git" ]; then
  git clone https://github.com/Stellarium/stellarium-web-engine.git "$SRC"
fi
git -C "$SRC" fetch --depth 1 origin "$REF"
git -C "$SRC" checkout --detach FETCH_HEAD

# Le Dockerfile.jsbuild du dépôt ne se construit plus tel quel : son image de
# base repose sur Debian buster, dont les dépôts ont été déplacés vers
# archive.debian.org. Même image, mêmes paquets, sources apt corrigées.
docker build --platform linux/amd64 -t swe-dev - <<'DOCKERFILE'
FROM emscripten/emsdk:1.39.17
RUN sed -i -e 's|deb.debian.org|archive.debian.org|g' \
           -e 's|security.debian.org|archive.debian.org|g' \
           -e '/buster-updates/d' /etc/apt/sources.list \
 && apt-get -o Acquire::Check-Valid-Until=false update \
 && apt-get install -y --no-install-recommends build-essential scons
WORKDIR /app
DOCKERFILE
docker run --rm --platform linux/amd64 -v "$SRC:/app" swe-dev \
  /bin/bash -c "source /emsdk/emsdk_env.sh && make js"

mkdir -p "$ROOT/public/stellarium"
cp "$SRC/build/stellarium-web-engine.js" "$SRC/build/stellarium-web-engine.wasm" "$ROOT/public/stellarium/"
echo "Moteur installé depuis $(git -C "$SRC" rev-parse --short HEAD)"
