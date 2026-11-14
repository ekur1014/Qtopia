#!/usr/bin/env bash
# Assemble the public demo site in site/ from the files the team edits.
# Only the files listed here are published; everything else in the repo
# (notebooks, recordings, notes) stays private.
#   bash tools/build_site.sh            build site/
#   vercel deploy site                  preview deploy
#   vercel deploy site --prod           production deploy
#
# The site is one project: every page shares shared/qrypt.css and the top bar in shared/qbar.js, whose links
# use these exact file names, so pages keep their repo names here.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf site/grid-twin site/shared site/*.html
mkdir -p site/grid-twin/data site/shared

cp index.html                    site/index.html                  # home: links every page below
cp shared/qrypt.css shared/qbar.js site/shared/                   # one design system and top bar
cp chattanooga_quantum_map.html  site/                            # Real map
cp bb84_visualizer.html          site/                            # Photon line (notebook 1, one fiber)
cp threejs_quantum_grid.html     site/                            # Quantum lab
cp interactive_grid_monitor.html site/                            # first prototype, linked from home
cp grid_twin.html                site/                            # the live grid as one downloadable file

cp grid-twin/index.html grid-twin/style.css site/grid-twin/       # Live grid
cp -r grid-twin/src             site/grid-twin/src
cp -r grid-twin/data/networks   site/grid-twin/data/networks      # includes the .js copies the map and lab load
cp grid-twin/data/network.json grid-twin/data/calibration.json site/grid-twin/data/

# Old public paths from the first version of this site still work. The pitch deck is the teammates' own work and
# is not part of the Grid Twin site; it stays at its original address.
cp bb84_visualizer.html          site/bb84.html
cp presentation_deck.html        site/deck.html

printf ".env*\n.vercel\n" > site/.vercelignore   # never upload local tokens
echo "Built site/:"
find site -path site/.vercel -prune -o -type f -print | sort
