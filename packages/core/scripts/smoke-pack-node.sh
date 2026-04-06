#!/usr/bin/env bash
set -euo pipefail

repo_root="$(pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

tarball="$(npm pack --silent)"

mkdir -p "$tmpdir/proj"
cd "$tmpdir/proj"
npm init -y >/dev/null 2>&1
npm install "${repo_root}/${tarball}" >/dev/null 2>&1

node --input-type=module -e "const root = await import('@easier/core'); const config = await import('@easier/core/config'); const pg = await import('@easier/core/db/pg'); const sqlite = await import('@easier/core/db/sqlite'); const cluster = await import('@easier/core/cluster'); if (!('loadConfig' in config) || typeof pg.getPg !== 'function' || typeof sqlite.getSqlite !== 'function' || typeof cluster.kmeans !== 'function' || !('getProvider' in root)) throw new Error('missing exported entrypoints'); console.log('node-pack-ok');"
