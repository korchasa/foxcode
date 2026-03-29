# Rule Examples by Category

## Coding Standards

### Error Handling (TypeScript, Cursor)

```markdown
---
description: TypeScript error handling standards
globs: "**/*.ts"
alwaysApply: false
---

# Error Handling

Always use typed errors with context:

\`\`\`typescript
// BAD
try {
  await fetchData();
} catch (e) {}

// GOOD
try {
  await fetchData();
} catch (e) {
  logger.error('Failed to fetch', { error: e });
  throw new DataFetchError('Unable to retrieve data', { cause: e });
}
\`\`\`
```

### Import Order (TypeScript, Cursor)

```markdown
---
description: Import ordering conventions
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Import Order

1. Node built-ins (`node:fs`, `node:path`)
2. External packages (`react`, `express`)
3. Internal aliases (`@/lib`, `@/components`)
4. Relative imports (`./utils`, `../types`)

Separate groups with blank line. Alphabetize within groups.
```

## Architecture

### Layer Boundaries (Always Apply, Cursor)

```markdown
---
description: Architecture layer boundaries
alwaysApply: true
---

# Layer Boundaries

- `src/domain/` - pure business logic, no framework imports
- `src/api/` - thin handlers, delegate to domain
- `src/infra/` - database, external services
- Never import from `api/` or `infra/` in `domain/`
```

## Framework Patterns

### React Components (Cursor)

```markdown
---
description: React component patterns and conventions
globs: "**/*.tsx"
alwaysApply: false
---

# React Components

- Functional components only
- Props interface: `{ComponentName}Props`
- Extract hooks for reusable logic
- Colocate styles: `Component.module.css`
- No `any` in props
```

## Testing

### Test Structure (Cursor)

```markdown
---
description: Test file conventions
globs: "**/*.test.{ts,tsx}"
alwaysApply: false
---

# Test Conventions

- Describe block = module/component name
- It block = behavior description
- Arrange-Act-Assert pattern
- No test interdependencies
- Mock external services, not internal modules
```

## Claude Code Examples

### TypeScript Standards (.claude/rules/typescript.md)

```markdown
---
description: TypeScript coding standards
paths: src/**/*.ts
---

# TypeScript Standards

- Strict mode enabled
- No `any` - use `unknown` + type guards
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties
```

