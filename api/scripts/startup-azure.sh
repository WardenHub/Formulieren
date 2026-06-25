#!/bin/sh
set -eu

PLAYWRIGHT_DEPS="libglib2.0-0 libnspr4 libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxcb1 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2"

echo "[startup] ember-api bootstrap"

if [ "${PLAYWRIGHT_SKIP_SYSTEM_DEPS:-0}" = "1" ]; then
  echo "[startup] skipping playwright system dependencies by configuration"
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

if [ -x /opt/startup/startup.sh ]; then
  echo "[startup] handing off to generated Oryx startup script"
  exec /opt/startup/startup.sh
fi

echo "[startup] generated Oryx startup script not found; starting app directly"
cd /home/site/wwwroot
exec npm start
