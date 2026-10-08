import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Logo from './logo';

describe('Logo', () => {
  it('renders absolute logoPath unchanged', () => {
    const url = 'https://rustfs.internal/system/logo.png?X-Amz-Signature=abc';
    render(<Logo logoPath={url} />);
    expect(screen.getByAltText('logo').getAttribute('src')).toBe(url);
  });

  it('resolves legacy relative logoPath against origin', () => {
    render(<Logo logoPath="/system/logo.png" />);
    expect(screen.getByAltText('logo').getAttribute('src')).toBe(
      `${window.location.origin}/system/logo.png`,
    );
  });

  it('falls back to bundled logo without logoPath', () => {
    render(<Logo />);
    expect(screen.getByAltText('logo').getAttribute('src')).toBe('/logo.png');
  });
});
