#!/usr/bin/env bash
# Assemble the public demo site in site/ from the files the team edits.
# Only the files listed here are published; everything else in the repo
# (notebooks, recordings, notes) stays private.
#   bash tools/build_site.sh            build site/
#   vercel deploy site                  preview deploy
#   vercel deploy site --prod           production deploy
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf site/grid-twin site/index.html site/bb84.html site/deck.html site/threejs_quantum_grid.html
mkdir -p site/grid-twin/data

cp site-src/index.html          site/index.html
cp bb84_visualizer.html         site/bb84.html
cp presentation_deck.html       site/deck.html
cp threejs_quantum_grid.html    site/threejs_quantum_grid.html   # the deck links to it

cp grid-twin/index.html grid-twin/style.css site/grid-twin/
cp -r grid-twin/src             site/grid-twin/src
cp -r grid-twin/data/networks   site/grid-twin/data/networks
cp grid-twin/data/network.json grid-twin/data/calibration.json site/grid-twin/data/

printf ".env*\n.vercel\n" > site/.vercelignore   # never upload local tokens
echo "Built site/:"
find site -path site/.vercel -prune -o -type f -print | sort
