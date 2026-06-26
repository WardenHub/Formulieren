#!/bin/sh
set -eu

APP_ROOT="/home/site/wwwroot"

echo "[startup] ember-api bootstrap"
cd "$APP_ROOT"

# Azure App Service mag de API-start niet blokkeren met Playwright warm-up.
# De HTML-export probeert Playwright later expliciet te gebruiken; als de host
# daarvoor nog niet geschikt is, moet dat een snelle, duidelijke exportfout zijn
# en geen trage of kapotte API-start.
export FORM_REPORT_PREWARM_DISABLED=1
export PLAYWRIGHT_SKIP_SYSTEM_DEPS=1

if [ -d "$APP_ROOT/playwright-runtime/lib" ]; then
  export LD_LIBRARY_PATH="$APP_ROOT/playwright-runtime/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  echo "[startup] using bundled playwright runtime libs"
fi

echo "[startup] playwright prewarm disabled on Azure startup"
echo "[startup] starting Ember API directly"
exec npm start
