---
name: console
description: Console UI component development workflow focused on TypeScript, React hooks, and accessibility
---

# Console UI Component Development

## When to Use

Use this when building new UI components or modifying existing ones in `/console/src`. Covers component planning, implementation with React/TypeScript, testing, and linting.

## Process

### 1. Component Specification & Planning

- **Props interface:** required, optional with defaults, event handlers, children
- **Component behavior:** state management, user interactions, accessibility, responsive design
- **Styling approach:** reuse existing UI components from `/ui`, design tokens, theme patterns
- **Children components:** sub-components, shared utilities, custom hooks for complex logic

### 2. Implementation

- React functional component with TypeScript. React Hooks only (no class components)
- Prefer `useMemo`, `useCallback` where re-renders matter
- Full documentation comments on every new/modified function
- API hooks: use `use<ControllerName><FunctionName>` pattern from `queries.ts`
- **Component placement:**
  - Common: `/components/common`
  - UI primitives: `/components/ui`
  - Feature-specific: `/components/[feature-name]`
  - Page-specific: `/pages/[page-name]/components`
- **Accessibility:** proper ARIA attributes and keyboard navigation (WCAG)
- **Styling:** use existing design system and CSS variables

For complex components, first review similar existing components to ensure consistency.

### 3. Testing (Recommended)

- Create `*.test.tsx` in same directory as component
- Cover: render with required props, optional props, user interactions, conditional rendering, accessibility
- Mock external dependencies (API calls, context providers)
- Use React Testing Library

### 4. Linting

```bash
cd console && npx eslint src/components/[your-component-file].tsx
```

Zero errors, zero warnings.

### 5. Completion Summary

- What was added or changed
- Files modified
- Tests pass and lint is clean
- Status: **Ready for review**
