import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

function copyStatic() {
  mkdirSync(dist, { recursive: true });
  cpSync(join(root, "plugin/index.html"), join(dist, "index.html"));
  cpSync(join(root, "plugin/styles.css"), join(dist, "styles.css"));
  cpSync(join(root, "plugin/manifest.json"), join(dist, "manifest.json"));
}

async function run() {
  rmSync(dist, { recursive: true, force: true });
  copyStatic();

  const ctx = await esbuild.context({
    entryPoints: [join(root, "plugin/src/index.ts")],
    bundle: true,
    outfile: join(dist, "main.js"),
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    sourcemap: true,
    logLevel: "info",
  });

  if (watch) {
    await ctx.watch();
    console.log("watching…");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("build ok → dist/");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
