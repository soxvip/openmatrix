#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Erro: %s\n' "$1" >&2
  exit 1
}

find_code_command() {
  if command -v code >/dev/null 2>&1; then
    command -v code
    return 0
  fi

  for candidate in \
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
    "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code" \
    "$HOME/.local/bin/code" \
    "/usr/local/bin/code" \
    "/snap/bin/code"
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

find_local_vsix() {
  script_dir=""
  if [ -n "${BASH_SOURCE[0]:-}" ]; then
    script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  fi
  [ -n "$script_dir" ] || return 1

  extension_dir="$script_dir/../vscode-extension/openclaude-vscode"
  [ -d "$extension_dir" ] || return 1

  find "$extension_dir" -maxdepth 1 -type f -name '*.vsix' -print 2>/dev/null | sort | tail -n 1
}

install_vscode_extension() {
  code_cmd="$1"
  local_vsix="$(find_local_vsix || true)"
  if [ -n "$local_vsix" ]; then
    printf 'Instalando extensao VS Code OPEN MATRIX do VSIX local: %s\n' "$local_vsix"
    "$code_cmd" --install-extension "$local_vsix" --force
    return $?
  fi

  remote_vsix_url='https://raw.githubusercontent.com/prdigennaro/openmatrix/main/vscode-extension/openclaude-vscode/open-matrix-vscode-0.2.13.vsix'
  temp_vsix="${TMPDIR:-/tmp}/open-matrix-vscode-latest.vsix"
  printf 'Baixando extensao VS Code OPEN MATRIX do GitHub...\n'
  if command -v curl >/dev/null 2>&1 && curl -fsSL "$remote_vsix_url" -o "$temp_vsix"; then
    if "$code_cmd" --install-extension "$temp_vsix" --force; then
      rm -f "$temp_vsix"
      return 0
    fi
    rm -f "$temp_vsix"
  elif command -v wget >/dev/null 2>&1 && wget -qO "$temp_vsix" "$remote_vsix_url"; then
    if "$code_cmd" --install-extension "$temp_vsix" --force; then
      rm -f "$temp_vsix"
      return 0
    fi
    rm -f "$temp_vsix"
  fi

  printf 'Tentando instalar extensao VS Code OPEN MATRIX pelo Marketplace...\n'
  "$code_cmd" --install-extension devnull-bootloader.open-matrix-vscode --force
}

printf 'OPEN MATRIX installer for macOS/Linux\n'

command -v npm >/dev/null 2>&1 || fail 'npm nao encontrado. Instale Node.js LTS e rode este instalador novamente.'

install_spec="${OPEN_MATRIX_PACKAGE_SPEC:-}"
if [ -z "$install_spec" ]; then
  script_dir=""
  if [ -n "${BASH_SOURCE[0]:-}" ]; then
    script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  fi
  if [ -n "$script_dir" ] && [ -f "$script_dir/../package.json" ]; then
    install_spec="$(CDPATH= cd -- "$script_dir/.." && pwd)"
  else
    install_spec='@gitlawb/openclaude@latest'
  fi
fi

printf 'Instalando/atualizando CLI OPEN MATRIX de: %s\n' "$install_spec"
npm install -g "$install_spec"

npm_prefix="$(npm prefix -g 2>/dev/null || true)"
if [ -n "$npm_prefix" ]; then
  PATH="$npm_prefix:$PATH"
  export PATH
fi

command -v open-matrix >/dev/null 2>&1 || fail 'Comando open-matrix nao encontrado apos instalacao. Verifique se a versao publicada contem o binario open-matrix ou rode localmente: npm install -g /caminho/do/openmatrix.'

OPEN_MATRIX_TOKEN="${OPEN_MATRIX_API_KEY:-}"
if [ -z "${OPEN_MATRIX_TOKEN// }" ]; then
  printf 'Cole seu token OPEN MATRIX: '
  IFS= read -r OPEN_MATRIX_TOKEN
fi

[ -n "${OPEN_MATRIX_TOKEN// }" ] || fail 'Token vazio. Rode o instalador novamente.'

printf 'Configurando provider OPEN MATRIX...\n'
printf '%s' "$OPEN_MATRIX_TOKEN" | open-matrix setup --token-stdin
unset OPEN_MATRIX_TOKEN

code_cmd="$(find_code_command || true)"
if [ -n "$code_cmd" ]; then
  if ! install_vscode_extension "$code_cmd"; then
    printf 'Aviso: nao foi possivel instalar a extensao automaticamente. Se ela ainda nao estiver publicada no Marketplace, instale o arquivo .vsix em vscode-extension/openclaude-vscode manualmente pelo VS Code.\n' >&2
  fi
else
  printf 'Aviso: VS Code nao encontrado via comando code nem nos caminhos padrao. Para instalar a extensao, abra VS Code e instale o arquivo .vsix em vscode-extension/openclaude-vscode.\n' >&2
fi

printf 'OPEN MATRIX instalado e configurado.\nUse: open-matrix\n'
