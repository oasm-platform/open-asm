import {
  entriesFor,
  hostsInCommand,
  parseScopeTarget,
  scopeVerdict,
  type ScopeEntry,
} from './target-scope';

const verdict = (raw: string, entries: ScopeEntry[], known?: Set<string>) =>
  scopeVerdict(parseScopeTarget(raw)!, entries, known);

describe('parseScopeTarget', () => {
  it.each([
    ['https://user@API.acme.io:8443/x?y', 'api.acme.io'],
    ['acme.io:443', 'acme.io'],
    ['acme.io/login', 'acme.io'],
    ['acme.io.', 'acme.io'],
    ['10.0.0.5:80', '10.0.0.5'],
    ['10.0.0.0/24', '10.0.0.0/24'],
    ['[2001:db8::1]:443', '2001:db8::1'],
  ])('%s → %s', (raw, value) => {
    expect(parseScopeTarget(raw)?.value).toBe(value);
  });

  it.each(['10.0.0.0/33', 'not a host', ''])('rejects %p', (raw) => {
    expect(parseScopeTarget(raw)).toBeNull();
  });
});

describe('scopeVerdict', () => {
  const entries = [
    ...entriesFor('acme.io', false),
    ...entriesFor('10.0.0.0/24', false),
    ...entriesFor('2001:db8::/32', false),
    ...entriesFor('*.staging.acme.io', false),
    ...entriesFor('vpn.acme.io', true),
    ...entriesFor('10.0.0.128/25', true),
  ];

  it.each([
    ['acme.io', 'allowed'],
    ['deep.api.acme.io', 'allowed'],
    ['https://x.staging.acme.io/', 'allowed'],
    ['10.0.0.7', 'allowed'],
    ['10.0.0.0/26', 'allowed'],
    ['[2001:db8:1::5]', 'allowed'],
    ['vpn.acme.io', 'blocked'],
    ['10.0.0.200', 'blocked'],
    ['10.0.0.0/24', 'blocked'],
    ['evilacme.io', 'outside'],
    ['acme.io.evil.com', 'outside'],
    ['10.0.1.1', 'outside'],
    ['10.0.0.0/16', 'blocked'],
    ['10.1.0.0/16', 'outside'],
  ])('%s is %s', (raw, expected) => {
    expect(verdict(raw, entries)).toBe(expected);
  });

  it('counts known asset values as allowed, but a block still wins', () => {
    expect(verdict('203.0.113.9', entries, new Set(['203.0.113.9']))).toBe('allowed');
    expect(verdict('vpn.acme.io', entries, new Set(['vpn.acme.io']))).toBe('blocked');
  });

  it('allows nothing with no entries', () => {
    expect(verdict('acme.io', [])).toBe('outside');
  });
});

describe('hostsInCommand', () => {
  const hosts = (cmd: string) => hostsInCommand(cmd).map((t) => t.value);

  it('reads URLs, IPs and network-tool domain args', () => {
    expect(
      hosts('subfinder -d acme.io -o subs.txt && curl -s https://api.acme.io/v1 | jq .'),
    ).toEqual(['api.acme.io', 'acme.io']);
    expect(hosts('nmap -p 80,443 10.0.0.0/24 192.168.1.4:22')).toEqual([
      '10.0.0.0/24',
      '192.168.1.4',
    ]);
  });

  it('skips resolvers, loopback, files and code', () => {
    expect(hosts('dig @8.8.8.8 acme.io')).toEqual(['acme.io']);
    expect(hosts('curl http://127.0.0.1:8080/health')).toEqual([]);
    expect(hosts('python3 -c "import sys; print(sys.argv)" > out.json')).toEqual([]);
  });
});
