import { describe, expect, it } from 'vitest';
import { normalizeRoutePattern, routeLabel, tabLabel } from './route-labels';

describe('normalizeRoutePattern', () => {
  it('turns router params into :params and drops the trailing slash', () => {
    expect(normalizeRoutePattern('/targets/$id/$tab')).toBe('/targets/:id/:tab');
    expect(normalizeRoutePattern('/targets/')).toBe('/targets');
    expect(normalizeRoutePattern('/')).toBe('/');
    expect(normalizeRoutePattern('')).toBe('/');
  });
});

describe('routeLabel', () => {
  it('names detail pages and their tab', () => {
    expect(routeLabel('/targets/:id/:tab', { id: 'x', tab: 'overview' })).toBe('Target · Overview');
    expect(routeLabel('/settings/:tab', { tab: 'api-keys' })).toBe('Settings · Api keys');
    expect(routeLabel('/vulnerabilities/:id', { id: 'x' })).toBe('Vulnerability');
  });

  it('falls back to the first path segment', () => {
    expect(routeLabel('/vulnerabilities', {})).toBe('Vulnerabilities');
    expect(routeLabel('/', {})).toBe('Dashboard');
  });

  it('leaves out a tab that is not a plain word', () => {
    expect(routeLabel('/projects/:id/:tab', { id: 'x', tab: '<b>' })).toBe('Project');
  });
});

describe('tabLabel', () => {
  it('capitalizes a plain tab and refuses anything else', () => {
    expect(tabLabel('vulnerabilities')).toBe('Vulnerabilities');
    expect(tabLabel('Overview<')).toBeNull();
    expect(tabLabel(undefined)).toBeNull();
  });
});
