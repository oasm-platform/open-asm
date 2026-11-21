import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { errorMessageMatchers } from '@/common/errors/error-i18n';

const SRC = path.join(__dirname, '..');

/** Error classes whose message reaches an HTTP client. */
const THROWN = new Set([
  'InvalidInputError',
  'UnauthenticatedError',
  'ForbiddenError',
  'NotFoundError',
  'ConflictError',
  'BadRequestException',
  'UnauthorizedException',
  'ForbiddenException',
  'NotFoundException',
  'ConflictException',
  'GoneException',
  'PayloadTooLargeException',
  'UnprocessableEntityException',
  'ServiceUnavailableException',
  'NotImplementedException',
  'InternalServerErrorException',
  'BadGatewayException',
  'RequestTimeoutException',
  'NotAcceptableException',
  'MethodNotAllowedException',
  'PreconditionFailedException',
  'UnsupportedMediaTypeException',
  'HttpVersionNotSupportedException',
  'GatewayTimeoutException',
  'ImATeapotException',
  'MisdirectedException',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/(?<!\.spec|\.d)\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** `${dto.name}` → `name`, `${missing.join(', ')}` → `missing`. */
function argName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isElementAccessExpression(expr)) return argName(expr.expression);
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const target = callee.expression;
      return ts.isIdentifier(target) && /^[A-Z]/.test(target.text)
        ? expr.arguments[0]
          ? argName(expr.arguments[0])
          : 'value'
        : argName(target);
    }
    // String(x), Number(x): name the argument
    return expr.arguments[0] ? argName(expr.arguments[0]) : argName(callee);
  }
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) {
    return argName(expr.expression);
  }
  return 'value';
}

/** The message as an `errors` template, or undefined when not static text. */
function messageOf(
  arg: ts.Expression,
  file: ts.SourceFile,
): string | undefined {
  const parts: (string | ts.Expression)[] = [];
  const collect = (e: ts.Expression): boolean => {
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      parts.push(e.text);
      return true;
    }
    if (ts.isTemplateExpression(e)) {
      parts.push(e.head.text);
      for (const span of e.templateSpans) {
        parts.push(span.expression, span.literal.text);
      }
      return true;
    }
    if (
      ts.isBinaryExpression(e) &&
      e.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      return collect(e.left) && collect(e.right);
    }
    if (ts.isParenthesizedExpression(e)) return collect(e.expression);
    if (ts.isIdentifier(e)) {
      // A message kept in a same-file string constant
      let init: ts.Expression | undefined;
      file.forEachChild(function find(node) {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === e.text &&
          node.initializer
        ) {
          init = node.initializer;
        }
        node.forEachChild(find);
      });
      return !!init && collect(init);
    }
    parts.push(e);
    return true;
  };
  if (!collect(arg)) return undefined;
  if (!parts.some((p) => typeof p === 'string' && /[a-z]{2}/i.test(p))) {
    return undefined;
  }
  const used = new Map<string, number>();
  return parts
    .map((p) => {
      if (typeof p === 'string') return p;
      const base = argName(p);
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      return `{${n > 1 ? `${base}${n}` : base}}`;
    })
    .join('');
}

/** Every literal message thrown with an HTTP-facing error class. */
function thrownMessages(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of walk(SRC)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild(function visit(node) {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        THROWN.has(node.expression.text) &&
        node.arguments?.[0]
      ) {
        const message = messageOf(node.arguments[0], source);
        if (message) {
          found.set(message, path.relative(SRC, file));
        }
      }
      node.forEachChild(visit);
    });
  }
  return found;
}

const readErrors = (lang: string) =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, lang, 'errors.json'), 'utf8'),
  ) as Record<string, string>;

describe('errors namespace', () => {
  const en = readErrors('en');

  it('has an entry for every message thrown to HTTP clients', () => {
    const matchers = errorMessageMatchers(en);
    const known = new Set(Object.values(en));
    const missing = [...thrownMessages()]
      .filter(([message]) => !known.has(message))
      .map(([message, file]) => `${file}: ${message}`);
    // A new thrown message needs an `errors` key in every language
    expect(missing).toEqual([]);
    expect(matchers.exact.size + matchers.templates.length).toBe(
      Object.keys(en).length,
    );
  });

  it.each(
    fs
      .readdirSync(__dirname, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'en')
      .map((d) => d.name),
  )('%s keeps every placeholder of the EN message', (lang) => {
    const tr = readErrors(lang);
    const names = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, message] of Object.entries(en)) {
      expect([key, names(tr[key] ?? '')]).toEqual([key, names(message)]);
    }
  });
});
