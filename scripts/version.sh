#!/bin/sh
# Écrit version.js : nom de code et numéro (package.json) + commit court + date.
# Lancé avant chaque déploiement ; le fichier n'est pas versionné.
cd "$(dirname "$0")/.." || exit 1
V=$(node -p "const p=require('./package.json'); p.codename+' v'+p.version.replace(/\\.0$/,'')")
H=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")
D=$(git log -1 --format=%cd --date=format:%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
printf 'window.PERMAVORE_VERSION = "%s (%s · %s)";\n' "$V" "$H" "$D" > version.js
echo "version.js → $V ($H · $D)"
