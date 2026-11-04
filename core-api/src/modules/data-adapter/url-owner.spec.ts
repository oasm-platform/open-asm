import { serviceForUrl } from './url-owner';

describe('serviceForUrl', () => {
  const services = [
    { id: 's-8080', port: 8080 },
    { id: 's-80', port: 80 },
    { id: 's-443', port: 443 },
  ];

  it('files a URL under the service on its own port', () => {
    expect(serviceForUrl('http://app.example.com:8080/admin', 'app.example.com', services)).toBe('s-8080');
  });

  it('reads the default port from the scheme', () => {
    expect(serviceForUrl('http://app.example.com/a', 'app.example.com', services)).toBe('s-80');
    expect(serviceForUrl('https://APP.example.com/a', 'app.example.com', services)).toBe('s-443');
  });

  it('falls back to the main web service: 443, then 80, then the lowest port', () => {
    // A port the host does not have, another host, and an unparsable value.
    expect(serviceForUrl('https://app.example.com:9999/', 'app.example.com', services)).toBe('s-443');
    expect(serviceForUrl('https://cdn.other.net/x.js', 'app.example.com', services)).toBe('s-443');
    expect(serviceForUrl('not a url', 'app.example.com', [{ id: 's-22', port: 22 }, { id: 's-8080', port: 8080 }])).toBe('s-22');
  });

  it('has nothing to attach to without services', () => {
    expect(serviceForUrl('https://app.example.com/', 'app.example.com', [])).toBeUndefined();
  });
});
