#!/bin/sh
# node_modules が無い/古い場合だけ依存を同期してからコマンドを実行する。
set -e
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi
exec "$@"
