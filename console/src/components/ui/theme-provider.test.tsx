import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './theme-provider';

/** index.html's metas: one per OS color scheme, ahead of anything the app adds */
function addOsThemeColorMetas() {
  for (const [scheme, color] of [
    ['light', '#fafcfe'],
    ['dark', '#152a4f'],
  ]) {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', color);
    meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`);
    document.head.appendChild(meta);
  }
}

const themeColors = () =>
  Array.from(document.querySelectorAll('meta[name="theme-color"]')).map(
    (meta) => meta.getAttribute('content'),
  );

describe('ThemeProvider theme-color', () => {
  beforeEach(() => addOsThemeColorMetas());
  afterEach(() => {
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.remove());
    localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
  });

  it('colors the browser bar for the app theme, over the OS-scheme metas', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeProvider>app</ThemeProvider>);
    // Whichever OS-scheme meta the browser picks, it carries the dark color
    expect(themeColors()).toEqual(['#152a4f', '#152a4f']);
  });

  it('uses the light color in light mode, even on a dark OS', () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeProvider>app</ThemeProvider>);
    expect(themeColors()).toEqual(['#fbfbfd', '#fbfbfd']);
  });

  it('adds a theme-color meta when the page has none', () => {
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.remove());
    localStorage.setItem('theme', 'dark');
    render(<ThemeProvider>app</ThemeProvider>);
    expect(themeColors()).toEqual(['#152a4f']);
  });
});
