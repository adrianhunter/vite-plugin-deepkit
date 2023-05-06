import { defineConfig } from "vite";

import { deepkitType } from "./dist/mod.mjs";

export default defineConfig({
  plugins: [deepkitType()],


  build: {
    minify: false,
    outDir: "./tests/dist",

    

    // lib: {
    //   "entry": "./mod.mts",
    //   "formats": ["es"],
    //   "name": "cool"
    // },
    
    // // "target": "esnext",
    
    // // outDir: "tests/dist/esm",
    // rollupOptions: {
    //   "external": ["typescript"]
    //   // output: {
    //   //   "format": "esm",
    //   // },
    //   // input: {
    //   //   mod: "./tests/demo.ts",
    //   // },
    // },
  },
});


// import { defineConfig } from "vite";

// export default defineConfig({
//   resolve: {
//     alias: {
//       // micromatch: "https://esm.sh/micromatch@4.0.5",
//     },
//   },

//   build: {
//     minify: false,
//     lib: {
//       entry: "./mod.ts",
//       formats: ["es"],
//       name: "dude",
//     },
//     rollupOptions: {
//       input: {
//         plugin: "./mod.ts",
//       },
//     },
//   },
// });
