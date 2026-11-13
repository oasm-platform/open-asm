import { builtInTools } from './built-in-tools';

describe('builtInTools', () => {
  const naabu = () => builtInTools.find((tool) => tool.name === 'naabu');

  // naabu resolves only through hard-coded public resolvers. On a network that
  // blocks outbound DNS to them every host looks unresolvable; `-sr` falls back
  // to the system resolver the worker's host actually uses.
  it('naabu falls back to the system resolver', () => {
    expect(naabu()?.command?.split(/\s+/)).toContain('-sr');
  });

  it('naabu parser keeps the port of every host:port line', () => {
    expect(
      naabu()?.parser?.('opencode.ai:443\nopencode.ai:80\r\n[INF] banner'),
    ).toEqual([443, 80]);
  });
});
