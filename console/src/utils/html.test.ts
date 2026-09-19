import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './html';

describe('htmlToPlainText', () => {
  it('returns empty string for nullish input', () => {
    expect(htmlToPlainText(undefined)).toBe('');
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText('')).toBe('');
  });

  it('converts block tags to line breaks and strips inline tags', () => {
    expect(htmlToPlainText('a<br>b')).toBe('a\nb');
    expect(htmlToPlainText('<p>one</p><p>two</p>')).toBe('one\n\ntwo');
    expect(htmlToPlainText('<ul><li>a</li><li>b</li></ul>')).toBe('a\n\nb');
    expect(htmlToPlainText('<b>bold</b> and <i>italic</i>')).toBe(
      'bold and italic',
    );
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToPlainText('&quot;hi&quot; &amp; &lt;tag&gt;')).toBe(
      '"hi" & <tag>',
    );
    expect(htmlToPlainText('caf&#233; &#x27;x&#x27;')).toBe("café 'x'");
    expect(htmlToPlainText('a&nbsp;b')).toBe('a b');
  });

  it('never leaves a tag behind (xss-safe input)', () => {
    const out = htmlToPlainText('<script>alert(1)</script><img src=x onerror=y>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('collapses excessive blank lines and trailing whitespace', () => {
    expect(htmlToPlainText('a<br><br><br><br>b')).toBe('a\n\nb');
    expect(htmlToPlainText('  a  \n\n\n\n  ')).toBe('a');
  });
});
