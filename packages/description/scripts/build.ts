import { rm } from "node:fs/promises";

// Clean dist to avoid TS5055 "would overwrite input file" errors
await rm("dist", { recursive: true, force: true });

const entrypoints = ["src/index.ts"];

const buildResult = await Bun.build({
  entrypoints,
  outdir: "dist",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  naming: "[name].js",
  external: ["bun", "@easier-idx/core", "@easier-idx/logging"],
});

if (!buildResult.success) {
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Clean up any nested src/ directory if the bundler creates one
await rm("dist/src", { recursive: true, force: true });

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
