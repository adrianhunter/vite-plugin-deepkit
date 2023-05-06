import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./mod.mts"],
  outDir: "bundle",
  "external": ["typescript"],
  "skipNodeModulesBundle": true,
  splitting: false,
  outExtension: (ctx) => {
    if (ctx.format === "cjs") {
      return {
        js: ".cjs",
      };
    }
    if (ctx.format === "esm") {
      return {
        js: ".mjs",
      };
    }
    return {
      js: ".js",
    };
  },
  sourcemap: true,
  bundle: true,
  format: ["cjs", "esm"],
  clean: true,
});
