#!/bin/sh
set -eu

PLAYWRIGHT_DEPS="libglib2.0-0 libnspr4 libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxcb1 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgtk-3-0"
APP_ROOT="/home/site/wwwroot"
BROWSERS_ROOT="$APP_ROOT/playwright-browsers"

echo "[startup] ember-api bootstrap"

has_library() {
  lib_name="$1"
  if command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q "$lib_name"; then
    return 0
  fi

  if find /usr/lib /lib -name "$lib_name" -print -quit 2>/dev/null | grep -q .; then
    return 0
  fi

  return 1
}

find_chromium() {
  find "$BROWSERS_ROOT" -type f \( -path "*/chrome-linux64/chrome" -o -path "*/chrome-linux/chrome" \) -print -quit 2>/dev/null || true
}

deps_ready=1
for lib_name in libglib-2.0.so.0 libnss3.so libcairo.so.2 libgtk-3.so.0 libasound.so.2; do
  if ! has_library "$lib_name"; then
    deps_ready=0
    break
  fi
done

if [ "${PLAYWRIGHT_SKIP_SYSTEM_DEPS:-0}" = "1" ]; then
  echo "[startup] skipping playwright system dependencies by configuration"
elif [ "$deps_ready" = "1" ]; then
  echo "[startup] playwright system dependencies already available"
else
  if command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" = "0" ]; then
      echo "[startup] installing playwright system dependencies"
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y --no-install-recommends $PLAYWRIGHT_DEPS
      rm -rf /var/lib/apt/lists/*
    else
      echo "[startup] warning; not running as root, cannot install playwright system dependencies"
    fi
  else
    echo "[startup] warning; apt-get not available, cannot install playwright system dependencies"
  fi
fi

if [ -n "$(find_chromium)" ]; then
  echo "[startup] playwright chromium already available"
else
  echo "[startup] installing playwright chromium"
  PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_ROOT" npm run playwright:install
fi

echo "[startup] starting Ember API directly"
cd "$APP_ROOT"
exec npm start
