import type { Plugin } from "vite";
export interface Options {
    test?: RegExp;
    include?: string;
    exclude?: string;
}
export declare function deepkitType(options?: Options): Plugin;
