---
description: "Console UI component development workflow focused on TypeScript, React hooks, and accessibility"
---

## 🎨 Console UI Component Development Workflow (AI IDE)

> Role: You are a **senior frontend engineer** working on this codebase.
> Requirement: Follow **exactly** the workflow below when implementing any new UI component in the `/console` directory.
> Folder: `/console/src`

---

### 1. Component Specification & Planning

- Identify **props interface**
  - Required props
  - Optional props with defaults
  - Event handlers
  - Children support (if needed)

- Define **component behavior**
  - State management
  - User interactions
  - Accessibility considerations
  - Responsive behavior

- Determine **styling approach**
  - Reuse existing UI components from `/ui`
  - Apply consistent design tokens
  - Follow existing theme patterns

- Plan **children components** (if needed)
  - Sub-components in same directory
  - Shared utility functions
  - Custom hooks for complex logic

---

### 2. Implementation (Component Development)

- **Mandatory**: Create or update a **React functional component** with TypeScript.
  - Use React Hooks only (no class components)
  - Follow existing state management patterns
  - Prefer `useMemo`, `useCallback` where re-renders matter

- The **Component must follow**:
  - Strict TypeScript typing
  - MUST have full documentation comments above every new or modified function
  - Proper prop validation
  - Clean, readable code structure
  - Follow existing naming conventions
  - Use appropriate hook functions from `console/src/services/apis/gen/queries.ts` for API calls following the naming convention `use<ControllerName><FunctionName>`, where the controller name and function name are derived from the backend API endpoints. **Note**: Do not read the entire `queries.ts` file as it is very long; instead, search for the specific hook function using the naming pattern `use<ControllerName><FunctionName>`.

- **Important**: All new components should be placed in appropriate subdirectories under `/console/src/components`:
  - Common components: `/components/common`
  - UI primitives: `/components/ui`
  - Feature-specific: `/components/[feature-name]`
  - Reusable: `/components/common`
  - Page-specific components (only used by a single page): `/pages/[page-name]/components`

- Implement **only what is required** for the component functionality.

- Follow project architecture and naming conventions.

- Use strict typing and functional programming patterns.

- Add **English comments only for non-obvious logic**.

- **Component Composition Rule**: If creating a complex component, **first review existing similar components** in the codebase to ensure consistency with design patterns and reusable elements.

- **Accessibility Rule**: **Always** implement proper ARIA attributes and keyboard navigation support, following WCAG guidelines.

- **Styling Rule**: Use existing design system components and CSS variables from `/components/ui/styles.css` and theme provider.

---

### 3. Test-Driven Development (Component Tests)

- After the component is implemented, **tests are recommended**.
  - Create test file in same directory as component (`*.test.tsx`)

- Tests should cover:
  - Render with required props → success case
  - Render with optional props
  - User interactions (clicks, form inputs, etc.)
  - Conditional rendering
  - Accessibility features

- **Mock all external dependencies** (API calls, complex context providers).

- **Testing Library Rule**: Use React Testing Library for DOM-based tests, ensuring components behave as users expect.

---

### 4. Linting

- Ensure the code passes ESLint with **zero errors and zero warnings**.
- Run ESLint on the component files:

```bash
cd console && npx eslint src/components/[your-component-file].tsx
```

- Fix all lint issues before proceeding.

### 5. Completion Summary

Provide a short summary including:

- **What was added or changed**
- **Files modified**
- Confirmation that **tests pass** and **lint is clean**
- Status: **Ready for review**

---

## Resources

- UI Components: `src/components/ui/*`
- Common Components: `src/components/common/*`
- Design System: `src/components/ui/styles.css`
- Theme Provider: `src/components/ui/theme-provider.tsx`
- Utility Functions: `src/lib/utils.ts`