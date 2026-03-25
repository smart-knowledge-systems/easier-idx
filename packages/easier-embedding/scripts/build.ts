import { rm } from "node:fs/promises";

const entrypoints = [
  "src/index.ts",
  "src/cost.ts",
];

const buildResult = await Bun.build({
  entrypoints,
  outdir: "dist",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  naming: "[name].js",
  external: ["bun", "openai", "@easier/core", "@easier/core/logging"],
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
