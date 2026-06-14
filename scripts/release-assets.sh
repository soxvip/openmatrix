#!/usr/bin/env bash
#
# release-assets.sh — monta e publica os 3 assets que os instaladores baixam.
#
# Os instaladores (scripts/install.ps1 e scripts/install.sh) sempre puxam de
#   https://github.com/<REPO>/releases/latest/download/<asset>
# então basta criar um novo release (que vira "latest") com estes assets:
#   - open-matrix-cli.tgz      (CLI, usada pelo install.sh / Unix)
#   - open-matrix-cli-win.tgz  (CLI, usada pelo install.ps1 / Windows; conteúdo idêntico)
#   - open-matrix-vscode.vsix  (extensão do VS Code / Antigravity)
#
# A versão da CLI vem de package.json (raiz) e a da extensão de
# vscode-extension/openclaude-vscode/package.json. Faça o bump ANTES de rodar.
#
# Uso:
#   scripts/release-assets.sh            # monta + publica no REPO padrão
#   DRY_RUN=1 scripts/release-assets.sh  # só monta os assets em dist/release/, não publica
#   REPO=owner/repo scripts/release-assets.sh
#
set -euo pipefail

REPO="${REPO:-soxvip/openmatrix}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CLI_VERSION="$(node -e "console.log(require('./package.json').version)")"
EXT_DIR="vscode-extension/openclaude-vscode"
EXT_VERSION="$(node -e "console.log(require('./$EXT_DIR/package.json').version)")"
TAG="v${CLI_VERSION}-openmatrix.1"
OUT="dist/release"

echo "==> CLI version:       $CLI_VERSION"
echo "==> Extension version: $EXT_VERSION"
echo "==> Tag:               $TAG"
echo "==> Repo:              $REPO"
echo

rm -rf "$OUT"
mkdir -p "$OUT"

# 1) Build da CLI (inlina MACRO.VERSION a partir do package.json).
echo "==> [1/4] build da CLI"
if command -v bun >/dev/null 2>&1; then
  bun run build
else
  npx --yes bun run build
fi

# 2) Empacota a CLI -> open-matrix-cli.tgz. O -win.tgz é cópia byte-idêntica
#    (mesmo conteúdo; os instaladores só usam nomes diferentes por plataforma).
echo "==> [2/4] empacota a CLI"
# --ignore-scripts: o build já rodou no passo 1; o prepack chamaria `bun`
# diretamente, que pode não estar no PATH global.
PACKED="$(npm pack --silent --ignore-scripts --pack-destination "$OUT")"
mv "$OUT/$PACKED" "$OUT/open-matrix-cli.tgz"
cp "$OUT/open-matrix-cli.tgz" "$OUT/open-matrix-cli-win.tgz"

# 3) Empacota a extensão -> open-matrix-vscode.vsix.
echo "==> [3/4] empacota a extensão"
( cd "$EXT_DIR" && npx --yes @vscode/vsce package --no-dependencies --out "$ROOT/$OUT/open-matrix-vscode.vsix" )

echo
echo "==> Assets montados em $OUT/:"
ls -la "$OUT"/*.tgz "$OUT"/*.vsix

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo
  echo "==> DRY_RUN=1: assets prontos, publicação ignorada."
  exit 0
fi

# 4) Publica/atualiza o release. Recria os assets se a tag já existir.
echo
echo "==> [4/4] publicando release $TAG em $REPO"
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "    release existe — substituindo assets (--clobber)"
  gh release upload "$TAG" \
    "$OUT/open-matrix-cli.tgz" \
    "$OUT/open-matrix-cli-win.tgz" \
    "$OUT/open-matrix-vscode.vsix" \
    --repo "$REPO" --clobber
else
  echo "    criando novo release"
  gh release create "$TAG" \
    "$OUT/open-matrix-cli.tgz" \
    "$OUT/open-matrix-cli-win.tgz" \
    "$OUT/open-matrix-vscode.vsix" \
    --repo "$REPO" \
    --latest \
    --title "OPEN MATRIX $CLI_VERSION commercial setup" \
    --notes "CLI $CLI_VERSION · extensão $EXT_VERSION. Instale/atualize com /atualizar ou pelos instaladores."
fi

echo
echo "==> Pronto. Assets publicados em https://github.com/$REPO/releases/tag/$TAG"
