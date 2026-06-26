#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BROWSERS_DIR="$ROOT_DIR/playwright-browsers"
RUNTIME_DIR="$ROOT_DIR/playwright-runtime"
LIB_DIR="$RUNTIME_DIR/lib"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[playwright-runtime] skip; linux only"
  exit 0
fi

find_browser_executable() {
  find "$BROWSERS_DIR" \
    \( -path "*/chrome-linux64/chrome" -o -path "*/chrome-headless-shell-linux64/chrome-headless-shell" \) \
    -type f \
    | head -n 1
}

BROWSER_EXECUTABLE="$(find_browser_executable || true)"

if [[ -z "${BROWSER_EXECUTABLE:-}" ]]; then
  echo "[playwright-runtime] no linux chromium executable found under $BROWSERS_DIR"
  exit 1
fi

mkdir -p "$LIB_DIR"
rm -f "$LIB_DIR"/*

echo "[playwright-runtime] bundling shared libraries for $BROWSER_EXECUTABLE"

mapfile -t LIBRARIES < <(
  ldd "$BROWSER_EXECUTABLE" \
    | awk '
        $3 ~ /^\// { print $3 }
        $1 ~ /^\// { print $1 }
      ' \
    | sort -u
)

if [[ "${#LIBRARIES[@]}" -eq 0 ]]; then
  echo "[playwright-runtime] no shared libraries resolved by ldd"
  exit 1
fi

for library_path in "${LIBRARIES[@]}"; do
  if [[ -f "$library_path" ]]; then
    library_name="$(basename "$library_path")"
    case "$library_name" in
      libc.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libm.so.*|ld-linux*.so.*|ld-musl*.so.*)
        echo "[playwright-runtime] skip system loader/core libc library $library_name"
        continue
        ;;
    esac
    cp -Lf "$library_path" "$LIB_DIR/"
  fi
done

printf '%s\n' "$BROWSER_EXECUTABLE" > "$RUNTIME_DIR/browser-executable.txt"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$RUNTIME_DIR/.ready"

echo "[playwright-runtime] bundled $(find "$LIB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ') libraries"
