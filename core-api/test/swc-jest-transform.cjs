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

const isDependency = (filename) => /[\\/]node_modules[\\/]/.test(filename);

module.exports = {
  canInstrument: false,
  process(sourceText, sourcePath, jestOptions) {
    const transformer = isDependency(sourcePath)
      ? dependencyTransformer
      : appTransformer;
    return transformer.process(sourceText, sourcePath, jestOptions);
  },
  getCacheKey(sourceText, sourcePath, ...rest) {
    const transformer = isDependency(sourcePath)
      ? dependencyTransformer
      : appTransformer;
    return transformer.getCacheKey(sourceText, sourcePath, ...rest);
  },
};
