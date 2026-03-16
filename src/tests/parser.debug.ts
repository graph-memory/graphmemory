// npx tsx src/tests/parser.test.ts
import { parseFile } from '@/lib/parsers/docs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchDir = path.resolve(__dirname, '../..');

const sample = `# Auth Guide

Intro text here. See also [API](./api.md) and [[deployment]].
External links: [Google](https://google.com) [FTP](ftp://files.example.com) [CDN](//cdn.example.com)

## Overview

JWT-based authentication. Links to [setup](../setup.md).

## Token Flow

Access token + refresh token rotation.

### Subsection

This is level 3 — should NOT be a chunk with depth=2.

## Error Handling

Common errors and codes.
`;

const chunks = parseFile(sample, path.join(watchDir, 'docs/auth.md'), watchDir, 2);

for (const chunk of chunks) {
  console.log('---');
  console.log('id:     ', chunk.id);
  console.log('title:  ', chunk.title);
  console.log('level:  ', chunk.level);
  console.log('links:  ', chunk.links);
  console.log('content:', chunk.content.slice(0, 80).replace(/\n/g, '↵'));
}

console.log('\nTotal chunks:', chunks.length);
