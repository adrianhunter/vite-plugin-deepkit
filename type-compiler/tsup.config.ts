import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./dist/esm/src/compiler.js"],
  outDir: "bundle",
  dts: true,

  // "inject"

  // splitting: true,
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
  format: ["esm"],
  // clean: true,
});
