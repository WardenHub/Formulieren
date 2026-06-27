#!/bin/sh
set -eu

APP_ROOT="/home/site/wwwroot"

echo "[startup] ember-api bootstrap"
cd "$APP_ROOT"

# De API luistert eerst; daarna mag de HTML PDF-engine op de achtergrond warmdraaien.
# Zo blijft de healthcheck snel, terwijl de eerste echte PDF-export meestal al warm is.
export PLAYWRIGHT_SKIP_SYSTEM_DEPS=1
export PLAYWRIGHT_RUNTIME_ROOT="$APP_ROOT/playwright-runtime"
export PLAYWRIGHT_BROWSERS_PATH="$APP_ROOT/playwright-browsers"
export PLAYWRIGHT_EXECUTABLE_PATH_FILE="$APP_ROOT/playwright-runtime/browser-executable.txt"

if [ -d "$APP_ROOT/playwright-runtime/lib" ]; then
  echo "[startup] bundled playwright runtime libs available"
fi

if [ -f "$APP_ROOT/playwright-runtime/manifest.txt" ]; then
  echo "[startup] bundled playwright runtime manifest"
  cat "$APP_ROOT/playwright-runtime/manifest.txt"
fi

echo "[startup] starting Ember API directly"
exec node dist/server.js
