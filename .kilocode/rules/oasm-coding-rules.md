# Project Coding Rules (Mandatory)

## General Conventions

- Always follow existing project conventions (naming, structure, imports, patterns).
- Do not change unrelated code or formatting.
- Keep consistency with surrounding code.
- Do not use `any` in production code.

## ESLint (Strict)

- All code must pass ESLint with **no warnings or errors**.
- Do not disable ESLint rules unless explicitly allowed.
- No global or unjustified `eslint-disable`.

## Security & Sensitive Files

- Never read, reference, or infer from sensitive files:
  - `.env`, secrets, tokens, credentials
  - Private keys (`*.pem`, `*.key`)
  - `.git`, `node_modules`, `.husky`
  - CI/CD files containing secrets
  - Production data or logs

## Code Scope

- Generate code only within the requested scope.
- Do not create extra files or modify unrelated modules.
- Prefer reusing existing services, hooks, and utilities.

## Testing

- New logic or functions must include corresponding tests.
- Do not alter tests just to make them pass.

## Error Handling & Logging

- No `console.log`.
- Use the project’s standard logger if available.
- Throw meaningful error objects, not strings.

---

## Vite + React Rules (/console)

- Use **functional components** and **React Hooks only**.
- Follow existing state management and data-fetching patterns.
- Prefer `useMemo`, `useCallback` where re-renders matter.
- Do not introduce new libraries without permission.
- Use existing UI components and design system.
- Avoid inline styles unless already used in the project.
- Ensure TypeScript types are explicit and accurate.
- Keep components small and focused (single responsibility).

---

## Final Checklist

- Convention compliant
- ESLint clean
- No sensitive files accessed
- Scope respected
- Logic unchanged except where required
