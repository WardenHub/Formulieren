#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BROWSERS_DIR="$ROOT_DIR/playwright-browsers"
RUNTIME_DIR="$ROOT_DIR/playwright-runtime"
LIB_DIR="$RUNTIME_DIR/lib"
FONTCONFIG_ROOT="$RUNTIME_DIR/fontconfig"
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
rm -rf "$FONTCONFIG_ROOT"
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

declare -A SEEN_LIBRARIES=()
declare -a LIBRARY_QUEUE=("$BROWSER_EXECUTABLE")

enqueue_library() {
  local candidate="$1"
  [[ -n "${candidate:-}" ]] || return 0
  [[ -f "$candidate" ]] || return 0
  [[ -n "${SEEN_LIBRARIES[$candidate]+x}" ]] && return 0
  SEEN_LIBRARIES["$candidate"]=1
  LIBRARY_QUEUE+=("$candidate")
}

copy_library_if_needed() {
  local library_path="$1"
  [[ -f "$library_path" ]] || return 0

  local library_name
  library_name="$(basename "$library_path")"

  case "$library_name" in
    libc.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libm.so.*|ld-linux*.so.*|ld-musl*.so.*)
      echo "[playwright-runtime] skip system loader/core libc library $library_name"
      return 0
      ;;
  esac

  cp -Lf "$library_path" "$LIB_DIR/"
  enqueue_library "$library_path"
}

resolve_ldd_libraries() {
  local file_path="$1"
  ldd "$file_path" 2>/dev/null \
    | awk '
        $3 ~ /^\// { print $3 }
        $1 ~ /^\// { print $1 }
      ' \
    | sort -u
}

while [[ "${#LIBRARY_QUEUE[@]}" -gt 0 ]]; do
  current="${LIBRARY_QUEUE[0]}"
  LIBRARY_QUEUE=("${LIBRARY_QUEUE[@]:1}")

  mapfile -t RESOLVED_LIBRARIES < <(resolve_ldd_libraries "$current")
  for library_path in "${RESOLVED_LIBRARIES[@]}"; do
    copy_library_if_needed "$library_path"
  done
done

bundle_extra_support_library() {
  local library_name="$1"
  local extra_library_path=""

  while IFS= read -r candidate; do
    extra_library_path="$candidate"
    break
  done < <(
    find /usr/lib /lib -type f -name "$library_name" 2>/dev/null | sort -u
  )

  if [[ -n "${extra_library_path:-}" ]]; then
    cp -Lf "$extra_library_path" "$LIB_DIR/"
    enqueue_library "$extra_library_path"
  fi
}

for extra_library_name in \
  libsoftokn3.so \
  libfreeblpriv3.so \
  libnssckbi.so \
  libnssdbm3.so \
  libsmime3.so \
  libssl3.so \
  libplc4.so \
  libplds4.so
do
  bundle_extra_support_library "$extra_library_name"
done

while [[ "${#LIBRARY_QUEUE[@]}" -gt 0 ]]; do
  current="${LIBRARY_QUEUE[0]}"
  LIBRARY_QUEUE=("${LIBRARY_QUEUE[@]:1}")

  mapfile -t RESOLVED_LIBRARIES < <(resolve_ldd_libraries "$current")
  for library_path in "${RESOLVED_LIBRARIES[@]}"; do
    copy_library_if_needed "$library_path"
  done
done

if [[ "$(find "$LIB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')" -eq 0 ]]; then
  echo "[playwright-runtime] no shared libraries resolved by ldd"
  exit 1
fi

mkdir -p "$FONTCONFIG_ROOT/etc" "$FONTCONFIG_ROOT/usr/share"
if [[ -d /etc/fonts ]]; then
  cp -a /etc/fonts "$FONTCONFIG_ROOT/etc/"
fi
if [[ -d /usr/share/fontconfig ]]; then
  cp -a /usr/share/fontconfig "$FONTCONFIG_ROOT/usr/share/"
fi

HIGHEST_GLIBC="$(highest_required_glibc_version || true)"

{
  echo "created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "runner_uname=$(uname -a)"
  echo "runner_glibc=$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"
  echo "max_allowed_glibc=$MAX_GLIBC_VERSION"
  echo "highest_bundled_required_glibc=${HIGHEST_GLIBC:-none}"
  echo "browser_executable=$BROWSER_EXECUTABLE"
  echo "browser_executable_relative=${BROWSER_EXECUTABLE#"$ROOT_DIR"/}"
  echo "library_count=$(find "$LIB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')"
  echo "fontconfig_bundled=$([[ -f "$FONTCONFIG_ROOT/etc/fonts/fonts.conf" ]] && echo yes || echo no)"
} > "$MANIFEST_PATH"

if [[ -n "${HIGHEST_GLIBC:-}" ]] && version_gt "$HIGHEST_GLIBC" "$MAX_GLIBC_VERSION"; then
  echo "[playwright-runtime] bundled libraries require GLIBC_$HIGHEST_GLIBC, above allowed GLIBC_$MAX_GLIBC_VERSION"
  echo "[playwright-runtime] this would likely fail on Azure App Service Linux; use an older compatible GitHub runner"
  cat "$MANIFEST_PATH"
  exit 1
fi

if [[ "$BROWSER_EXECUTABLE" == "$ROOT_DIR/"* ]]; then
  printf '%s\n' "${BROWSER_EXECUTABLE#"$ROOT_DIR"/}" > "$RUNTIME_DIR/browser-executable.txt"
else
  printf '%s\n' "$BROWSER_EXECUTABLE" > "$RUNTIME_DIR/browser-executable.txt"
fi
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$RUNTIME_DIR/.ready"

echo "[playwright-runtime] bundled $(find "$LIB_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ') libraries"
cat "$MANIFEST_PATH"
