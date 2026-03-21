# Links Test

Intro with markdown links: [API docs](api.md) and [auth guide](auth.md).

External links that should be ignored:
- [Google](https://google.com)
- [FTP](ftp://files.example.com/data)
- [CDN](//cdn.example.com/lib.js)
- [Email](mailto:test@example.com)
- [Data](data:text/plain;base64,SGVsbG8=)

## Wiki Links

See [[api]] for reference. Also check [[auth|authentication guide]].
Link to non-existent: [[ghost]].

## Links In Code

```typescript
// This link should NOT be extracted: [fake](fake.md)
const url = "https://example.com";
```

A real link after the code block: [auth](auth.md).

## Relative Links

Link without extension: [setup](api).
Link to parent dir: [root](../nonexistent.md).
