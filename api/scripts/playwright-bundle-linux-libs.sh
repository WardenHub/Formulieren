#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BROWSERS_DIR="$ROOT_DIR/playwright-browsers"
RUNTIME_DIR="$ROOT_DIR/playwright-runtime"
LIB_DIR="$RUNTIME_DIR/lib"
MANIFEST_PATH="$RUNTIME_DIR/manifest.txt"
MAX_GLIBC_VERSION="${PLAYWRIGHT_RUNTIME_MAX_GLIBC:-2.35}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[playwright-runtime] skip; linux only"
  exit 0
fi

find_browser_executable() {
  local headless_shell
  headless_shell="$(find "$BROWSERS_DIR" -path "*/chrome-headless-shell-linux64/chrome-headless-shell" -type f | head -n 1)"
  if [[ -n "${headless_shell:-}" ]]; then
    printf '%s\n' "$headless_shell"
    return
  fi

  find "$BROWSERS_DIR" -path "*/chrome-linux64/chrome" -type f | head -n 1
}

BROWSER_EXECUTABLE="$(find_browser_executable || true)"

if [[ -z "${BROWSER_EXECUTABLE:-}" ]]; then
  echo "[playwright-runtime] no linux chromium executable found under $BROWSERS_DIR"
  exit 1
fi

mkdir -p "$LIB_DIR"
rm -f "$LIB_DIR"/*
rm -f "$MANIFEST_PATH"

echo "[playwright-runtime] bundling shared libraries for $BROWSER_EXECUTABLE"

version_gt() {
  first="$1"
  second="$2"
  [ "$(printf '%s\n%s\n' "$second" "$first" | sort -V | tail -n 1)" = "$first" ] && [ "$first" != "$second" ]
}

required_glibc_versions() {
  file_path="$1"
  strings "$file_path" 2>/dev/null \
    | grep -Eo 'GLIBC_[0-9]+\.[0-9]+' \
    | sed 's/^GLIBC_//' \
    | sort -Vu
}

highest_required_glibc_version() {
  find "$LIB_DIR" -maxdepth 1 -type f -print0 \
    | while IFS= read -r -d '' bundled_library; do
        required_glibc_versions "$bundled_library"
      done \
    | sort -Vu \
    | tail -n 1
}

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

HIGHEST_GLIBC="$(highest_required_glibc_version || true)"

{
  echo "created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "runner_uname=$(uname -a)"
  echo "runner_glibc=$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"
  echo "max_allowed_glibc=$MAX_GLIBC_VERSION"
  echo "highest_bundled_required_glibc=${HIGHEST_GLIBC:-none}"
  echo "browser_executable=$BROWSER_EXECUTABLE"
  echo "library_count=$(find "$LIB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')"
} > "$MANIFEST_PATH"

if [[ -n "${HIGHEST_GLIBC:-}" ]] && version_gt "$HIGHEST_GLIBC" "$MAX_GLIBC_VERSION"; then
  echo "[playwright-runtime] bundled libraries require GLIBC_$HIGHEST_GLIBC, above allowed GLIBC_$MAX_GLIBC_VERSION"
  echo "[playwright-runtime] this would likely fail on Azure App Service Linux; use an older compatible GitHub runner"
  cat "$MANIFEST_PATH"
  exit 1
fi

printf '%s\n' "$BROWSER_EXECUTABLE" > "$RUNTIME_DIR/browser-executable.txt"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$RUNTIME_DIR/.ready"

echo "[playwright-runtime] bundled $(find "$LIB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ') libraries"
cat "$MANIFEST_PATH"
