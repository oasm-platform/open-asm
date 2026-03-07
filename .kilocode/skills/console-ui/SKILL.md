---
name: console-ui
description: Develop React components and UI features for the console frontend with TypeScript, accessibility, and proper API integration. Use when creating or modifying UI components in the console directory. Focus on component architecture, API integration patterns, accessibility, and performance optimization.
---

# Console UI Component Development

Working on the console frontend is all about creating components that feel native to the existing system while maintaining accessibility and performance. The key is understanding that you're not just building isolated pieces - you're extending a cohesive design language.

## Component Architecture Philosophy

The component organization here reflects a mature understanding of React architecture. Common components serve as the foundation, UI primitives provide the building blocks, and feature-specific components handle domain logic. The page-specific component pattern is particularly smart - it keeps complex page logic isolated without polluting the shared component space.

TypeScript integration isn't just about type safety; it's about creating self-documenting components. When you define your props interface upfront, you're essentially creating the component's contract with the rest of the system. This becomes crucial as the codebase scales and more developers interact with your components.

## API Integration Patterns

The hook naming convention `use<ControllerName><FunctionName>` is brilliant because it creates a predictable mapping between backend APIs and frontend consumption. Instead of hunting through large query files, you can anticipate what hooks exist based on the backend structure. This kind of consistency makes the frontend feel like an extension of the backend rather than a separate concern.

## Accessibility as First-Class Concern

The accessibility rule isn't compliance checkbox - it's about creating interfaces that work for everyone. Proper ARIA attributes and keyboard navigation aren't afterthoughts; they're integral to how users will interact with your components. This becomes especially important in admin/console interfaces where users spend significant time navigating complex workflows.

## Performance Through Memoization

The guidance around `useMemo` and `useCallback` reflects real-world React performance considerations. These aren't theoretical optimizations - they address the specific re-render patterns that emerge when building complex UIs with frequent state changes. Understanding when to apply these hooks comes from experience with the component lifecycle.

## Testing Strategy

Component testing here serves multiple purposes beyond bug prevention. The focus on user interactions and accessibility features ensures that components work as users expect, not just as developers intend. Mocking external dependencies keeps tests fast and reliable while isolating the component's specific responsibilities.

## Design System Integration

The emphasis on reusing existing UI components and design tokens isn't about creative limitation - it's about creating a consistent user experience. When components feel familiar across the interface, users can focus on their tasks rather than learning new interaction patterns. The styling rule ensures visual consistency while maintaining the flexibility to adapt to new requirements.

## Step-by-Step Workflow

### 1. Component Specification & Planning

**Identify props interface:**
- Required props
- Optional props with defaults
- Event handlers
- Children support (if needed)

**Define component behavior:**
- State management
- User interactions
- Accessibility considerations
- Responsive behavior

**Determine styling approach:**
- Reuse existing UI components from `/ui`
- Apply consistent design tokens
- Follow existing theme patterns

**Plan children components (if needed):**
- Sub-components in same directory
- Shared utility functions
- Custom hooks for complex logic

### 2. Implementation (Component Development)

**Mandatory**: Create or update a **React functional component** with TypeScript:
- Use React Hooks only (no class components)
- Follow existing state management patterns
- Prefer `useMemo`, `useCallback` where re-renders matter

**The Component must follow:**
- Strict TypeScript typing
- MUST have full documentation comments above every new or modified function
- Proper prop validation
- Clean, readable code structure
- Follow existing naming conventions
- Use appropriate hook functions from `console/src/services/apis/gen/queries.ts` for API calls following the naming convention `use<ControllerName><FunctionName>`, where the controller name and function name are derived from the backend API endpoints. **Note**: Do not read the entire `queries.ts` file as it is very long; instead, search for the specific hook function using the naming pattern `use<ControllerName><FunctionName>`.

**Important**: All new components should be placed in appropriate subdirectories under `/console/src/components`:
- Common components: `/components/common`
- UI primitives: `/components/ui`
- Feature-specific: `/components/[feature-name]`
- Reusable: `/components/common`
- Page-specific components (only used by a single page): `/pages/[page-name]/components`

**Implement only what is required** for the component functionality.

**Follow project architecture and naming conventions.**

**Use strict typing and functional programming patterns.**

**Add English comments only for non-obvious logic.**

**Component Composition Rule**: If creating a complex component, **first review existing similar components** in the codebase to ensure consistency with design patterns and reusable elements.

**Accessibility Rule**: **Always** implement proper ARIA attributes and keyboard navigation support, following WCAG guidelines.

**Styling Rule**: Use existing design system components and CSS variables from `/components/ui/styles.css` and theme provider.

### 3. Test-Driven Development (Component Tests)

**After the component is implemented, tests are recommended:**
- Create test file in same directory as component (`*.test.tsx`)

**Tests should cover:**
- Render with required props ’ success case
- Render with optional props
- User interactions (clicks, form inputs, etc.)
- Conditional rendering
- Accessibility features

**Mock all external dependencies** (API calls, complex context providers).

**Testing Library Rule**: Use React Testing Library for DOM-based tests, ensuring components behave as users expect.

### 4. Linting

- Ensure the code passes ESLint with **zero errors and zero warnings**
- Run ESLint on the component files:

```bash
cd console && npx eslint src/components/[your-component-file].tsx
```

- Fix all lint issues before proceeding

### 5. Completion Summary

Provide a short summary including:
- **What was added or changed**
- **Files modified**
- Confirmation that **tests pass** and **lint is clean**
- Status: **Ready for review**

## Common Commands

```bash
# Run ESLint on component files
cd console && npx eslint src/components/[your-component-file].tsx

# Run tests
cd console && npm run test

# Run specific test file
cd console && npm run test -- <path-to-test-file>
```

## Resources

- UI Components: `src/components/ui/*`
- Common Components: `src/components/common/*`
- Design System: `src/components/ui/styles.css`
- Theme Provider: `src/components/ui/theme-provider.tsx`
- Utility Functions: `src/lib/utils.ts`
- API Hooks: `src/services/apis/gen/queries.ts`