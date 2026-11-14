import { containsLikePattern, escapeLikePattern } from './like-pattern.util';

describe('like-pattern.util', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLikePattern('50%_off\\x')).toBe('50\\%\\_off\\\\x');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('api.example.com')).toBe('api.example.com');
  });

  it('wraps the escaped value for a contains match', () => {
    expect(containsLikePattern('a_b')).toBe('%a\\_b%');
  });
});
