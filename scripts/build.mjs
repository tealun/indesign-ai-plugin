import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return String(pkg.version || "?");
  } catch {
    return "?";
  }
}

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
    format: "cjs",
    platform: "neutral",
    // SheetJS / some CJS packages only expose "main" — required under platform:neutral
    mainFields: ["module", "main"],
    target: ["es2020"],
    sourcemap: true,
    logLevel: "info",
    external: ["indesign", "uxp", "os", "fs", "path", "photoshop", "application"],
  });

  if (watch) {
    await ctx.watch();
    console.log("watching…");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    const ver = packageVersion();
    console.log(`build ok → dist/ (package ${ver})`);
    console.log(
      "Load THIS folder in UDT (dist/manifest.json). Panel subtitle must show the same version.",
    );
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
