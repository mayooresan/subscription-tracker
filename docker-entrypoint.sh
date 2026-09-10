#!/bin/sh
set -e

# Ensure data directory exists and has correct ownership
mkdir -p /app/data
chown -R node:node /app/data
chmod 755 /app/data

# If running as root, drop privileges to the node user
if [ "$(id -u)" = '0' ]; then
  exec su-exec node "$@"
fi

exec "$@"
