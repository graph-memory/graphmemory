---
title: "Code Review"
sidebar_label: "Code Review"
sidebar_position: 2
description: "Use Graph Memory to review PRs with full project context — find related symbols, check documentation, and look up past decisions."
keywords: [code review, PR, pull request, cross-references, symbols, context, documentation]
---

# Code Review

**Scenario:** You are reviewing a pull request and need full project context to evaluate the changes.

## The Problem

Code reviews often lack context. You see the diff but not the bigger picture — which other code depends on the changed function, what the documentation says about the expected behavior, or whether there was a past decision about this component.

## The Workflow

### 1. Search for Related Symbols

When reviewing changes to a function, find all related code:

```
search_code({ query: "validateUserToken" })
get_symbol({ symbolId: "src/auth/token.ts::validateUserToken" })
```

See the full definition, including the function body, to understand what it does today.

### 2. Check Cross-References

Bridge the gap between code and documentation:

```
cross_references({ symbol: "validateUserToken" })
```

This returns the code definition, any documentation examples that mention the symbol, and surrounding explanations. If the docs describe a contract that the PR violates, you will see it here.

### 3. Look Up Related Knowledge

Check if there are notes about design decisions related to the changed code:

```
search_notes({ query: "token validation" })
search_notes({ query: "authentication" })
```

Past decisions often explain constraints that are not obvious from the code alone.

### 4. Find Linked Tasks

See if there are tasks connected to the modified code:

```
find_linked_tasks({ targetId: "src/auth/token.ts", targetGraph: "code" })
```

This reveals whether the change is part of a tracked effort, or whether it touches code with open issues.

### 5. Search Documentation

Check what the docs say about the feature area:

```
search({ query: "token validation flow" })
search({ query: "authentication error handling" })
```

### 6. Explore Examples

Find code examples in the documentation that demonstrate the expected usage:

```
find_examples({ symbol: "validateUserToken" })
explain_symbol({ symbol: "validateUserToken" })
```

If the PR changes the function signature, examples may need updating too.

## Key Tools

| Tool | Purpose in code review |
|------|----------------------|
| `search_code` | Find code related to the PR changes |
| `get_symbol` | Read the full source of a specific symbol |
| `cross_references` | Get code + docs + explanations in one call |
| `search_notes` | Find past decisions about the changed area |
| `find_linked_tasks` | See tasks connected to the modified files |
| `search` | Find relevant documentation sections |
| `find_examples` | Find doc code examples using the changed symbols |

## Tips

- Start with `cross_references` to get the full picture before diving into specifics.
- Check `search_notes` for architecture decisions — they often explain non-obvious constraints.
- Use `find_linked_tasks` to see if the change relates to tracked work items or known issues.
