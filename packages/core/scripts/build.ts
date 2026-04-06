import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

// Clean dist to avoid TS5055 "would overwrite input file" errors
await rm("dist", { recursive: true, force: true });

const entrypoints = [
  "src/index.ts",
  "src/db/util.ts",
  "src/db/store.ts",
  "src/db/sqlite.ts",
  "src/db/pg.ts",
  "src/db/migrate.ts",
  "src/db/vector.ts",
  "src/db/fts.ts",
  "src/cache.ts",
  "src/retry.ts",
  "src/usage.ts",
  "src/search/scoring.ts",
  "src/search/bm25.ts",
  "src/search/bm25-helpers.ts",
  "src/eval/gate.ts",
  "src/eval/metrics.ts",
  "src/config/config.ts",
  "src/cluster/kmeans.ts",
  "src/cluster/classify.ts",
  "src/cluster/silhouette.ts",
  "src/cluster/describe.ts",
];

const buildResult = await Bun.build({
  entrypoints,
  outdir: "dist",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  naming: "[dir]/[name].js",
  external: ["bun", "bun:sqlite", "sqlite-vec", "pg", "better-sqlite3", "@easier-idx/logging", "@easier-idx/clustering"],
});

if (!buildResult.success) {
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

for (const entrypoint of entrypoints) {
  const sourceBase = path.join(
    "dist",
    entrypoint.replace(/\.ts$/, ".js"),
  );
  const targetBase = path.join(
    "dist",
    entrypoint.replace(/^src\//, "").replace(/\.ts$/, ".js"),
  );
  await mkdir(path.dirname(targetBase), { recursive: true });
  await rename(sourceBase, targetBase);
  await rename(`${sourceBase}.map`, `${targetBase}.map`);
}

await rm(path.join("dist", "src"), { recursive: true, force: true });

const tsc = Bun.spawnSync(
  ["./node_modules/.bin/tsc", "-p", "tsconfig.build.json"],
  {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  },
);

if (tsc.exitCode !== 0) {
  process.exit(tsc.exitCode);
}
