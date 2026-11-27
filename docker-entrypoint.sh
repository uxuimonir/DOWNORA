#!/bin/sh
# Hosts like Render mount the data disk as root. Fix its owner, then drop to
# the unprivileged "node" user before starting the server.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
