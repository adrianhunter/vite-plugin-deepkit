// mod.mts
import { createFilter } from "@rollup/pluginutils";
import ts4 from "typescript";

// type-compiler/src/compiler.ts
import ts3 from "typescript";

// type-compiler/src/reflection-ast.ts
import ts from "typescript";
import { cloneNode as tsNodeClone } from "@marcj/ts-clone-node";
var {
  isArrowFunction,
  isComputedPropertyName,
  isIdentifier,
  isNamedImports,
  isNumericLiteral,
  isPrivateIdentifier,
  isStringLiteral,
  isStringLiteralLike,
  setOriginalNode,
  NodeFlags,
  SyntaxKind
} = ts;
function getIdentifierName(node) {
  return ts.unescapeLeadingUnderscores(node.escapedText);
}
function joinQualifiedName(name) {
  if (isIdentifier(name))
    return getIdentifierName(name);
  return joinQualifiedName(name.left) + "_" + getIdentifierName(name.right);
}
function hasJsDoc(node) {
  return "jsDoc" in node && !!node.jsDoc;
}
function extractJSDocAttribute(node, attribute) {
  if (!hasJsDoc(node))
    return "";
  for (const doc of node.jsDoc) {
    if (!doc.tags)
      continue;
    for (const tag of doc.tags) {
      if (getIdentifierName(tag.tagName) === attribute && "string" === typeof tag.comment)
        return tag.comment;
    }
  }
  return "";
}
function getPropertyName(f, node) {
  if (!node)
    return "";
  if (isIdentifier(node))
    return getIdentifierName(node);
  if (isStringLiteral(node))
    return node.text;
  if (isNumericLiteral(node))
    return +node.text;
  if (isComputedPropertyName(node)) {
    return f.createArrowFunction(void 0, void 0, [], void 0, void 0, node.expression);
  }
  if (isPrivateIdentifier(node))
    return getIdentifierName(node);
  return "";
}
function getNameAsString(node) {
  if (!node)
    return "";
  if (isIdentifier(node))
    return getIdentifierName(node);
  if (isStringLiteral(node))
    return node.text;
  if (isNumericLiteral(node))
    return node.text;
  if (isComputedPropertyName(node)) {
    if (isStringLiteralLike(node) || isNumericLiteral(node))
      return node.text;
    return "";
  }
  if (isPrivateIdentifier(node))
    return getIdentifierName(node);
  return joinQualifiedName(node);
}
function hasModifier(node, modifier) {
  if (!node.modifiers)
    return false;
  return node.modifiers.some((v) => v.kind === modifier);
}
var cloneHook = (node, payload) => {
  if (isIdentifier(node)) {
    return {
      text: () => {
        return getIdentifierName(node);
      }
    };
  }
  return;
};
var NodeConverter = class {
  constructor(f) {
    this.f = f;
  }
  toExpression(node) {
    if (node === void 0)
      return this.f.createIdentifier("undefined");
    if (Array.isArray(node)) {
      return this.f.createArrayLiteralExpression(this.f.createNodeArray(node.map((v) => this.toExpression(v))));
    }
    if ("string" === typeof node)
      return this.f.createStringLiteral(node, true);
    if ("number" === typeof node)
      return this.f.createNumericLiteral(node);
    if ("bigint" === typeof node)
      return this.f.createBigIntLiteral(String(node));
    if ("boolean" === typeof node)
      return node ? this.f.createTrue() : this.f.createFalse();
    if (node.pos === -1 && node.end === -1 && node.parent === void 0) {
      if (isArrowFunction(node)) {
        if (node.body.pos === -1 && node.body.end === -1 && node.body.parent === void 0)
          return node;
        return this.f.createArrowFunction(node.modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, this.toExpression(node.body));
      }
      return node;
    }
    switch (node.kind) {
      case SyntaxKind.Identifier:
        return finish(node, this.f.createIdentifier(getIdentifierName(node)));
      case SyntaxKind.StringLiteral:
        return finish(node, this.f.createStringLiteral(node.text));
      case SyntaxKind.NumericLiteral:
        return finish(node, this.f.createNumericLiteral(node.text));
      case SyntaxKind.BigIntLiteral:
        return finish(node, this.f.createBigIntLiteral(node.text));
      case SyntaxKind.TrueKeyword:
        return finish(node, this.f.createTrue());
      case SyntaxKind.FalseKeyword:
        return finish(node, this.f.createFalse());
    }
    try {
      return tsNodeClone(node, {
        preserveComments: false,
        factory: this.f,
        setOriginalNodes: true,
        preserveSymbols: true,
        setParents: true,
        hook: cloneHook
      });
    } catch (error) {
      console.error("could not clone node", node);
      throw error;
    }
  }
};
function isExternalOrCommonJsModule(file) {
  return (file.externalModuleIndicator || file.commonJsModuleIndicator) !== void 0;
}
function isNodeWithLocals(node) {
  return "locals" in node;
}
function getGlobalsOfSourceFile(file) {
  if (file.redirectInfo)
    return;
  if (!isNodeWithLocals(file))
    return;
  if (!isExternalOrCommonJsModule(file))
    return file.locals;
  if (file.jsGlobalAugmentations)
    return file.jsGlobalAugmentations;
  if (file.symbol && file.symbol.globalExports)
    return file.symbol.globalExports;
}
function ensureImportIsEmitted(importDeclaration, specifierName) {
  if (specifierName && importDeclaration.importClause && importDeclaration.importClause.namedBindings) {
    if (isNamedImports(importDeclaration.importClause.namedBindings)) {
      for (const element of importDeclaration.importClause.namedBindings.elements) {
        if (element.name.escapedText === specifierName.escapedText) {
          element.flags |= NodeFlags.Synthesized;
          return;
        }
      }
    }
  }
  importDeclaration.flags |= NodeFlags.Synthesized;
}
function serializeEntityNameAsExpression(f, node) {
  switch (node.kind) {
    case SyntaxKind.Identifier:
      return finish(node, f.createIdentifier(getIdentifierName(node)));
    case SyntaxKind.QualifiedName:
      return finish(node, serializeQualifiedNameAsExpression(f, node));
  }
  return node;
}
function serializeQualifiedNameAsExpression(f, node) {
  return f.createPropertyAccessExpression(serializeEntityNameAsExpression(f, node.left), node.right);
}
function finish(oldNode, newNode) {
  setOriginalNode(newNode, oldNode);
  newNode._original = newNode.original;
  newNode._symbol = oldNode._symbol ?? oldNode.symbol;
  newNode.symbol = newNode._symbol;
  return newNode;
}

// type-compiler/src/compiler.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import stripJsonComments from "strip-json-comments";

// type-spec/src/type.ts
var TypeNumberBrand = /* @__PURE__ */ ((TypeNumberBrand2) => {
  TypeNumberBrand2[TypeNumberBrand2["integer"] = 0] = "integer";
  TypeNumberBrand2[TypeNumberBrand2["int8"] = 1] = "int8";
  TypeNumberBrand2[TypeNumberBrand2["int16"] = 2] = "int16";
  TypeNumberBrand2[TypeNumberBrand2["int32"] = 3] = "int32";
  TypeNumberBrand2[TypeNumberBrand2["uint8"] = 4] = "uint8";
  TypeNumberBrand2[TypeNumberBrand2["uint16"] = 5] = "uint16";
  TypeNumberBrand2[TypeNumberBrand2["uint32"] = 6] = "uint32";
  TypeNumberBrand2[TypeNumberBrand2["float"] = 7] = "float";
  TypeNumberBrand2[TypeNumberBrand2["float32"] = 8] = "float32";
  TypeNumberBrand2[TypeNumberBrand2["float64"] = 9] = "float64";
  return TypeNumberBrand2;
})(TypeNumberBrand || {});

// type-compiler/src/resolver.ts
import * as ts2 from "typescript";
var {
  createSourceFile,
  resolveModuleName,
  SyntaxKind: SyntaxKind2,
  ScriptTarget
} = ts2;
var Resolver = class {
  constructor(compilerOptions, host) {
    this.compilerOptions = compilerOptions;
    this.host = host;
  }
  sourceFiles = {};
  resolve(from, importOrExportNode) {
    const moduleSpecifier = importOrExportNode.moduleSpecifier;
    if (!moduleSpecifier)
      return;
    if (moduleSpecifier.kind !== SyntaxKind2.StringLiteral)
      return;
    return this.resolveSourceFile(from.fileName, moduleSpecifier.text);
  }
  resolveImpl(modulePath, fromPath) {
    if (this.host.resolveModuleNames !== void 0) {
      return this.host.resolveModuleNames(
        [modulePath],
        fromPath,
        /*reusedNames*/
        void 0,
        /*redirectedReference*/
        void 0,
        this.compilerOptions
      )[0];
    }
    const result = resolveModuleName(modulePath, fromPath, this.compilerOptions, this.host);
    return result.resolvedModule;
  }
  /**
   * Tries to resolve the d.ts file path for a given module path.
   * Scans relative paths. Looks into package.json "types" and "exports" (with new 4.7 support)
   *
   * @param fromPath the path of the file that contains the import. modulePath is relative to that.
   * @param modulePath the x in 'from x'.
   */
  resolveSourceFile(fromPath, modulePath) {
    const result = this.resolveImpl(modulePath, fromPath);
    if (!result)
      return;
    const fileName = result.resolvedFileName;
    if (this.sourceFiles[fileName])
      return this.sourceFiles[fileName];
    const source = this.host.readFile(result.resolvedFileName);
    if (!source)
      return;
    const sourceFile = this.sourceFiles[fileName] = createSourceFile(fileName, source, this.compilerOptions.target || ScriptTarget.ES2018, true);
    ts2.bindSourceFile(sourceFile, this.compilerOptions);
    return sourceFile;
  }
};

// type-compiler/src/compiler.ts
import { knownLibFilesForCompilerOptions } from "@typescript/vfs";
import mm from "micromatch";
import { isObject } from "@deepkit/core";
var contains = mm.contains;
var {
  visitEachChild,
  visitNode,
  isArrayTypeNode,
  isArrowFunction: isArrowFunction2,
  isCallExpression,
  isCallSignatureDeclaration,
  isClassDeclaration,
  isClassExpression,
  isConstructorDeclaration,
  isConstructorTypeNode,
  isConstructSignatureDeclaration,
  isEnumDeclaration,
  isExportDeclaration,
  isExpressionWithTypeArguments,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionLike,
  isIdentifier: isIdentifier2,
  isImportClause,
  isImportDeclaration,
  isImportSpecifier,
  isInferTypeNode,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isMethodSignature,
  isModuleDeclaration,
  isNamedExports,
  isNamedTupleMember,
  isNewExpression,
  isObjectLiteralExpression,
  isOptionalTypeNode,
  isParameter,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isQualifiedName,
  isSourceFile,
  isStringLiteral: isStringLiteral2,
  isTypeAliasDeclaration,
  isTypeParameterDeclaration,
  isTypeQueryNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  getEffectiveConstraintOfTypeParameter,
  getJSDocTags,
  addSyntheticLeadingComment,
  createCompilerHost,
  createPrinter,
  escapeLeadingUnderscores,
  EmitHint,
  NodeFlags: NodeFlags2,
  SyntaxKind: SyntaxKind3,
  ModuleKind,
  ScriptTarget: ScriptTarget2,
  ModifierFlags,
  ScriptKind
} = ts3;
function encodeOps(ops) {
  return ops.map((v) => String.fromCharCode(v + 33)).join("");
}
function debug(...message) {
  if ("undefined" !== typeof process && "string" === typeof process.env.DEBUG && process.env.DEBUG.includes("deepkit")) {
    console.debug(...message);
  }
}
var packSizeByte = 6;
var serverEnv = "undefined" !== typeof process;
var packSize = 2 ** packSizeByte;
var OPs = {
  [13 /* literal */]: { params: 1 },
  // [ReflectionOp.pointer]: { params: 1 },
  // [ReflectionOp.arg]: { params: 1 },
  [22 /* classReference */]: { params: 1 },
  [19 /* propertySignature */]: { params: 1 },
  [18 /* property */]: { params: 1 },
  [75 /* jump */]: { params: 1 },
  [33 /* enum */]: { params: 0 },
  [34 /* enumMember */]: { params: 1 },
  [65 /* typeParameter */]: { params: 1 },
  [66 /* typeParameterDefault */]: { params: 1 },
  [45 /* mappedType */]: { params: 2 },
  [76 /* call */]: { params: 1 },
  [77 /* inline */]: { params: 1 },
  [78 /* inlineCall */]: { params: 2 },
  [68 /* loads */]: { params: 2 },
  [71 /* infer */]: { params: 2 },
  [29 /* defaultValue */]: { params: 1 },
  [17 /* parameter */]: { params: 1 },
  [15 /* method */]: { params: 1 },
  [30 /* description */]: { params: 1 },
  [7 /* numberBrand */]: { params: 1 },
  [72 /* typeof */]: { params: 1 },
  [21 /* classExtends */]: { params: 1 },
  [79 /* distribute */]: { params: 1 },
  [74 /* jumpCondition */]: { params: 2 }
};
function findVariable(frame, name, frameOffset = 0) {
  const variable = frame.variables.find((v) => v.name === name);
  if (variable) {
    return { frameOffset, stackIndex: variable.index };
  }
  if (frame.previous)
    return findVariable(frame.previous, name, frameOffset + 1);
  return;
}
function findConditionalFrame(frame) {
  if (frame.conditional)
    return frame;
  if (frame.previous)
    return findConditionalFrame(frame.previous);
  return;
}
function findSourceFile(node) {
  if (node.kind === SyntaxKind3.SourceFile)
    return node;
  let current = node.parent;
  while (current && current.kind !== SyntaxKind3.SourceFile) {
    current = current.parent;
  }
  return current;
}
var CompilerProgram = class {
  constructor(forNode, sourceFile) {
    this.forNode = forNode;
    this.sourceFile = sourceFile;
  }
  ops = [];
  stack = [];
  mainOffset = 0;
  stackPosition = 0;
  frame = { variables: [], opIndex: 0 };
  activeCoRoutines = [];
  coRoutines = [];
  buildPackStruct() {
    const ops = [...this.ops];
    if (this.coRoutines.length) {
      for (let i = this.coRoutines.length - 1; i >= 0; i--) {
        ops.unshift(...this.coRoutines[i].ops);
      }
    }
    if (this.mainOffset) {
      ops.unshift(75 /* jump */, this.mainOffset);
    }
    return { ops, stack: this.stack };
  }
  isEmpty() {
    return this.ops.length === 0;
  }
  pushConditionalFrame() {
    const frame = this.pushFrame();
    frame.conditional = true;
  }
  pushStack(item) {
    this.stack.push(item);
    return this.stackPosition++;
  }
  pushCoRoutine() {
    this.pushFrame(true);
    this.activeCoRoutines.push({ ops: [] });
  }
  popCoRoutine() {
    const coRoutine = this.activeCoRoutines.pop();
    if (!coRoutine)
      throw new Error("No active co routine found");
    this.popFrameImplicit();
    if (this.mainOffset === 0) {
      this.mainOffset = 2;
    }
    const startIndex = this.mainOffset;
    coRoutine.ops.push(49 /* return */);
    this.coRoutines.push(coRoutine);
    this.mainOffset += coRoutine.ops.length;
    return startIndex;
  }
  pushOp(...ops) {
    for (const op of ops) {
      if ("number" !== typeof op) {
        throw new Error("No valid OP added");
      }
    }
    if (this.activeCoRoutines.length) {
      this.activeCoRoutines[this.activeCoRoutines.length - 1].ops.push(...ops);
      return;
    }
    this.ops.push(...ops);
  }
  pushOpAtFrame(frame, ...ops) {
    if (this.activeCoRoutines.length) {
      this.activeCoRoutines[this.activeCoRoutines.length - 1].ops.splice(frame.opIndex, 0, ...ops);
      return;
    }
    this.ops.splice(frame.opIndex, 0, ...ops);
  }
  /**
   * Returns the index of the `entry` in the stack, if already exists. If not, add it, and return that new index.
   */
  findOrAddStackEntry(entry) {
    const index = this.stack.indexOf(entry);
    if (index !== -1)
      return index;
    return this.pushStack(entry);
  }
  /**
   * To make room for a stack entry expected on the stack as input for example.
   */
  increaseStackPosition() {
    return this.stackPosition++;
  }
  resolveFunctionParameters = /* @__PURE__ */ new Map();
  resolveFunctionParametersIncrease(fn) {
    this.resolveFunctionParameters.set(fn, (this.resolveFunctionParameters.get(fn) || 0) + 1);
  }
  resolveFunctionParametersDecrease(fn) {
    this.resolveFunctionParameters.set(fn, (this.resolveFunctionParameters.get(fn) || 1) - 1);
  }
  isResolveFunctionParameters(fn) {
    return (this.resolveFunctionParameters.get(fn) || 0) > 0;
  }
  /**
   *
   * Each pushFrame() call needs a popFrame() call.
   */
  pushFrame(implicit = false) {
    if (!implicit)
      this.pushOp(47 /* frame */);
    const opIndex = this.activeCoRoutines.length ? this.activeCoRoutines[this.activeCoRoutines.length - 1].ops.length : this.ops.length;
    this.frame = { previous: this.frame, variables: [], opIndex };
    return this.frame;
  }
  findConditionalFrame() {
    return findConditionalFrame(this.frame);
  }
  /**
   * Remove stack without doing it as OP in the processor. Some other command calls popFrame() already, which makes popFrameImplicit() an implicit popFrame.
   * e.g. union, class, etc. all call popFrame(). the current CompilerProgram needs to be aware of that, which this function is for.
   */
  popFrameImplicit() {
    if (this.frame.previous)
      this.frame = this.frame.previous;
  }
  moveFrame() {
    this.pushOp(48 /* moveFrame */);
    if (this.frame.previous)
      this.frame = this.frame.previous;
  }
  pushVariable(name, frame = this.frame) {
    this.pushOpAtFrame(frame, 67 /* var */);
    frame.variables.push({
      index: frame.variables.length,
      name
    });
    return frame.variables.length - 1;
  }
  pushTemplateParameter(name, withDefault = false) {
    this.pushOp(withDefault ? 66 /* typeParameterDefault */ : 65 /* typeParameter */, this.findOrAddStackEntry(name));
    this.frame.variables.push({
      index: this.frame.variables.length,
      name
    });
    return this.frame.variables.length - 1;
  }
  findVariable(name, frame = this.frame) {
    return findVariable(frame, name);
  }
};
function getAssignTypeExpression(call) {
  if (isParenthesizedExpression(call) && isCallExpression(call.expression)) {
    call = call.expression;
  }
  if (isCallExpression(call) && isIdentifier2(call.expression) && getIdentifierName(call.expression) === "__assignType" && call.arguments.length > 0) {
    return call.arguments[0];
  }
  return;
}
function getReceiveTypeParameter(type) {
  if (isUnionTypeNode(type)) {
    for (const t of type.types) {
      const rfn = getReceiveTypeParameter(t);
      if (rfn)
        return rfn;
    }
  } else if (isTypeReferenceNode(type) && isIdentifier2(type.typeName) && getIdentifierName(type.typeName) === "ReceiveType" && !!type.typeArguments && type.typeArguments.length === 1)
    return type;
  return;
}
var ReflectionTransformer = class {
  constructor(context) {
    this.context = context;
    this.f = context.factory;
    this.nodeConverter = new NodeConverter(this.f);
    this.compilerOptions = context.getCompilerOptions();
    this.host = createCompilerHost(this.compilerOptions);
    this.resolver = new Resolver(this.compilerOptions, this.host);
  }
  sourceFile;
  f;
  currentReflectionConfig = { mode: "never", options: {} };
  defaultExcluded = [
    "lib.dom.d.ts",
    "lib.dom.iterable.d.ts",
    "lib.es2017.typedarrays.d.ts"
  ];
  embedAssignType = false;
  reflectionMode;
  reflectionOptions;
  /**
   * Types added to this map will get a type program directly under it.
   * This is for types used in the very same file.
   */
  compileDeclarations = /* @__PURE__ */ new Map();
  /**
   * Types added to this map will get a type program at the top root level of the program.
   * This is for imported types, which need to be inlined into the current file, as we do not emit type imports (TS will omit them).
   */
  embedDeclarations = /* @__PURE__ */ new Map();
  /**
   * When a node was embedded or compiled (from the maps above), we store it here to know to not add it again.
   */
  compiledDeclarations = /* @__PURE__ */ new Set();
  addImports = [];
  nodeConverter;
  typeChecker;
  resolver;
  host;
  overriddenHost = false;
  compilerOptions;
  /**
   * When a deep call expression was found a script-wide variable is necessary
   * as temporary storage.
   */
  tempResultIdentifier;
  parseConfigHost;
  config = { compilerOptions: {} };
  forHost(host) {
    this.host = host;
    this.resolver.host = host;
    this.overriddenHost = true;
    return this;
  }
  withReflectionMode(mode, options) {
    this.reflectionMode = mode;
    this.reflectionOptions = options;
    return this;
  }
  transformBundle(node) {
    return node;
  }
  getTempResultIdentifier() {
    if (this.tempResultIdentifier)
      return this.tempResultIdentifier;
    const locals = isNodeWithLocals(this.sourceFile) ? this.sourceFile.locals : void 0;
    if (locals) {
      let found = "\u03A9r";
      for (let i = 0; ; i++) {
        found = "\u03A9r" + (i ? i : "");
        if (!locals.has(escapeLeadingUnderscores(found)))
          break;
      }
      this.tempResultIdentifier = this.f.createIdentifier(found);
    } else {
      this.tempResultIdentifier = this.f.createIdentifier("\u03A9r");
    }
    return this.tempResultIdentifier;
  }
  readTsConfig(path) {
    if (!this.parseConfigHost) {
      this.parseConfigHost = {
        useCaseSensitiveFileNames: true,
        fileExists: (path2) => this.host.fileExists(path2),
        readFile: (path2) => this.host.readFile(path2),
        readDirectory: (path2, extensions, exclude, include, depth) => {
          if (!this.host.readDirectory)
            return [];
          return this.host.readDirectory(path2, extensions || [], exclude, include || [], depth);
        }
      };
    }
    const configFile = ts3.readConfigFile(path, (path2) => this.host.readFile(path2));
    if (configFile.error) {
      debug(`Failed to read tsconfig ${path}: ${configFile.error.messageText}`);
      return;
    }
    const parsed = ts3.parseJsonConfigFileContent(configFile.config, this.parseConfigHost, dirname(path));
    if (parsed.errors.length) {
      debug(`Failed to parse tsconfig ${path}: ${parsed.errors.map((v) => v.messageText).join(", ")}`);
      return;
    }
    return Object.assign(configFile.config, { compilerOptions: parsed.options });
  }
  transformSourceFile(sourceFile) {
    this.sourceFile = sourceFile;
    if (sourceFile.scriptKind !== ScriptKind.TS && sourceFile.scriptKind !== ScriptKind.TSX)
      return sourceFile;
    if (sourceFile.deepkitTransformed)
      return sourceFile;
    sourceFile.deepkitTransformed = true;
    this.embedAssignType = false;
    if ("string" === typeof this.compilerOptions.configFilePath) {
      const configFile = this.readTsConfig(this.compilerOptions.configFilePath);
      if (configFile) {
        this.config = Object.assign({ compilerOptions: {} }, configFile);
        this.compilerOptions = Object.assign(this.config.compilerOptions, this.compilerOptions);
      }
    } else {
      const configPath = ts3.findConfigFile(dirname(sourceFile.fileName), (path) => this.host.fileExists(path));
      if (configPath) {
        const configFile = this.readTsConfig(configPath);
        if (configFile) {
          this.config = Object.assign({ compilerOptions: {} }, configFile);
          this.compilerOptions = Object.assign(this.config.compilerOptions, this.compilerOptions);
          this.compilerOptions.configFilePath = configPath;
        }
      }
    }
    if (!this.overriddenHost) {
      this.host = createCompilerHost(this.compilerOptions);
      this.resolver = new Resolver(this.compilerOptions, this.host);
    }
    this.addImports = [];
    let currentConfig = this.config;
    let basePath = this.config.compilerOptions.configFilePath;
    if (basePath) {
      basePath = dirname(basePath);
      if (!this.reflectionMode && currentConfig.reflection !== void 0)
        this.reflectionMode = this.parseReflectionMode(currentConfig.reflection, basePath);
      if (!this.compilerOptions && currentConfig.reflectionOptions !== void 0)
        this.reflectionOptions = this.parseReflectionOptionsDefaults(currentConfig.reflectionOptions);
      while ((this.reflectionMode === void 0 || this.compilerOptions === void 0) && "string" === typeof basePath && currentConfig.extends) {
        const path = join(basePath, currentConfig.extends);
        const nextConfig = ts3.readConfigFile(path, (path2) => this.host.readFile(path2));
        if (!nextConfig)
          break;
        if (!this.reflectionMode && nextConfig.config.reflection !== void 0)
          this.reflectionMode = this.parseReflectionMode(nextConfig.config.reflection, basePath);
        if (!this.reflectionOptions && nextConfig.config.reflectionOptions !== void 0)
          this.reflectionOptions = this.parseReflectionOptionsDefaults(nextConfig.config.reflectionOptions);
        currentConfig = Object.assign({}, nextConfig.config);
        basePath = dirname(path);
      }
    }
    debug(`Transform file ${sourceFile.fileName} via config ${this.compilerOptions.configFilePath || "none"}, reflection=${this.reflectionMode}.`);
    if (this.reflectionMode === "never") {
      return sourceFile;
    }
    if (!sourceFile.locals) {
      ts3.bindSourceFile(sourceFile, this.compilerOptions);
    }
    if (sourceFile.kind !== SyntaxKind3.SourceFile) {
      throw new Error(`Invalid TypeScript library imported. SyntaxKind different ${sourceFile.kind} !== ${SyntaxKind3.SourceFile}. typescript package path: ${"todo..."}`);
    }
    const visitor = (node) => {
      node = visitEachChild(node, visitor, this.context);
      if (isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isEnumDeclaration(node)) {
        const reflection = this.findReflectionConfig(node);
        if (reflection.mode !== "never") {
          this.compileDeclarations.set(node, {
            name: node.name,
            sourceFile: this.sourceFile
          });
        }
      }
      if (isMethodDeclaration(node) && node.parent && node.body && isObjectLiteralExpression(node.parent)) {
        let valid = true;
        if (node.name.kind === SyntaxKind3.Identifier && getIdentifierName(node.name) === "default")
          valid = false;
        if (valid) {
          const method = this.decorateFunctionExpression(
            this.f.createFunctionExpression(
              node.modifiers,
              node.asteriskToken,
              isIdentifier2(node.name) ? node.name : void 0,
              node.typeParameters,
              node.parameters,
              node.type,
              node.body
            )
          );
          node = this.f.createPropertyAssignment(node.name, method);
        }
      }
      if (isClassDeclaration(node)) {
        return this.decorateClass(node);
      } else if (isParameter(node) && node.parent && node.type) {
        const typeParameters = isConstructorDeclaration(node.parent) ? node.parent.parent.typeParameters : node.parent.typeParameters;
        if (!typeParameters)
          return node;
        const receiveType = getReceiveTypeParameter(node.type);
        if (receiveType && receiveType.typeArguments) {
          const first = receiveType.typeArguments[0];
          if (first && isTypeReferenceNode(first) && isIdentifier2(first.typeName)) {
            const name = getIdentifierName(first.typeName);
            const index = typeParameters.findIndex((v) => getIdentifierName(v.name) === name);
            let container = this.f.createIdentifier("globalThis");
            if ((isFunctionDeclaration(node.parent) || isFunctionExpression(node.parent)) && node.parent.name) {
              container = node.parent.name;
            } else if (isMethodDeclaration(node.parent) && isIdentifier2(node.parent.name)) {
              container = this.f.createPropertyAccessExpression(this.f.createIdentifier("this"), node.parent.name);
            } else if (isConstructorDeclaration(node.parent)) {
              container = this.f.createPropertyAccessExpression(this.f.createIdentifier("this"), "constructor");
            }
            return this.f.updateParameterDeclaration(
              node,
              node.modifiers,
              node.dotDotDotToken,
              node.name,
              node.questionToken,
              receiveType,
              this.f.createElementAccessChain(
                this.f.createPropertyAccessExpression(
                  container,
                  this.f.createIdentifier("\u03A9")
                ),
                this.f.createToken(SyntaxKind3.QuestionDotToken),
                this.f.createNumericLiteral(index)
              )
            );
          }
        }
      } else if (isClassExpression(node)) {
        return this.decorateClass(node);
      } else if (isFunctionExpression(node)) {
        return this.decorateFunctionExpression(this.injectReset\u03A9(node));
      } else if (isFunctionDeclaration(node)) {
        return this.decorateFunctionDeclaration(this.injectReset\u03A9(node));
      } else if (isMethodDeclaration(node) || isConstructorDeclaration(node)) {
        return this.injectReset\u03A9(node);
      } else if (isArrowFunction2(node)) {
        return this.decorateArrow(node);
      } else if ((isNewExpression(node) || isCallExpression(node)) && node.typeArguments && node.typeArguments.length > 0) {
        if (isCallExpression(node)) {
          const autoTypeFunctions = ["valuesOf", "propertiesOf", "typeOf"];
          if (isIdentifier2(node.expression) && autoTypeFunctions.includes(getIdentifierName(node.expression))) {
            const args = [...node.arguments];
            if (!args.length) {
              args.push(this.f.createArrayLiteralExpression());
            }
            const type = this.getTypeOfType(node.typeArguments[0]);
            if (!type)
              return node;
            args.push(type);
            return this.f.updateCallExpression(node, node.expression, node.typeArguments, this.f.createNodeArray(args));
          }
        }
        const expressionToCheck = getAssignTypeExpression(node.expression) || node.expression;
        if (isArrowFunction2(expressionToCheck)) {
          return node;
        }
        const typeExpressions = [];
        for (const a of node.typeArguments) {
          const type = this.getTypeOfType(a);
          typeExpressions.push(type || this.f.createIdentifier("undefined"));
        }
        let container = this.f.createIdentifier("globalThis");
        if (isIdentifier2(node.expression)) {
          container = node.expression;
        } else if (isPropertyAccessExpression(node.expression)) {
          container = node.expression;
        }
        const assignQ = this.f.createBinaryExpression(
          this.f.createPropertyAccessExpression(container, "\u03A9"),
          this.f.createToken(SyntaxKind3.EqualsToken),
          this.f.createArrayLiteralExpression(typeExpressions)
        );
        const update = isNewExpression(node) ? this.f.updateNewExpression : this.f.updateCallExpression;
        if (isPropertyAccessExpression(node.expression)) {
          if (isCallExpression(node.expression.expression)) {
            const r = this.getTempResultIdentifier();
            const assignQ2 = this.f.createBinaryExpression(
              this.f.createPropertyAccessExpression(
                this.f.createPropertyAccessExpression(r, node.expression.name),
                "\u03A9"
              ),
              this.f.createToken(SyntaxKind3.EqualsToken),
              this.f.createArrayLiteralExpression(typeExpressions)
            );
            return update(
              node,
              this.f.createPropertyAccessExpression(
                this.f.createParenthesizedExpression(this.f.createBinaryExpression(
                  this.f.createBinaryExpression(
                    this.f.createBinaryExpression(
                      r,
                      this.f.createToken(ts3.SyntaxKind.EqualsToken),
                      node.expression.expression
                    ),
                    this.f.createToken(ts3.SyntaxKind.CommaToken),
                    assignQ2
                  ),
                  this.f.createToken(ts3.SyntaxKind.CommaToken),
                  r
                )),
                node.expression.name
              ),
              node.typeArguments,
              node.arguments
            );
          } else if (isParenthesizedExpression(node.expression.expression)) {
            const r = this.getTempResultIdentifier();
            const assignQ2 = this.f.createBinaryExpression(
              this.f.createPropertyAccessExpression(
                this.f.createPropertyAccessExpression(r, node.expression.name),
                "\u03A9"
              ),
              this.f.createToken(SyntaxKind3.EqualsToken),
              this.f.createArrayLiteralExpression(typeExpressions)
            );
            const updatedNode = update(
              node,
              this.f.updatePropertyAccessExpression(
                node.expression,
                this.f.updateParenthesizedExpression(
                  node.expression.expression,
                  this.f.createBinaryExpression(
                    this.f.createBinaryExpression(
                      this.f.createBinaryExpression(
                        r,
                        this.f.createToken(SyntaxKind3.EqualsToken),
                        node.expression.expression.expression
                      ),
                      this.f.createToken(SyntaxKind3.CommaToken),
                      assignQ2
                    ),
                    this.f.createToken(SyntaxKind3.CommaToken),
                    r
                  )
                ),
                node.expression.name
              ),
              node.typeArguments,
              node.arguments
            );
            return this.f.createParenthesizedExpression(updatedNode);
          } else {
          }
        }
        return this.f.createParenthesizedExpression(this.f.createBinaryExpression(
          assignQ,
          this.f.createToken(SyntaxKind3.CommaToken),
          node
        ));
      }
      return node;
    };
    this.sourceFile = visitNode(this.sourceFile, visitor);
    while (true) {
      let allCompiled = true;
      for (const d of this.compileDeclarations.values()) {
        if (d.compiled)
          continue;
        allCompiled = false;
        break;
      }
      if (this.embedDeclarations.size === 0 && allCompiled)
        break;
      for (const [node, d] of [...this.compileDeclarations.entries()]) {
        if (d.compiled)
          continue;
        d.compiled = this.createProgramVarFromNode(node, d.name, this.sourceFile);
      }
      if (this.embedDeclarations.size) {
        const embedded = [];
        for (const node of this.embedDeclarations.keys()) {
          this.compiledDeclarations.add(node);
        }
        const entries = Array.from(this.embedDeclarations.entries());
        this.embedDeclarations.clear();
        for (const [node, d] of entries) {
          embedded.push(...this.createProgramVarFromNode(node, d.name, d.sourceFile));
        }
        this.sourceFile = this.f.updateSourceFile(this.sourceFile, [...embedded, ...this.sourceFile.statements]);
      }
    }
    const compileDeclarations = (node) => {
      node = visitEachChild(node, compileDeclarations, this.context);
      if (isTypeAliasDeclaration(node) || isInterfaceDeclaration(node) || isEnumDeclaration(node)) {
        const d = this.compileDeclarations.get(node);
        if (!d) {
          return node;
        }
        this.compileDeclarations.delete(node);
        this.compiledDeclarations.add(node);
        if (d.compiled) {
          return [...d.compiled, node];
        }
      }
      return node;
    };
    this.sourceFile = visitNode(this.sourceFile, compileDeclarations);
    const embedTopExpression = [];
    if (this.addImports.length) {
      const compilerOptions = this.compilerOptions;
      const handledIdentifier = [];
      for (const imp of this.addImports) {
        if (handledIdentifier.includes(getIdentifierName(imp.identifier)))
          continue;
        handledIdentifier.push(getIdentifierName(imp.identifier));
        if (compilerOptions.module === ModuleKind.CommonJS) {
          const variable = this.f.createVariableStatement(void 0, this.f.createVariableDeclarationList([this.f.createVariableDeclaration(
            this.f.createObjectBindingPattern([this.f.createBindingElement(void 0, void 0, imp.identifier)]),
            void 0,
            void 0,
            this.f.createCallExpression(this.f.createIdentifier("require"), void 0, [imp.from])
          )], NodeFlags2.Const));
          const typeDeclWithComment = addSyntheticLeadingComment(
            variable,
            SyntaxKind3.MultiLineCommentTrivia,
            "@ts-ignore",
            true
          );
          embedTopExpression.push(typeDeclWithComment);
        } else {
          const specifier = this.f.createImportSpecifier(false, imp.identifier, imp.identifier);
          const namedImports = this.f.createNamedImports([specifier]);
          const importStatement = this.f.createImportDeclaration(
            void 0,
            this.f.createImportClause(false, void 0, namedImports),
            imp.from
          );
          const typeDeclWithComment = addSyntheticLeadingComment(
            importStatement,
            SyntaxKind3.MultiLineCommentTrivia,
            "@ts-ignore",
            true
          );
          embedTopExpression.push(typeDeclWithComment);
        }
      }
    }
    if (this.embedAssignType) {
      const assignType = this.f.createFunctionDeclaration(
        void 0,
        void 0,
        this.f.createIdentifier("__assignType"),
        void 0,
        [
          this.f.createParameterDeclaration(
            void 0,
            void 0,
            this.f.createIdentifier("fn"),
            void 0,
            void 0,
            //this.f.createKeywordTypeNode(SyntaxKind.AnyKeyword),
            void 0
          ),
          this.f.createParameterDeclaration(
            void 0,
            void 0,
            this.f.createIdentifier("args"),
            void 0,
            void 0,
            //this.f.createKeywordTypeNode(SyntaxKind.AnyKeyword),
            void 0
          )
        ],
        void 0,
        //this.f.createKeywordTypeNode(SyntaxKind.AnyKeyword),
        this.f.createBlock(
          [
            this.f.createExpressionStatement(this.f.createBinaryExpression(
              this.f.createPropertyAccessExpression(
                this.f.createIdentifier("fn"),
                this.f.createIdentifier("__type")
              ),
              this.f.createToken(SyntaxKind3.EqualsToken),
              this.f.createIdentifier("args")
            )),
            this.f.createReturnStatement(this.f.createIdentifier("fn"))
          ],
          true
        )
      );
      embedTopExpression.push(assignType);
    }
    if (this.tempResultIdentifier) {
      embedTopExpression.push(
        this.f.createVariableStatement(
          void 0,
          this.f.createVariableDeclarationList(
            [this.f.createVariableDeclaration(
              this.tempResultIdentifier,
              void 0,
              void 0,
              void 0
            )],
            ts3.NodeFlags.None
          )
        )
      );
    }
    if (embedTopExpression.length) {
      this.sourceFile = this.f.updateSourceFile(this.sourceFile, [...embedTopExpression, ...this.sourceFile.statements]);
    }
    return this.sourceFile;
  }
  injectReset\u03A9(node) {
    let hasReceiveType = false;
    for (const param of node.parameters) {
      if (param.type && getReceiveTypeParameter(param.type))
        hasReceiveType = true;
    }
    if (!hasReceiveType)
      return node;
    let container = this.f.createIdentifier("globalThis");
    if ((isFunctionDeclaration(node) || isFunctionExpression(node)) && node.name) {
      container = node.name;
    } else if (isMethodDeclaration(node) && isIdentifier2(node.name)) {
      container = this.f.createPropertyAccessExpression(this.f.createIdentifier("this"), node.name);
    } else if (isConstructorDeclaration(node)) {
      container = this.f.createPropertyAccessExpression(this.f.createIdentifier("this"), "constructor");
    }
    const reset = this.f.createExpressionStatement(this.f.createBinaryExpression(
      this.f.createPropertyAccessExpression(
        container,
        this.f.createIdentifier("\u03A9")
      ),
      this.f.createToken(ts3.SyntaxKind.EqualsToken),
      this.f.createIdentifier("undefined")
    ));
    const body = node.body ? this.f.updateBlock(node.body, [reset, ...node.body.statements]) : void 0;
    if (isFunctionDeclaration(node)) {
      return this.f.updateFunctionDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        body
      );
    } else if (isFunctionExpression(node)) {
      return this.f.updateFunctionExpression(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        body || node.body
      );
    } else if (isMethodDeclaration(node)) {
      return this.f.updateMethodDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.questionToken,
        node.typeParameters,
        node.parameters,
        node.type,
        body
      );
    } else if (isConstructorDeclaration(node)) {
      return this.f.updateConstructorDeclaration(node, node.modifiers, node.parameters, body);
    }
    return node;
  }
  createProgramVarFromNode(node, name, sourceFile) {
    const typeProgram = new CompilerProgram(node, sourceFile);
    if ((isTypeAliasDeclaration(node) || isInterfaceDeclaration(node)) && node.typeParameters) {
      for (const param of node.typeParameters) {
        if (param.default) {
          this.extractPackStructOfType(param.default, typeProgram);
        }
        typeProgram.pushTemplateParameter(getIdentifierName(param.name), !!param.default);
      }
    }
    if (isTypeAliasDeclaration(node)) {
      this.extractPackStructOfType(node.type, typeProgram);
    } else {
      this.extractPackStructOfType(node, typeProgram);
    }
    const typeProgramExpression = this.packOpsAndStack(typeProgram);
    const variable = this.f.createVariableStatement(
      [],
      this.f.createVariableDeclarationList([
        this.f.createVariableDeclaration(
          this.getDeclarationVariableName(name),
          void 0,
          void 0,
          typeProgramExpression
        )
      ], NodeFlags2.Const)
    );
    if (hasModifier(node, SyntaxKind3.ExportKeyword)) {
      const exportNode = this.f.createExportDeclaration(void 0, false, this.f.createNamedExports([
        this.f.createExportSpecifier(false, this.getDeclarationVariableName(name), this.getDeclarationVariableName(name))
      ]));
      return [variable, exportNode];
    }
    return [variable];
  }
  extractPackStructOfType(node, program) {
    if (isParenthesizedTypeNode(node))
      return this.extractPackStructOfType(node.type, program);
    switch (node.kind) {
      case SyntaxKind3.StringKeyword: {
        program.pushOp(5 /* string */);
        break;
      }
      case SyntaxKind3.NumberKeyword: {
        program.pushOp(6 /* number */);
        break;
      }
      case SyntaxKind3.BooleanKeyword: {
        program.pushOp(8 /* boolean */);
        break;
      }
      case SyntaxKind3.BigIntKeyword: {
        program.pushOp(9 /* bigint */);
        break;
      }
      case SyntaxKind3.VoidKeyword: {
        program.pushOp(3 /* void */);
        break;
      }
      case SyntaxKind3.UnknownKeyword: {
        program.pushOp(2 /* unknown */);
        break;
      }
      case SyntaxKind3.ObjectKeyword: {
        program.pushOp(4 /* object */);
        break;
      }
      case SyntaxKind3.SymbolKeyword: {
        program.pushOp(10 /* symbol */);
        break;
      }
      case SyntaxKind3.NullKeyword: {
        program.pushOp(11 /* null */);
        break;
      }
      case SyntaxKind3.NeverKeyword: {
        program.pushOp(0 /* never */);
        break;
      }
      case SyntaxKind3.AnyKeyword: {
        program.pushOp(1 /* any */);
        break;
      }
      case SyntaxKind3.UndefinedKeyword: {
        program.pushOp(12 /* undefined */);
        break;
      }
      case SyntaxKind3.TrueKeyword: {
        program.pushOp(13 /* literal */, program.pushStack(this.f.createTrue()));
        break;
      }
      case SyntaxKind3.FalseKeyword: {
        program.pushOp(13 /* literal */, program.pushStack(this.f.createFalse()));
        break;
      }
      case SyntaxKind3.ClassDeclaration:
      case SyntaxKind3.ClassExpression: {
        const narrowed = node;
        if (node) {
          const members = [];
          if (narrowed.typeParameters) {
            for (const typeParameter of narrowed.typeParameters) {
              const name = getNameAsString(typeParameter.name);
              if (typeParameter.default) {
                this.extractPackStructOfType(typeParameter.default, program);
              }
              program.pushTemplateParameter(name, !!typeParameter.default);
            }
          }
          if (narrowed.heritageClauses) {
            for (const heritage of narrowed.heritageClauses) {
              if (heritage.token === SyntaxKind3.ExtendsKeyword) {
                for (const extendType of heritage.types) {
                  program.pushFrame();
                  if (extendType.typeArguments) {
                    for (const typeArgument of extendType.typeArguments) {
                      this.extractPackStructOfType(typeArgument, program);
                    }
                  }
                  const index = program.pushStack(this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, this.nodeConverter.toExpression(extendType.expression)));
                  program.pushOp(22 /* classReference */, index);
                  program.popFrameImplicit();
                }
              }
            }
          }
          for (const member of narrowed.members) {
            const name = getNameAsString(member.name);
            if (name) {
              const has = members.some((v) => getNameAsString(v.name) === name);
              if (has)
                continue;
            }
            members.push(member);
            this.extractPackStructOfType(member, program);
          }
          program.pushOp(20 /* class */);
          if (narrowed.heritageClauses && narrowed.heritageClauses[0] && narrowed.heritageClauses[0].types[0]) {
            const first = narrowed.heritageClauses[0].types[0];
            if (isExpressionWithTypeArguments(first) && first.typeArguments) {
              for (const typeArgument of first.typeArguments) {
                this.extractPackStructOfType(typeArgument, program);
              }
              program.pushOp(21 /* classExtends */, first.typeArguments.length);
            }
          }
        }
        break;
      }
      case SyntaxKind3.IntersectionType: {
        const narrowed = node;
        program.pushFrame();
        for (const type of narrowed.types) {
          this.extractPackStructOfType(type, program);
        }
        program.pushOp(42 /* intersection */);
        program.popFrameImplicit();
        break;
      }
      case SyntaxKind3.MappedType: {
        const narrowed = node;
        program.pushFrame();
        program.pushVariable(getIdentifierName(narrowed.typeParameter.name));
        const constraint = getEffectiveConstraintOfTypeParameter(narrowed.typeParameter);
        if (constraint) {
          this.extractPackStructOfType(constraint, program);
        } else {
          program.pushOp(0 /* never */);
        }
        let modifier = 0;
        if (narrowed.questionToken) {
          if (narrowed.questionToken.kind === SyntaxKind3.QuestionToken) {
            modifier |= 1 /* optional */;
          }
          if (narrowed.questionToken.kind === SyntaxKind3.MinusToken) {
            modifier |= 2 /* removeOptional */;
          }
        }
        if (narrowed.readonlyToken) {
          if (narrowed.readonlyToken.kind === SyntaxKind3.ReadonlyKeyword) {
            modifier |= 4 /* readonly */;
          }
          if (narrowed.readonlyToken.kind === SyntaxKind3.MinusToken) {
            modifier |= 8 /* removeReadonly */;
          }
        }
        program.pushCoRoutine();
        if (narrowed.nameType)
          program.pushFrame();
        if (narrowed.type) {
          this.extractPackStructOfType(narrowed.type, program);
        } else {
          program.pushOp(0 /* never */);
        }
        if (narrowed.nameType) {
          this.extractPackStructOfType(narrowed.nameType, program);
          program.pushOp(38 /* tuple */);
          program.popFrameImplicit();
        }
        const coRoutineIndex = program.popCoRoutine();
        if (narrowed.nameType) {
          program.pushOp(83 /* mappedType2 */, coRoutineIndex, modifier);
        } else {
          program.pushOp(45 /* mappedType */, coRoutineIndex, modifier);
        }
        program.popFrameImplicit();
        break;
      }
      case SyntaxKind3.TypeLiteral:
      case SyntaxKind3.InterfaceDeclaration: {
        const narrowed = node;
        program.pushFrame();
        if (isInterfaceDeclaration(narrowed) && narrowed.heritageClauses) {
          for (const heritage of narrowed.heritageClauses) {
            if (heritage.token === SyntaxKind3.ExtendsKeyword) {
              for (const extendType of heritage.types) {
                this.extractPackStructOfTypeReference(extendType, program);
              }
            }
          }
        }
        for (const member of narrowed.members) {
          this.extractPackStructOfType(member, program);
        }
        program.pushOp(44 /* objectLiteral */);
        program.popFrameImplicit();
        break;
      }
      case SyntaxKind3.TypeReference: {
        this.extractPackStructOfTypeReference(node, program);
        break;
      }
      case SyntaxKind3.ArrayType: {
        this.extractPackStructOfType(node.elementType, program);
        program.pushOp(37 /* array */);
        break;
      }
      case SyntaxKind3.RestType: {
        let type = node.type;
        if (isArrayTypeNode(type)) {
          type = type.elementType;
        }
        this.extractPackStructOfType(type, program);
        program.pushOp(31 /* rest */);
        break;
      }
      case SyntaxKind3.TupleType: {
        program.pushFrame();
        for (const element of node.elements) {
          if (isOptionalTypeNode(element)) {
            this.extractPackStructOfType(element.type, program);
            program.pushOp(39 /* tupleMember */);
            program.pushOp(23 /* optional */);
          } else if (isNamedTupleMember(element)) {
            if (element.dotDotDotToken) {
              let type = element.type;
              if (isArrayTypeNode(type)) {
                type = type.elementType;
              }
              this.extractPackStructOfType(type, program);
              program.pushOp(31 /* rest */);
            } else {
              this.extractPackStructOfType(element.type, program);
            }
            const index = program.findOrAddStackEntry(getIdentifierName(element.name));
            program.pushOp(40 /* namedTupleMember */, index);
            if (element.questionToken) {
              program.pushOp(23 /* optional */);
            }
          } else {
            this.extractPackStructOfType(element, program);
          }
        }
        program.pushOp(38 /* tuple */);
        program.popFrameImplicit();
        break;
      }
      case SyntaxKind3.PropertySignature: {
        const narrowed = node;
        if (narrowed.type) {
          this.extractPackStructOfType(narrowed.type, program);
          const name = getPropertyName(this.f, narrowed.name);
          program.pushOp(19 /* propertySignature */, program.findOrAddStackEntry(name));
          if (narrowed.questionToken)
            program.pushOp(23 /* optional */);
          if (hasModifier(narrowed, SyntaxKind3.ReadonlyKeyword))
            program.pushOp(24 /* readonly */);
          const description = extractJSDocAttribute(narrowed, "description");
          if (description)
            program.pushOp(30 /* description */, program.findOrAddStackEntry(description));
        }
        break;
      }
      case SyntaxKind3.PropertyDeclaration: {
        const narrowed = node;
        if (narrowed.type) {
          const config = this.findReflectionConfig(narrowed, program);
          if (config.mode === "never")
            return;
          this.extractPackStructOfType(narrowed.type, program);
          const name = getPropertyName(this.f, narrowed.name);
          program.pushOp(18 /* property */, program.findOrAddStackEntry(name));
          if (narrowed.questionToken)
            program.pushOp(23 /* optional */);
          if (hasModifier(narrowed, SyntaxKind3.ReadonlyKeyword))
            program.pushOp(24 /* readonly */);
          if (hasModifier(narrowed, SyntaxKind3.PrivateKeyword))
            program.pushOp(26 /* private */);
          if (hasModifier(narrowed, SyntaxKind3.ProtectedKeyword))
            program.pushOp(27 /* protected */);
          if (hasModifier(narrowed, SyntaxKind3.AbstractKeyword))
            program.pushOp(28 /* abstract */);
          if (hasModifier(narrowed, SyntaxKind3.StaticKeyword))
            program.pushOp(82 /* static */);
          if (narrowed.initializer) {
            program.pushOp(29 /* defaultValue */, program.findOrAddStackEntry(
              this.f.createFunctionExpression(
                void 0,
                void 0,
                void 0,
                void 0,
                void 0,
                void 0,
                this.f.createBlock([this.f.createReturnStatement(narrowed.initializer)])
              )
            ));
          }
          const description = extractJSDocAttribute(narrowed, "description");
          if (description)
            program.pushOp(30 /* description */, program.findOrAddStackEntry(description));
        }
        break;
      }
      case SyntaxKind3.ConditionalType: {
        const narrowed = node;
        let distributiveOverIdentifier = isTypeReferenceNode(narrowed.checkType) && isIdentifier2(narrowed.checkType.typeName) ? narrowed.checkType.typeName : void 0;
        if (distributiveOverIdentifier) {
          program.pushFrame();
          this.extractPackStructOfType(narrowed.checkType, program);
          program.pushVariable(getIdentifierName(distributiveOverIdentifier));
          program.pushCoRoutine();
        }
        program.pushConditionalFrame();
        this.extractPackStructOfType(narrowed.checkType, program);
        this.extractPackStructOfType(narrowed.extendsType, program);
        program.pushOp(80 /* extends */);
        program.pushCoRoutine();
        this.extractPackStructOfType(narrowed.trueType, program);
        const trueProgram = program.popCoRoutine();
        program.pushCoRoutine();
        this.extractPackStructOfType(narrowed.falseType, program);
        const falseProgram = program.popCoRoutine();
        program.pushOp(74 /* jumpCondition */, trueProgram, falseProgram);
        program.moveFrame();
        if (distributiveOverIdentifier) {
          const coRoutineIndex = program.popCoRoutine();
          program.pushOp(79 /* distribute */, coRoutineIndex);
          program.popFrameImplicit();
        }
        break;
      }
      case SyntaxKind3.InferType: {
        const narrowed = node;
        const frame = program.findConditionalFrame();
        if (frame) {
          const typeParameterName = getIdentifierName(narrowed.typeParameter.name);
          let variable = program.findVariable(typeParameterName);
          if (!variable) {
            program.pushVariable(typeParameterName, frame);
            variable = program.findVariable(typeParameterName);
            if (!variable)
              throw new Error("Could not find inserted infer variable");
          }
          program.pushOp(71 /* infer */, variable.frameOffset, variable.stackIndex);
        } else {
          program.pushOp(0 /* never */);
        }
        break;
      }
      case SyntaxKind3.MethodSignature:
      case SyntaxKind3.MethodDeclaration:
      case SyntaxKind3.Constructor:
      case SyntaxKind3.ArrowFunction:
      case SyntaxKind3.FunctionExpression:
      case SyntaxKind3.ConstructSignature:
      case SyntaxKind3.ConstructorType:
      case SyntaxKind3.FunctionType:
      case SyntaxKind3.CallSignature:
      case SyntaxKind3.FunctionDeclaration: {
        const narrowed = node;
        const config = this.findReflectionConfig(narrowed, program);
        if (config.mode === "never")
          return;
        const name = isCallSignatureDeclaration(node) ? "" : isConstructorTypeNode(narrowed) || isConstructSignatureDeclaration(node) ? "new" : isConstructorDeclaration(narrowed) ? "constructor" : getPropertyName(this.f, narrowed.name);
        if (!narrowed.type && narrowed.parameters.length === 0 && !name)
          return;
        program.pushFrame();
        for (let i = 0; i < narrowed.parameters.length; i++) {
          const parameter = narrowed.parameters[i];
          const parameterName = isIdentifier2(parameter.name) ? getNameAsString(parameter.name) : "param" + i;
          const type = parameter.type ? parameter.dotDotDotToken && isArrayTypeNode(parameter.type) ? parameter.type.elementType : parameter.type : void 0;
          if (type) {
            this.extractPackStructOfType(type, program);
          } else {
            program.pushOp(1 /* any */);
          }
          if (parameter.dotDotDotToken) {
            program.pushOp(31 /* rest */);
          }
          program.pushOp(17 /* parameter */, program.findOrAddStackEntry(parameterName));
          if (parameter.questionToken)
            program.pushOp(23 /* optional */);
          if (hasModifier(parameter, SyntaxKind3.PublicKeyword))
            program.pushOp(25 /* public */);
          if (hasModifier(parameter, SyntaxKind3.PrivateKeyword))
            program.pushOp(26 /* private */);
          if (hasModifier(parameter, SyntaxKind3.ProtectedKeyword))
            program.pushOp(27 /* protected */);
          if (hasModifier(parameter, SyntaxKind3.ReadonlyKeyword))
            program.pushOp(24 /* readonly */);
          if (parameter.initializer && parameter.type && !getReceiveTypeParameter(parameter.type)) {
            program.pushOp(29 /* defaultValue */, program.findOrAddStackEntry(this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, parameter.initializer)));
          }
        }
        if (narrowed.type) {
          this.extractPackStructOfType(narrowed.type, program);
        } else {
          program.pushOp(1 /* any */);
        }
        program.pushOp(
          isCallSignatureDeclaration(node) ? 85 /* callSignature */ : isMethodSignature(narrowed) || isConstructSignatureDeclaration(narrowed) ? 16 /* methodSignature */ : isMethodDeclaration(narrowed) || isConstructorDeclaration(narrowed) ? 15 /* method */ : 14 /* function */,
          program.findOrAddStackEntry(name)
        );
        if (isMethodDeclaration(narrowed)) {
          if (hasModifier(narrowed, SyntaxKind3.PrivateKeyword))
            program.pushOp(26 /* private */);
          if (hasModifier(narrowed, SyntaxKind3.ProtectedKeyword))
            program.pushOp(27 /* protected */);
          if (hasModifier(narrowed, SyntaxKind3.AbstractKeyword))
            program.pushOp(28 /* abstract */);
          if (hasModifier(narrowed, SyntaxKind3.StaticKeyword))
            program.pushOp(82 /* static */);
        }
        program.popFrameImplicit();
        break;
      }
      case SyntaxKind3.LiteralType: {
        const narrowed = node;
        if (narrowed.literal.kind === SyntaxKind3.NullKeyword) {
          program.pushOp(11 /* null */);
        } else {
          program.pushOp(13 /* literal */, program.findOrAddStackEntry(narrowed.literal));
        }
        break;
      }
      case SyntaxKind3.TemplateLiteralType: {
        const narrowed = node;
        program.pushFrame();
        if (narrowed.head.rawText) {
          program.pushOp(13 /* literal */, program.findOrAddStackEntry(narrowed.head.rawText));
        }
        for (const span of narrowed.templateSpans) {
          this.extractPackStructOfType(span.type, program);
          if (span.literal.rawText) {
            program.pushOp(13 /* literal */, program.findOrAddStackEntry(span.literal.rawText));
          }
        }
        program.pushOp(50 /* templateLiteral */);
        program.popFrameImplicit();
        break;
      }
      case SyntaxKind3.UnionType: {
        const narrowed = node;
        if (narrowed.types.length === 0) {
        } else if (narrowed.types.length === 1) {
          this.extractPackStructOfType(narrowed.types[0], program);
        } else {
          program.pushFrame();
          for (const subType of narrowed.types) {
            this.extractPackStructOfType(subType, program);
          }
          program.pushOp(41 /* union */);
          program.popFrameImplicit();
        }
        break;
      }
      case SyntaxKind3.EnumDeclaration: {
        const narrowed = node;
        program.pushFrame();
        for (const type of narrowed.members) {
          const name = getPropertyName(this.f, type.name);
          program.pushOp(34 /* enumMember */, program.findOrAddStackEntry(name));
          if (type.initializer) {
            program.pushOp(29 /* defaultValue */, program.findOrAddStackEntry(this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, type.initializer)));
          }
        }
        program.pushOp(33 /* enum */);
        program.popFrameImplicit();
        break;
      }
      case SyntaxKind3.IndexSignature: {
        const narrowed = node;
        if (narrowed.parameters.length && narrowed.parameters[0].type) {
          this.extractPackStructOfType(narrowed.parameters[0].type, program);
        } else {
          program.pushOp(1 /* any */);
        }
        this.extractPackStructOfType(narrowed.type, program);
        program.pushOp(43 /* indexSignature */);
        break;
      }
      case SyntaxKind3.TypeQuery: {
        const narrowed = node;
        if (isIdentifier2(narrowed.exprName)) {
          const resolved = this.resolveDeclaration(narrowed.exprName);
          if (resolved && findSourceFile(resolved.declaration) !== this.sourceFile && resolved.importDeclaration) {
            ensureImportIsEmitted(resolved.importDeclaration, narrowed.exprName);
          }
        }
        const expression = serializeEntityNameAsExpression(this.f, narrowed.exprName);
        program.pushOp(72 /* typeof */, program.pushStack(this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, expression)));
        break;
      }
      case SyntaxKind3.TypeOperator: {
        const narrowed = node;
        if (narrowed.type.kind === SyntaxKind3.ThisType) {
          program.pushOp(1 /* any */);
          break;
        }
        switch (narrowed.operator) {
          case SyntaxKind3.KeyOfKeyword: {
            this.extractPackStructOfType(narrowed.type, program);
            program.pushOp(70 /* keyof */);
            break;
          }
          case SyntaxKind3.ReadonlyKeyword: {
            this.extractPackStructOfType(narrowed.type, program);
            program.pushOp(24 /* readonly */);
            break;
          }
          default: {
            program.pushOp(0 /* never */);
          }
        }
        break;
      }
      case SyntaxKind3.IndexedAccessType: {
        const narrowed = node;
        this.extractPackStructOfType(narrowed.objectType, program);
        this.extractPackStructOfType(narrowed.indexType, program);
        program.pushOp(69 /* indexAccess */);
        break;
      }
      case SyntaxKind3.Identifier: {
        const narrowed = node;
        const variable = program.findVariable(getIdentifierName(narrowed));
        if (variable) {
          program.pushOp(68 /* loads */, variable.frameOffset, variable.stackIndex);
        }
        break;
      }
      default: {
        program.pushOp(0 /* never */);
      }
    }
  }
  knownClasses = {
    "Int8Array": 52 /* int8Array */,
    "Uint8Array": 54 /* uint8Array */,
    "Uint8ClampedArray": 53 /* uint8ClampedArray */,
    "Int16Array": 55 /* int16Array */,
    "Uint16Array": 56 /* uint16Array */,
    "Int32Array": 57 /* int32Array */,
    "Uint32Array": 58 /* uint32Array */,
    "Float32Array": 59 /* float32Array */,
    "Float64Array": 60 /* float64Array */,
    "ArrayBuffer": 62 /* arrayBuffer */,
    "BigInt64Array": 61 /* bigInt64Array */,
    "Date": 51 /* date */,
    "RegExp": 32 /* regexp */,
    "String": 5 /* string */,
    "Number": 6 /* number */,
    "BigInt": 9 /* bigint */,
    "Boolean": 8 /* boolean */
  };
  globalSourceFiles;
  getGlobalLibs() {
    if (this.globalSourceFiles)
      return this.globalSourceFiles;
    this.globalSourceFiles = [];
    const options = { ...this.compilerOptions };
    if (options.target && (options.target > ScriptTarget2.ES2021 && options.target < ScriptTarget2.ESNext)) {
      options.target = ScriptTarget2.ES2021;
    }
    const libs = knownLibFilesForCompilerOptions(options, ts3);
    for (const lib of libs) {
      const sourceFile = this.resolver.resolveSourceFile(this.sourceFile.fileName, "typescript/lib/" + lib.replace(".d.ts", ""));
      if (!sourceFile)
        continue;
      this.globalSourceFiles.push(sourceFile);
    }
    return this.globalSourceFiles;
  }
  /**
   * This is a custom resolver based on populated `locals` from the binder. It uses a custom resolution algorithm since
   * we have no access to the binder/TypeChecker directly and instantiating a TypeChecker per file/transformer is incredible slow.
   */
  resolveDeclaration(typeName) {
    let current = typeName.parent;
    if (typeName.kind === SyntaxKind3.QualifiedName)
      return;
    let declaration = void 0;
    while (current) {
      if (isNodeWithLocals(current) && current.locals) {
        const found = current.locals.get(typeName.escapedText);
        if (found && found.declarations && found.declarations[0]) {
          declaration = found.declarations[0];
          break;
        }
      }
      if (current.kind === SyntaxKind3.SourceFile)
        break;
      current = current.parent;
    }
    if (!declaration) {
      for (const file of this.getGlobalLibs()) {
        const globals = getGlobalsOfSourceFile(file);
        if (!globals)
          continue;
        const symbol = globals.get(typeName.escapedText);
        if (symbol && symbol.declarations && symbol.declarations[0]) {
          declaration = symbol.declarations[0];
          break;
        }
      }
    }
    let importDeclaration = void 0;
    let typeOnly = false;
    if (declaration && isImportSpecifier(declaration)) {
      if (declaration.isTypeOnly)
        typeOnly = true;
      importDeclaration = declaration.parent.parent.parent;
    } else if (declaration && isImportDeclaration(declaration)) {
      importDeclaration = declaration;
    } else if (declaration && isImportClause(declaration)) {
      importDeclaration = declaration.parent;
    }
    if (importDeclaration) {
      if (importDeclaration.importClause && importDeclaration.importClause.isTypeOnly)
        typeOnly = true;
      declaration = this.resolveImportSpecifier(typeName.escapedText, importDeclaration, this.sourceFile);
    }
    if (declaration && declaration.kind === SyntaxKind3.TypeParameter && declaration.parent.kind === SyntaxKind3.TypeAliasDeclaration) {
      declaration = declaration.parent;
    }
    if (!declaration)
      return;
    return { declaration, importDeclaration, typeOnly };
  }
  // protected resolveType(node: TypeNode): Declaration | Node {
  //     // if (isTypeReferenceNode(node)) {
  //     //     const resolved = this.resolveDeclaration(node.typeName);
  //     //     if (resolved) return resolved.declaration;
  //     //     // } else if (isIndexedAccessTypeNode(node)) {
  //     //     //     const resolved = this.resolveDeclaration(node);
  //     //     //     if (resolved) return resolved.declaration;
  //     // }
  //
  //     const typeChecker = this.getTypeCheckerForSource();
  //     const type = typeChecker.getTypeFromTypeNode(node);
  //     if (type.symbol) {
  //         const declaration: Declaration | undefined = type.symbol && type.symbol.declarations ? type.symbol.declarations[0] : undefined;
  //         if (declaration) return declaration;
  //     } else {
  //         return tsTypeToNode(this.f, type);
  //     }
  //     return node;
  // }
  getDeclarationVariableName(typeName) {
    if (isIdentifier2(typeName)) {
      return this.f.createIdentifier("__\u03A9" + getIdentifierName(typeName));
    }
    function joinQualifiedName2(name) {
      if (isIdentifier2(name))
        return getIdentifierName(name);
      return joinQualifiedName2(name.left) + "_" + getIdentifierName(name.right);
    }
    return this.f.createIdentifier("__\u03A9" + joinQualifiedName2(typeName));
  }
  isExcluded(filePath) {
    if (!this.currentReflectionConfig.options.exclude)
      return false;
    return contains(filePath, this.currentReflectionConfig.options.exclude, {
      basename: true,
      cwd: this.currentReflectionConfig.baseDir
    });
  }
  extractPackStructOfTypeReference(type, program) {
    const typeName = isTypeReferenceNode(type) ? type.typeName : isIdentifier2(type.expression) ? type.expression : void 0;
    if (!typeName) {
      program.pushOp(1 /* any */);
      return;
    }
    if (isIdentifier2(typeName) && getIdentifierName(typeName) === "InlineRuntimeType" && type.typeArguments && type.typeArguments[0] && isTypeQueryNode(type.typeArguments[0])) {
      const expression = serializeEntityNameAsExpression(this.f, type.typeArguments[0].exprName);
      program.pushOp(64 /* arg */, program.pushStack(expression));
      return;
    }
    if (isIdentifier2(typeName) && getIdentifierName(typeName) !== "constructor" && this.knownClasses[getIdentifierName(typeName)]) {
      const name = getIdentifierName(typeName);
      const op = this.knownClasses[name];
      program.pushOp(op);
    } else if (isIdentifier2(typeName) && getIdentifierName(typeName) === "Promise") {
      if (type.typeArguments && type.typeArguments[0]) {
        this.extractPackStructOfType(type.typeArguments[0], program);
      } else {
        program.pushOp(1 /* any */);
      }
      program.pushOp(63 /* promise */);
    } else if (isIdentifier2(typeName) && getIdentifierName(typeName) === "integer") {
      program.pushOp(7 /* numberBrand */, 0 /* integer */);
    } else if (isIdentifier2(typeName) && getIdentifierName(typeName) !== "constructor" && TypeNumberBrand[getIdentifierName(typeName)] !== void 0) {
      program.pushOp(7 /* numberBrand */, TypeNumberBrand[getIdentifierName(typeName)]);
    } else {
      if (isIdentifier2(typeName)) {
        const variable = program.findVariable(getIdentifierName(typeName));
        if (variable) {
          program.pushOp(68 /* loads */, variable.frameOffset, variable.stackIndex);
          return;
        }
      } else if (isInferTypeNode(typeName)) {
        this.extractPackStructOfType(typeName, program);
        return;
      }
      const resolved = this.resolveDeclaration(typeName);
      if (!resolved) {
        if (isQualifiedName(typeName)) {
          if (isIdentifier2(typeName.left)) {
            const resolved2 = this.resolveDeclaration(typeName.left);
            if (resolved2 && isEnumDeclaration(resolved2.declaration)) {
              let lastExpression;
              let indexValue = 0;
              for (const member of resolved2.declaration.members) {
                if (getNameAsString(member.name) === getNameAsString(typeName.right)) {
                  if (member.initializer) {
                    program.pushOp(64 /* arg */, program.pushStack(this.nodeConverter.toExpression(member.initializer)));
                  } else if (lastExpression) {
                    const exp = this.nodeConverter.toExpression(lastExpression);
                    program.pushOp(64 /* arg */, program.pushStack(
                      this.f.createBinaryExpression(exp, SyntaxKind3.PlusToken, this.nodeConverter.toExpression(indexValue))
                    ));
                  } else {
                    program.pushOp(64 /* arg */, program.pushStack(this.nodeConverter.toExpression(indexValue)));
                  }
                  return;
                } else {
                  indexValue++;
                  if (member.initializer) {
                    lastExpression = member.initializer;
                    indexValue = 0;
                  }
                }
              }
            }
          }
        }
        program.pushOp(0 /* never */);
        return;
      }
      let declaration = resolved.declaration;
      if (isVariableDeclaration(declaration)) {
        if (declaration.type) {
          declaration = declaration.type;
        } else if (declaration.initializer) {
          declaration = declaration.initializer;
        }
      }
      if (isModuleDeclaration(declaration) && resolved.importDeclaration) {
        if (isIdentifier2(typeName))
          ensureImportIsEmitted(resolved.importDeclaration, typeName);
        program.pushOp(72 /* typeof */, program.pushStack(this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, serializeEntityNameAsExpression(this.f, typeName))));
      } else if (isTypeAliasDeclaration(declaration) || isInterfaceDeclaration(declaration) || isEnumDeclaration(declaration)) {
        const name = getNameAsString(typeName);
        if (name === "Array") {
          if (type.typeArguments && type.typeArguments[0]) {
            this.extractPackStructOfType(type.typeArguments[0], program);
          } else {
            program.pushOp(1 /* any */);
          }
          program.pushOp(37 /* array */);
          return;
        } else if (name === "Function") {
          program.pushOp(47 /* frame */);
          program.pushOp(1 /* any */);
          program.pushOp(14 /* function */, program.pushStack(""));
          return;
        } else if (name === "Set") {
          if (type.typeArguments && type.typeArguments[0]) {
            this.extractPackStructOfType(type.typeArguments[0], program);
          } else {
            program.pushOp(1 /* any */);
          }
          program.pushOp(35 /* set */);
          return;
        } else if (name === "Map") {
          if (type.typeArguments && type.typeArguments[0]) {
            this.extractPackStructOfType(type.typeArguments[0], program);
          } else {
            program.pushOp(1 /* any */);
          }
          if (type.typeArguments && type.typeArguments[1]) {
            this.extractPackStructOfType(type.typeArguments[1], program);
          } else {
            program.pushOp(1 /* any */);
          }
          program.pushOp(36 /* map */);
          return;
        }
        if (!this.compiledDeclarations.has(declaration) && !this.compileDeclarations.has(declaration)) {
          const declarationSourceFile = findSourceFile(declaration) || this.sourceFile;
          const isGlobal = resolved.importDeclaration === void 0 && declarationSourceFile.fileName !== this.sourceFile.fileName;
          const isFromImport = resolved.importDeclaration !== void 0;
          if (this.isExcluded(declarationSourceFile.fileName)) {
            program.pushOp(1 /* any */);
            return;
          }
          if (isGlobal) {
            this.embedDeclarations.set(declaration, {
              name: typeName,
              sourceFile: declarationSourceFile
            });
          } else if (isFromImport) {
            if (resolved.importDeclaration) {
              if (resolved.typeOnly) {
                program.pushOp(1 /* any */);
                return;
              }
              const declarationReflection = this.findReflectionConfig(declaration, program);
              if (declarationReflection.mode === "never") {
                program.pushOp(1 /* any */);
                return;
              }
              const found = this.resolver.resolve(this.sourceFile, resolved.importDeclaration);
              if (!found) {
                debug("module not found");
                program.pushOp(1 /* any */);
                return;
              }
              const reflection = this.findReflectionFromPath(found.fileName);
              if (reflection.mode === "never") {
                program.pushOp(1 /* any */);
                return;
              }
              this.addImports.push({ identifier: this.getDeclarationVariableName(typeName), from: resolved.importDeclaration.moduleSpecifier });
            }
          } else {
            const reflection = this.findReflectionConfig(declaration, program);
            if (reflection.mode === "never") {
              program.pushOp(1 /* any */);
              return;
            }
            this.compileDeclarations.set(declaration, {
              name: typeName,
              sourceFile: declarationSourceFile
            });
          }
        }
        const index = program.pushStack(program.forNode === declaration ? 0 : this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, this.getDeclarationVariableName(typeName)));
        if (type.typeArguments) {
          for (const argument of type.typeArguments) {
            this.extractPackStructOfType(argument, program);
          }
          program.pushOp(78 /* inlineCall */, index, type.typeArguments.length);
        } else {
          program.pushOp(77 /* inline */, index);
        }
      } else if (isClassDeclaration(declaration) || isFunctionDeclaration(declaration) || isFunctionExpression(declaration) || isArrowFunction2(declaration)) {
        if (resolved.typeOnly) {
          program.pushOp(1 /* any */);
          return;
        }
        if (resolved.importDeclaration && isIdentifier2(typeName))
          ensureImportIsEmitted(resolved.importDeclaration, typeName);
        program.pushFrame();
        if (type.typeArguments) {
          for (const typeArgument of type.typeArguments) {
            this.extractPackStructOfType(typeArgument, program);
          }
        }
        const body = isIdentifier2(typeName) ? typeName : this.createAccessorForEntityName(typeName);
        const index = program.pushStack(this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, body));
        program.pushOp(isClassDeclaration(declaration) ? 22 /* classReference */ : 84 /* functionReference */, index);
        program.popFrameImplicit();
      } else if (isTypeParameterDeclaration(declaration)) {
        this.resolveTypeParameter(declaration, type, program);
      } else {
        this.extractPackStructOfType(declaration, program);
      }
    }
  }
  /**
   * Returns the class declaration, function/arrow declaration, or block where type was used.
   */
  getTypeUser(type) {
    let current = type;
    while (current) {
      if (current.kind === SyntaxKind3.Block)
        return current;
      if (current.kind === SyntaxKind3.ClassDeclaration)
        return current;
      if (current.kind === SyntaxKind3.ClassExpression)
        return current;
      if (current.kind === SyntaxKind3.Constructor)
        return current.parent;
      if (current.kind === SyntaxKind3.MethodDeclaration)
        return current.parent;
      if (current.kind === SyntaxKind3.ArrowFunction || current.kind === SyntaxKind3.FunctionDeclaration || current.kind === SyntaxKind3.FunctionExpression)
        return current;
      current = current.parent;
    }
    return current;
  }
  /**
   * With this function we want to check if `type` is used in the signature itself from the parent of `declaration`.
   * If so, we do not try to infer the type from runtime values.
   *
   * Examples where we do not infer from runtime, `type` being `T` and `declaration` being `<T>` (return false):
   *
   * ```typescript
   * class User<T> {
   *     config: T;
   * }
   *
   * class User<T> {
   *    constructor(public config: T) {}
   * }
   *
   * function do<T>(item: T): void {}
   * function do<T>(item: T): T {}
   * ```
   *
   * Examples where we infer from runtime (return true):
   *
   * ```typescript
   * function do<T>(item: T) {
   *     return typeOf<T>; //<-- because of that
   * }
   *
   * function do<T>(item: T) {
   *     class A {
   *         config: T; //<-- because of that
   *     }
   *     return A;
   * }
   *
   * function do<T>(item: T) {
   *     class A {
   *         doIt() {
   *             class B {
   *                 config: T; //<-- because of that
   *             }
   *             return B;
   *         }
   *     }
   *     return A;
   * }
   *
   * function do<T>(item: T) {
   *     class A {
   *         doIt(): T { //<-- because of that
   *         }
   *     }
   *     return A;
   * }
   * ```
   */
  needsToBeInferred(declaration, type) {
    const declarationUser = this.getTypeUser(declaration);
    const typeUser = this.getTypeUser(type);
    return declarationUser !== typeUser;
  }
  resolveTypeParameter(declaration, type, program) {
    const isUsedInFunction = isFunctionLike(declaration.parent);
    const resolveRuntimeTypeParameter = isUsedInFunction && program.isResolveFunctionParameters(declaration.parent) || this.needsToBeInferred(declaration, type);
    if (resolveRuntimeTypeParameter) {
      const argumentName = declaration.name.escapedText;
      const foundUsers = [];
      if (isUsedInFunction) {
        for (const parameter of declaration.parent.parameters) {
          if (!parameter.type)
            continue;
          let found = false;
          const searchArgument = (node) => {
            node = visitEachChild(node, searchArgument, this.context);
            if (isIdentifier2(node) && node.escapedText === argumentName) {
              found = true;
              node = this.f.createInferTypeNode(declaration);
            }
            return node;
          };
          const updatedParameterType = visitEachChild(parameter.type, searchArgument, this.context);
          if (found && isIdentifier2(parameter.name)) {
            foundUsers.push({ type: updatedParameterType, parameterName: parameter.name });
          }
        }
      }
      if (foundUsers.length) {
        if (foundUsers.length > 1) {
        }
        for (const foundUser of foundUsers) {
          program.pushConditionalFrame();
          program.pushOp(72 /* typeof */, program.pushStack(this.f.createArrowFunction(void 0, void 0, [], void 0, void 0, foundUser.parameterName)));
          this.extractPackStructOfType(foundUser.type, program);
          program.pushOp(80 /* extends */);
          const found = program.findVariable(getIdentifierName(declaration.name));
          if (found) {
            this.extractPackStructOfType(declaration.name, program);
          } else {
            program.pushOp(1 /* any */);
          }
          this.extractPackStructOfType({ kind: SyntaxKind3.NeverKeyword }, program);
          program.pushOp(73 /* condition */);
          program.popFrameImplicit();
        }
        if (foundUsers.length > 1) {
        }
      } else if (declaration.constraint) {
        if (isUsedInFunction)
          program.resolveFunctionParametersIncrease(declaration.parent);
        const constraint = getEffectiveConstraintOfTypeParameter(declaration);
        if (constraint) {
          this.extractPackStructOfType(constraint, program);
        } else {
          program.pushOp(0 /* never */);
        }
        if (isUsedInFunction)
          program.resolveFunctionParametersDecrease(declaration.parent);
      } else {
        program.pushOp(0 /* never */);
      }
    } else {
      program.pushOp(1 /* any */);
    }
  }
  createAccessorForEntityName(e) {
    return this.f.createPropertyAccessExpression(isIdentifier2(e.left) ? e.left : this.createAccessorForEntityName(e.left), e.right);
  }
  findDeclarationInFile(sourceFile, declarationName) {
    if (isNodeWithLocals(sourceFile) && sourceFile.locals) {
      const declarationSymbol = sourceFile.locals.get(declarationName);
      if (declarationSymbol && declarationSymbol.declarations && declarationSymbol.declarations[0]) {
        return declarationSymbol.declarations[0];
      }
    }
    return;
  }
  resolveImportSpecifier(declarationName, importOrExport, sourceFile) {
    if (!importOrExport.moduleSpecifier)
      return;
    if (!isStringLiteral2(importOrExport.moduleSpecifier))
      return;
    let source = this.resolver.resolve(sourceFile, importOrExport);
    if (!source) {
      debug("module not found", importOrExport.moduleSpecifier.text, "Is transpileOnly enabled? It needs to be disabled.");
      return;
    }
    const declaration = this.findDeclarationInFile(source, declarationName);
    if (declaration && !isImportSpecifier(declaration)) {
      if (isExportDeclaration(declaration)) {
        return this.followExport(declarationName, declaration, source);
      }
      return declaration;
    }
    if (isSourceFile(source)) {
      for (const statement of source.statements) {
        if (!isExportDeclaration(statement))
          continue;
        const found = this.followExport(declarationName, statement, source);
        if (found)
          return found;
      }
    }
    return;
  }
  followExport(declarationName, statement, sourceFile) {
    if (statement.exportClause) {
      if (isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.name.escapedText === declarationName) {
            const found = this.resolveImportSpecifier(element.propertyName ? element.propertyName.escapedText : declarationName, statement, sourceFile);
            if (found)
              return found;
          }
        }
      }
    } else {
      const found = this.resolveImportSpecifier(declarationName, statement, sourceFile);
      if (found) {
        return found;
      }
    }
    return;
  }
  getTypeOfType(type) {
    const reflection = this.findReflectionConfig(type);
    if (reflection.mode === "never")
      return;
    const program = new CompilerProgram(type, this.sourceFile);
    this.extractPackStructOfType(type, program);
    return this.packOpsAndStack(program);
  }
  packOpsAndStack(program) {
    const packStruct = program.buildPackStruct();
    if (packStruct.ops.length === 0)
      return;
    const packed = [...packStruct.stack, encodeOps(packStruct.ops)];
    return this.valueToExpression(packed);
  }
  /**
   * Note: We have to duplicate the expressions as it can be that incoming expression are from another file and contain wrong pos/end properties,
   * so the code generation is then broken when we simply reuse them. Wrong code like ``User.__type = [.toEqual({`` is then generated.
   * This function is probably not complete, but we add new copies when required.
   */
  valueToExpression(value) {
    return this.nodeConverter.toExpression(value);
  }
  /**
   * A class is decorated with type information by adding a static variable.
   *
   * class Model {
   *     static __types = pack(ReflectionOp.string); //<-- encoded type information
   *     title: string;
   * }
   */
  decorateClass(node) {
    const reflection = this.findReflectionConfig(node);
    if (reflection.mode === "never") {
      return node;
    }
    const type = this.getTypeOfType(node);
    const __type = this.f.createPropertyDeclaration(this.f.createModifiersFromModifierFlags(ModifierFlags.Static), "__type", void 0, void 0, type);
    if (isClassDeclaration(node)) {
      return this.f.updateClassDeclaration(
        node,
        node.modifiers,
        node.name,
        node.typeParameters,
        node.heritageClauses,
        this.f.createNodeArray([...node.members, __type])
      );
    }
    return this.f.updateClassExpression(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      this.f.createNodeArray([...node.members, __type])
    );
  }
  /**
   * const fn = function() {}
   *
   * => const fn = __assignType(function() {}, [34])
   */
  decorateFunctionExpression(expression) {
    const encodedType = this.getTypeOfType(expression);
    if (!encodedType)
      return expression;
    return this.wrapWithAssignType(expression, encodedType);
  }
  /**
   * function name() {}
   *
   * => function name() {}; name.__type = 34;
   */
  decorateFunctionDeclaration(declaration) {
    const encodedType = this.getTypeOfType(declaration);
    if (!encodedType)
      return declaration;
    if (!declaration.name) {
      if (!declaration.body)
        return;
      const modifier = declaration.modifiers ? declaration.modifiers.filter((v) => v.kind !== SyntaxKind3.ExportKeyword && v.kind !== SyntaxKind3.DefaultKeyword) : [];
      return this.f.createExportAssignment(void 0, void 0, this.wrapWithAssignType(
        this.f.createFunctionExpression(modifier, declaration.asteriskToken, declaration.name, declaration.typeParameters, declaration.parameters, declaration.type, declaration.body),
        encodedType
      ));
    }
    const statements = [declaration];
    statements.push(this.f.createExpressionStatement(
      this.f.createAssignment(this.f.createPropertyAccessExpression(serializeEntityNameAsExpression(this.f, declaration.name), "__type"), encodedType)
    ));
    return statements;
  }
  /**
   * const fn = () => { }
   * => const fn = Object.assign(() => {}, {__type: 34})
   */
  decorateArrow(expression) {
    const encodedType = this.getTypeOfType(expression);
    if (!encodedType)
      return expression;
    return this.wrapWithAssignType(expression, encodedType);
  }
  /**
   * Object.assign(fn, {__type: []}) is much slower than a custom implementation like
   *
   * assignType(fn, [])
   *
   * where we embed assignType() at the beginning of the type.
   */
  wrapWithAssignType(fn, type) {
    this.embedAssignType = true;
    return this.f.createCallExpression(
      this.f.createIdentifier("__assignType"),
      void 0,
      [
        fn,
        type
      ]
    );
  }
  parseReflectionMode(mode, configPathDir) {
    if (Array.isArray(mode)) {
      if (!configPathDir)
        return "never";
      const matches = contains(this.sourceFile.fileName, mode, {
        cwd: configPathDir
      });
      return matches ? "default" : "never";
    }
    if ("boolean" === typeof mode)
      return mode ? "default" : "never";
    if (mode === "default" || mode === "always")
      return mode;
    return "never";
  }
  resolvedTsConfig = {};
  resolvedPackageJson = {};
  parseReflectionOptionsDefaults(options) {
    options = isObject(options) ? options : {};
    if (!options.exclude)
      options.exclude = this.defaultExcluded;
    return options;
  }
  findReflectionConfig(node, program) {
    if (program && program.sourceFile.fileName !== this.sourceFile.fileName) {
      return { mode: "always", options: this.parseReflectionOptionsDefaults({}) };
    }
    let current = node;
    let reflection;
    do {
      const tags = getJSDocTags(current);
      for (const tag of tags) {
        if (!reflection && getIdentifierName(tag.tagName) === "reflection" && "string" === typeof tag.comment) {
          return { mode: this.parseReflectionMode(tag.comment || true, ""), options: this.parseReflectionOptionsDefaults({}) };
        }
      }
      current = current.parent;
    } while (current);
    if (this.reflectionMode !== void 0)
      return { mode: this.reflectionMode, options: this.parseReflectionOptionsDefaults(this.reflectionOptions || {}) };
    if (!serverEnv) {
      return { mode: "default", options: this.parseReflectionOptionsDefaults({}) };
    }
    if (program && program.sourceFile.fileName === this.sourceFile.fileName) {
      return { mode: this.reflectionMode || "never", options: this.parseReflectionOptionsDefaults(this.reflectionOptions || {}) };
    }
    const sourceFile = findSourceFile(node) || this.sourceFile;
    return this.findReflectionFromPath(sourceFile.fileName);
  }
  readJson(path) {
    try {
      let content = readFileSync(path, "utf8");
      content = stripJsonComments(content);
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Could not parse ${path}: ${error}`);
    }
    return void 0;
  }
  findReflectionFromPath(path) {
    if (!serverEnv) {
      return { mode: "default", options: this.parseReflectionOptionsDefaults({}) };
    }
    let currentDir = dirname(path);
    let reflection;
    while (currentDir) {
      const packageJsonPath = join(currentDir, "package.json");
      const tsConfigPath = join(currentDir, "tsconfig.json");
      let packageJson = {};
      let tsConfig = {};
      const packageJsonCache = this.resolvedPackageJson[packageJsonPath];
      let packageJsonExists = false;
      if (packageJsonCache) {
        packageJson = packageJsonCache.data;
        packageJsonExists = packageJsonCache.exists;
      } else {
        packageJsonExists = existsSync(packageJsonPath);
        this.resolvedPackageJson[packageJsonPath] = { exists: packageJsonExists, data: {} };
        if (packageJsonExists) {
          try {
            let content = readFileSync(packageJsonPath, "utf8");
            content = stripJsonComments(content);
            packageJson = JSON.parse(content);
            this.resolvedPackageJson[packageJsonPath].data = packageJson;
          } catch (error) {
            console.warn(`Could not parse ${packageJsonPath}: ${error}`);
          }
        }
      }
      const tsConfigCache = this.resolvedTsConfig[tsConfigPath];
      let tsConfigExists = false;
      if (tsConfigCache) {
        tsConfig = tsConfigCache.data;
        tsConfigExists = tsConfigCache.exists;
      } else {
        tsConfigExists = existsSync(tsConfigPath);
        this.resolvedTsConfig[tsConfigPath] = { exists: tsConfigExists, data: {} };
        if (tsConfigExists) {
          try {
            tsConfig = this.readJson(tsConfigPath) || {};
            let dir = currentDir;
            while (tsConfig.extends) {
              const file = isAbsolute(tsConfig.extends) ? tsConfig.extends : join(dir, tsConfig.extends);
              const ext = this.readJson(file) || {};
              delete tsConfig.extends;
              tsConfig = Object.assign(ext, tsConfig);
              dir = dirname(file);
            }
            this.resolvedTsConfig[tsConfigPath].data = tsConfig;
          } catch (error) {
            console.warn(`Could not parse ${tsConfigPath}: ${error}`);
          }
        }
      }
      if (reflection === void 0 && packageJson.reflection !== void 0) {
        return {
          mode: this.parseReflectionMode(packageJson.reflection, currentDir),
          baseDir: currentDir,
          options: this.parseReflectionOptionsDefaults(packageJson.reflectionOptions || {})
        };
      }
      if (reflection === void 0 && tsConfig.reflection !== void 0) {
        return {
          mode: this.parseReflectionMode(tsConfig.reflection, currentDir),
          baseDir: currentDir,
          options: this.parseReflectionOptionsDefaults(tsConfig.reflectionOptions || {})
        };
      }
      if (packageJsonExists) {
        break;
      }
      const next = join(currentDir, "..");
      if (resolve(next) === resolve(currentDir))
        break;
      currentDir = next;
    }
    return { mode: reflection || "never", options: this.parseReflectionOptionsDefaults({}) };
  }
};
var DeclarationTransformer = class extends ReflectionTransformer {
  addExports = [];
  transformSourceFile(sourceFile) {
    if (sourceFile.deepkitDeclarationTransformed)
      return sourceFile;
    sourceFile.deepkitDeclarationTransformed = true;
    this.sourceFile = sourceFile;
    this.addExports = [];
    const reflection = this.findReflectionConfig(sourceFile);
    if (reflection.mode === "never") {
      return sourceFile;
    }
    const visitor = (node) => {
      node = visitEachChild(node, visitor, this.context);
      if ((isTypeAliasDeclaration(node) || isInterfaceDeclaration(node)) && hasModifier(node, SyntaxKind3.ExportKeyword)) {
        const reflection2 = this.findReflectionConfig(node.original || node);
        if (reflection2.mode !== "never") {
          this.addExports.push({ identifier: getIdentifierName(this.getDeclarationVariableName(node.name)) });
        }
      }
      return node;
    };
    this.sourceFile = visitNode(this.sourceFile, visitor);
    if (this.addExports.length) {
      const exports = [];
      const handledIdentifier = [];
      for (const imp of this.addExports) {
        if (handledIdentifier.includes(imp.identifier))
          continue;
        handledIdentifier.push(imp.identifier);
        exports.push(this.f.createTypeAliasDeclaration(
          [
            this.f.createModifier(SyntaxKind3.ExportKeyword),
            this.f.createModifier(SyntaxKind3.DeclareKeyword)
          ],
          this.f.createIdentifier(imp.identifier),
          void 0,
          this.f.createArrayTypeNode(this.f.createKeywordTypeNode(SyntaxKind3.AnyKeyword))
        ));
      }
      this.sourceFile = this.f.updateSourceFile(this.sourceFile, [...this.sourceFile.statements, ...exports]);
    }
    return this.sourceFile;
  }
};
var loaded = false;
var transformer = function deepkitTransformer(context) {
  if (!loaded) {
    debug("@deepkit/type transformer loaded\n");
    loaded = true;
  }
  return new ReflectionTransformer(context);
};
var declarationTransformer = function deepkitDeclarationTransformer(context) {
  return new DeclarationTransformer(context);
};

// mod.mts
function deepkitType(options = {}) {
  const filter = createFilter(options.include ?? "**/*.ts", options.exclude ?? "node_modules/**");
  const transformers = options.transformers || {
    before: [transformer],
    after: [declarationTransformer]
  };
  return {
    name: "deepkit-type",
    enforce: "pre",
    transform(code, fileName) {
      if (!filter(fileName))
        return null;
      const transformed = ts4.transpileModule(code, {
        "compilerOptions": {
          "target": ts4.ScriptTarget.ESNext,
          "module": ts4.ModuleKind.ESNext
        },
        fileName,
        //@ts-ignore
        transformers
      });
      return {
        code: transformed.outputText,
        map: transformed.sourceMapText
      };
    }
  };
}
export {
  declarationTransformer,
  deepkitType,
  transformer
};
//# sourceMappingURL=mod.mjs.map