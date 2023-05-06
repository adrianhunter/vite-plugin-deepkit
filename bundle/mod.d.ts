import ts, { SourceFile as SourceFile$1, ScriptKind, SymbolTable, Symbol, CustomTransformerFactory, TransformerFactory } from 'typescript';
import { Plugin } from 'vite';

/**
 * Contains @internal properties that are not yet in the public API of TS.
 */
interface SourceFile extends SourceFile$1 {
    /**
     * If two source files are for the same version of the same package, one will redirect to the other.
     * (See `createRedirectSourceFile` in program.ts.)
     * The redirect will have this set. The redirected-to source file will be in `redirectTargetsMap`.
     */
    redirectInfo?: any;
    scriptKind?: ScriptKind;
    externalModuleIndicator?: Node;
    commonJsModuleIndicator?: Node;
    jsGlobalAugmentations?: SymbolTable;
    symbol?: Symbol;
}

declare const transformer: CustomTransformerFactory | TransformerFactory<SourceFile>;
declare const declarationTransformer: CustomTransformerFactory | TransformerFactory<SourceFile>;

interface Options {
    test?: RegExp;
    include?: string;
    exclude?: string;
    transformers?: ts.CustomTransformers;
}

declare function deepkitType(options?: Options): Plugin;

export { Options, declarationTransformer, deepkitType, transformer };
