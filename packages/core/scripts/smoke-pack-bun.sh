#!/usr/bin/env bash
set -euo pipefail

repo_root="$(pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

tarball="$(npm pack --silent)"

mkdir -p "$tmpdir/proj"
cd "$tmpdir/proj"
bun init -y >/dev/null 2>&1
bun add "${repo_root}/${tarball}" >/dev/null 2>&1

bun -e "const root = await import('@easier/core'); if (!('getSqlite' in root) || !('getPg' in root)) throw new Error('missing root exports'); const cluster = await import('@easier/core/cluster'); if (typeof cluster.kmeans !== 'function') throw new Error('missing cluster export'); console.log('bun-pack-ok');"
