---
id: validation-approach
tags:
  - validation
  - design-decision
createdAt: 2026-03-16T20:40:54.758Z
updatedAt: 2026-03-16T20:40:54.758Z
---

# Validation Approach

We built lightweight composable validators instead of using Zod or Joi. Each validator is a function returning {valid, errors}. They compose via validate(value, ...validators). This keeps the bundle small and validators are trivially testable. For complex schemas (API input), we may add Zod later.
