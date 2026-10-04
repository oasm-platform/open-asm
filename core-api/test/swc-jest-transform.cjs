// Per-path SWC transformer for Jest.
//
// NestJS 12 ships its packages as ESM-only, so Jest must transform them to CJS
// to run. Those package builds rely on standard ESM<->CJS default-import
// interop, so the dependency transform must keep SWC's interop helpers enabled.
//
// Application code (and its specs) predates that change and was written against
// the previous `noInterop: true` output — several specs spy on `import * as fs`
// module objects, which only works when the module object is used directly
// (interop wildcard helpers return a shallow copy). Keep `noInterop: true` for
// app files to preserve that behaviour.
//
// See the NestJS v12 migration guide: https://docs.nestjs.com/migration-guide
const { createTransformer } = require('@swc/jest');

const appTransformer = createTransformer({
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    target: 'es5',
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
  module: { type: 'commonjs', noInterop: true },
});

const dependencyTransformer = createTransformer({
  jsc: {
    parser: {
      syntax: 'ecmascript',
      decorators: true,
      dynamicImport: true,
      importAttributes: true,
    },
  },
  module: { type: 'commonjs' },
});

// Application entry-style modules that default-import CommonJS packages
// (compression, cookie-parser) must keep SWC's interop helpers, or
// `import compression from 'compression'` compiles to a bare `.default`
// access that no longer exists under `noInterop`. These files are still
// application code (TypeScript parser) but need the dependency-style module
// transform for those imports.
const appConfigInteropTransformer = createTransformer({
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    target: 'es5',
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
  module: { type: 'commonjs' },
});

const isDependency = (filename) => /[\\/]node_modules[\\/]/.test(filename);

const needsAppConfigInterop = (filename) =>
  /[\\/]src[\\/]bootstrap[\\/]configure-app\.ts$/.test(filename);

const resolveTransformer = (filename) => {
  if (isDependency(filename)) return dependencyTransformer;
  if (needsAppConfigInterop(filename)) return appConfigInteropTransformer;
  return appTransformer;
};

module.exports = {
  canInstrument: false,
  process(sourceText, sourcePath, jestOptions) {
    return resolveTransformer(sourcePath).process(sourceText, sourcePath, jestOptions);
  },
  getCacheKey(sourceText, sourcePath, ...rest) {
    return resolveTransformer(sourcePath).getCacheKey(sourceText, sourcePath, ...rest);
  },
};
