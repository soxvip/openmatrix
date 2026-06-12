#!/usr/bin/env bash
set -euo pipefail

temp_files=()
cleanup() {
  for f in "${temp_files[@]:-}"; do
    [ -n "$f" ] && [ -f "$f" ] && rm -f "$f" || true
  done
}
trap cleanup EXIT

fail() {
  printf 'Erro: %s\n' "$1" >&2
  exit 1
}

download_with_retry() {
  uri="$1"
  out_file="$2"
  label="$3"
  max_attempts=5
  attempt=1

  while [ "$attempt" -le "$max_attempts" ]; do
    rm -f "$out_file"
    printf 'Baixando %s (tentativa %s/%s)...\n' "$label" "$attempt" "$max_attempts" >&2

    if command -v curl >/dev/null 2>&1; then
      if curl -fL --connect-timeout 30 --max-time 300 --retry 3 --retry-delay 3 -o "$out_file" "$uri"; then
        [ -s "$out_file" ] && return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget --timeout=30 --tries=3 --waitretry=3 -O "$out_file" "$uri"; then
        [ -s "$out_file" ] && return 0
      fi
    else
      fail 'curl ou wget nao encontrado. Instale curl/wget e rode novamente.'
    fi

    if [ "$attempt" -lt "$max_attempts" ]; then
      printf 'Falha ao baixar %s. Tentando novamente...\n' "$label" >&2
      sleep $((attempt * 5 > 20 ? 20 : attempt * 5))
    fi
    attempt=$((attempt + 1))
  done

  fail "Falha ao baixar $label de $uri. Verifique internet, proxy/VPN/firewall e tente novamente."
}

resolve_install_spec() {
  spec="$1"
  case "$spec" in
    http://*.tgz|https://*.tgz|http://*.tgz\?*|https://*.tgz\?*)
      temp_pkg="${TMPDIR:-/tmp}/open-matrix-cli-$$-${RANDOM:-0}.tgz"
      temp_files+=("$temp_pkg")
      download_with_retry "$spec" "$temp_pkg" 'CLI OPEN MATRIX'
      printf '%s\n' "$temp_pkg"
      ;;
    *)
      printf '%s\n' "$spec"
      ;;
  esac
}

npm_install_global_with_retry() {
  spec="$1"
  max_attempts=3
  attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    printf 'Instalando pacote npm (tentativa %s/%s)...\n' "$attempt" "$max_attempts"
    if npm install -g "$spec" --no-audit --no-fund; then
      return 0
    fi
    if [ "$attempt" -lt "$max_attempts" ]; then
      printf 'npm install falhou. Tentando novamente...\n' >&2
      sleep $((attempt * 5 > 15 ? 15 : attempt * 5))
    fi
    attempt=$((attempt + 1))
  done
  fail 'npm install falhou apos varias tentativas.'
}

read_open_matrix_token() {
  OPEN_MATRIX_TOKEN="${OPEN_MATRIX_API_KEY:-}"
  if [ -n "${OPEN_MATRIX_TOKEN// }" ]; then
    return 0
  fi

  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    printf 'Cole seu token OPEN MATRIX: ' > /dev/tty
    IFS= read -r OPEN_MATRIX_TOKEN < /dev/tty || OPEN_MATRIX_TOKEN=''
    printf '\n' > /dev/tty
  else
    printf 'Cole seu token OPEN MATRIX: ' >&2
    IFS= read -r OPEN_MATRIX_TOKEN || OPEN_MATRIX_TOKEN=''
  fi
}

show_openmatrix_logo() {
  printf '\n'
  printf '   ____  ____  ____  _  _    __  __   __  ____  ____  __  _  _\n'
  printf '  /  _ \\(  _ \\(  __)( \\( )  (  \\/  ) /__\\(_  _)(  _ \\(  )( \\/ )\n'
  printf '  )  (_) )) __/ ) _) )  (    )    ( /(__)\\ )(   )   / )(  )  (\n'
  printf '  \\____/(__)  (____)(_)\\_)  (_/\\/\\_)(__)(__)(__) (_)\\_)(__)(_/\\_)\n'
  printf '\n'
  printf '  Instalador OPEN MATRIX\n\n'
}

# Prints the chosen install mode (1/2/3) to stdout.
show_install_menu() {
  # Non-interactive override (CI / scripted installs).
  case "${OPEN_MATRIX_INSTALL_MODE:-}" in
    1|2|3) printf '%s\n' "$OPEN_MATRIX_INSTALL_MODE"; return 0 ;;
  esac

  opt1='Instalar CLI no terminal'
  opt2='Instalar CLI no terminal + extensao VS Code'
  opt3='Instalar CLI no terminal + extensao no VS Antigravity'

  # Arrow-key navigation needs a real TTY. Fall back to a numbered prompt
  # otherwise (e.g. piped `curl ... | bash`).
  if [ ! -t 0 ] || [ ! -t 1 ]; then
    if [ -r /dev/tty ]; then
      exec </dev/tty
    else
      printf 'Entrada nao interativa: instalando CLI + extensao VS Code (modo 2).\n' >&2
      printf '2\n'
      return 0
    fi
  fi

  selected=1
  esc=$(printf '\033')
  # Hide cursor; restore on return.
  printf '%s[?25l' "$esc" >&2
  draw_menu() {
    printf 'Use as setas (cima/baixo) e Enter para escolher:\n\n' >&2
    i=1
    for label in "$opt1" "$opt2" "$opt3"; do
      if [ "$i" -eq "$selected" ]; then
        printf '%s[7m > %s %s[0m\n' "$esc" "$label" "$esc" >&2
      else
        printf '   %s\n' "$label" >&2
      fi
      i=$((i + 1))
    done
  }
  draw_menu
  while true; do
    # Read one byte; decode arrow escape sequences.
    IFS= read -r -n1 key 2>/dev/null || key=''
    if [ "$key" = "$esc" ]; then
      IFS= read -r -n2 rest 2>/dev/null || rest=''
      case "$rest" in
        '[A') selected=$(( selected > 1 ? selected - 1 : 3 )) ;;
        '[B') selected=$(( selected < 3 ? selected + 1 : 1 )) ;;
      esac
    else
      case "$key" in
        1) selected=1; key='' ; break_after=1 ;;
        2) selected=2; key='' ; break_after=1 ;;
        3) selected=3; key='' ; break_after=1 ;;
        '') break ;;  # Enter
      esac
      if [ "${break_after:-0}" = '1' ]; then break; fi
    fi
    # Redraw in place: move cursor up over the 4 printed lines.
    printf '%s[4A' "$esc" >&2
    draw_menu
  done
  printf '%s[?25h\n' "$esc" >&2
  printf '%s\n' "$selected"
}

find_antigravity_command() {
  if command -v antigravity-ide >/dev/null 2>&1; then
    command -v antigravity-ide
    return 0
  fi
  if command -v antigravity >/dev/null 2>&1; then
    command -v antigravity
    return 0
  fi
  for candidate in \
    "/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity" \
    "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" \
    "$HOME/.local/bin/antigravity-ide" \
    "$HOME/.local/bin/antigravity" \
    "/usr/local/bin/antigravity-ide" \
    "/usr/local/bin/antigravity" \
    "/snap/bin/antigravity"
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
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

  remote_vsix_url='https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'
  temp_vsix="${TMPDIR:-/tmp}/open-matrix-vscode-$$-${RANDOM:-0}.vsix"
  temp_files+=("$temp_vsix")
  download_with_retry "$remote_vsix_url" "$temp_vsix" 'extensao VS Code OPEN MATRIX'
  "$code_cmd" --install-extension "$temp_vsix" --force
}

show_openmatrix_logo
install_mode="$(show_install_menu)"

printf 'OPEN MATRIX installer for macOS/Linux\n'

command -v npm >/dev/null 2>&1 || fail 'npm nao encontrado. Instale Node.js LTS e rode este instalador novamente.'

install_spec="${OPEN_MATRIX_PACKAGE_SPEC:-}"
if [ -z "$install_spec" ]; then
  install_spec='https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-cli.tgz'
fi

printf 'Instalando/atualizando CLI OPEN MATRIX de: %s\n' "$install_spec"
resolved_install_spec="$(resolve_install_spec "$install_spec")"
npm_install_global_with_retry "$resolved_install_spec"

npm_prefix="$(npm prefix -g 2>/dev/null || true)"
if [ -n "$npm_prefix" ]; then
  PATH="$npm_prefix:$PATH"
  export PATH
fi

command -v open-matrix >/dev/null 2>&1 || fail 'Comando open-matrix nao encontrado apos instalacao. Verifique PATH do npm global e rode novamente.'

read_open_matrix_token

[ -n "${OPEN_MATRIX_TOKEN// }" ] || fail 'Token vazio. Rode novamente em terminal interativo ou use: OPEN_MATRIX_API_KEY="seu-token" bash -c "$(curl -fsSL https://raw.githubusercontent.com/soxvip/openmatrix/main/scripts/install.sh)"'

printf 'Configurando provider OPEN MATRIX...\n'
setup_log="${TMPDIR:-/tmp}/open-matrix-setup-$$-${RANDOM:-0}.log"
setup_err="${TMPDIR:-/tmp}/open-matrix-setup-$$-${RANDOM:-0}.err"
temp_files+=("$setup_log" "$setup_err")
setup_succeeded=0
setup_pid=''
(
  OPEN_MATRIX_API_KEY="$OPEN_MATRIX_TOKEN" open-matrix setup >"$setup_log" 2>"$setup_err"
) &
setup_pid=$!
setup_deadline=$((SECONDS + 90))
while [ "$SECONDS" -lt "$setup_deadline" ]; do
  setup_text=''
  [ -f "$setup_log" ] && setup_text="${setup_text}$(cat "$setup_log" 2>/dev/null || true)"
  [ -f "$setup_err" ] && setup_text="${setup_text}$(cat "$setup_err" 2>/dev/null || true)"
  if printf '%s' "$setup_text" | grep -q 'Configuracao OPEN MATRIX concluida\.'; then
    setup_succeeded=1
    break
  fi
  if ! kill -0 "$setup_pid" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

if kill -0 "$setup_pid" 2>/dev/null; then
  kill "$setup_pid" 2>/dev/null || true
  sleep 1
  kill -9 "$setup_pid" 2>/dev/null || true
fi
wait "$setup_pid" 2>/dev/null || setup_exit=$?
setup_exit="${setup_exit:-0}"

[ -s "$setup_log" ] && cat "$setup_log"
[ -s "$setup_err" ] && cat "$setup_err" >&2
unset OPEN_MATRIX_TOKEN

if [ "$setup_succeeded" -ne 1 ] && [ "$setup_exit" -ne 0 ]; then
  fail "Falha ao configurar provider OPEN MATRIX. Codigo: $setup_exit"
fi
if [ "$setup_succeeded" -ne 1 ]; then
  fail 'Falha ao configurar provider OPEN MATRIX: tempo limite aguardando conclusao.'
fi

if [ "$install_mode" = '1' ]; then
  printf 'Modo selecionado: apenas CLI no terminal. Extensao de editor nao sera instalada.\n'
elif [ "${OPEN_MATRIX_SKIP_VSCODE:-}" = '1' ]; then
  printf 'Instalacao da extensao de editor pulada por OPEN_MATRIX_SKIP_VSCODE=1.\n'
elif [ "$install_mode" = '2' ]; then
  code_cmd="$(find_code_command || true)"
  if [ -n "$code_cmd" ]; then
    printf 'Instalando extensao no VS Code...\n'
    if ! install_vscode_extension "$code_cmd"; then
      printf 'Aviso: nao foi possivel instalar a extensao automaticamente. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix\n' >&2
    fi
  else
    printf 'Aviso: VS Code nao encontrado via comando code nem nos caminhos padrao. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix\n' >&2
  fi
elif [ "$install_mode" = '3' ]; then
  antigravity_cmd="$(find_antigravity_command || true)"
  if [ -n "$antigravity_cmd" ]; then
    printf 'Instalando extensao no VS Antigravity...\n'
    if ! install_vscode_extension "$antigravity_cmd"; then
      printf 'Aviso: nao foi possivel instalar a extensao no Antigravity automaticamente. Instale manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix\n' >&2
    fi
  else
    printf 'Aviso: VS Antigravity nao encontrado. Instale o Antigravity IDE e rode novamente, ou instale a extensao manualmente: https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix\n' >&2
  fi
fi

printf 'OPEN MATRIX instalado e configurado.\n'
printf 'Abrindo OPEN MATRIX...\n'
open-matrix
