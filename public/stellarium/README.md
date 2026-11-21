# Stellarium Web Engine

Moteur de la carte du ciel de Stargazer (`src/components/viewport/StellariumSkyCanvas.tsx`).

- Source : https://github.com/Stellarium/stellarium-web-engine
- Commit compilé : 2103935134e09ba1715171241769fce03cebebe4 (2026-11-05)
- Licence : GNU AGPL v3 (`LICENSE-AGPL-3.0.txt`). Si Stargazer est distribué ou
  rendu accessible à des tiers, son code source doit leur être fourni.
- `skydata/` : jeu de données `apps/test-skydata` du dépôt (étoiles jusqu'à
  la magnitude ~7, constellations occidentales, ciel profond, Voie lactée,
  paysage). Suffisant hors ligne ; pas de relevés photographiques.

## Recompiler

Docker requis (image officielle `emscripten/emsdk:1.39.17`, amd64) :

    scripts/build-stellarium.sh
