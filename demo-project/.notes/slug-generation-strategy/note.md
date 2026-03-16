---
id: slug-generation-strategy
tags:
  - convention
  - naming
createdAt: 2026-03-16T20:40:54.739Z
updatedAt: 2026-03-16T20:40:54.739Z
---

# Slug Generation Strategy

Project slugs are auto-generated from names using lowercase + hyphen normalization. Duplicate slugs are rejected at creation time. We considered auto-appending numbers (my-project-2) but decided explicit naming is clearer. Task IDs use UUIDs, not slugs, since task titles change frequently.
