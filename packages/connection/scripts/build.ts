import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

const entrypoints = ["src/index.ts", "src/threshold.ts"];

const buildResult = await Bun.build({
  entrypoints,
  outdir: "dist",
  target: "bun",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  naming: "[name].js",
  external: ["bun", "@easier/core"],
});

if (!buildResult.success) {
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

await rm("dist/src", { recursive: true, force: true });

const tsc = Bun.spawnSync(
  ["./node_modules/.bin/tsc", "-p", "tsconfig.build.json"],
  { stdout: "inherit", stderr: "inherit", stdin: "inherit" },
);

if (tsc.exitCode !== 0) {
  process.exit(tsc.exitCode);
}
