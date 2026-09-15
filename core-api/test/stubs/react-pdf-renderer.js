// E2E stub for @react-pdf/renderer.
// The assets e2e test boots the full AppModule, which imports the reports
// module; @react-pdf/renderer ships an ESM-only dependency graph that the e2e
// jest config can't transform on this pnpm layout. The assets route never
// renders a PDF, so inert proxies are sufficient to let AppModule boot.
const inert = () => null;
const makeInert = () =>
  new Proxy(inert, {
    get: (_t, prop) => (prop === 'create' ? () => ({}) : makeInert()),
    apply: () => makeInert(),
  });
module.exports = new Proxy(
  {
    renderToBuffer: async () => Buffer.from(''),
    StyleSheet: { create: (s) => s },
  },
  { get: (target, prop) => (prop in target ? target[prop] : makeInert()) },
);
