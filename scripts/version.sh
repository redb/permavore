#!/bin/sh
# Écrit version.js à partir du dernier commit. Lancé avant chaque déploiement ;
# le fichier n'est pas versionné (il change à chaque commit).
cd "$(dirname "$0")/.." || exit 1
H=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
D=$(git log -1 --format=%cd --date=format:%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
printf 'window.PERMAVORE_VERSION = "%s · %s";\n' "$H" "$D" > version.js
echo "version.js → $H · $D"
