import { Project, Node } from 'ts-morph';

const TS_LANGUAGES = new Set([
  'ts', 'typescript',
  'js', 'javascript',
  'tsx', 'jsx',
]);

/**
 * Extract top-level symbol names from a code block using ts-morph.
 * Returns [] for non-TS/JS languages or on parse failure.
 */
export function extractSymbols(code: string, language: string): string[] {
  if (!TS_LANGUAGES.has(language.toLowerCase())) return [];

  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { allowJs: true, strict: false },
    });

    const ext = language.toLowerCase().startsWith('ts') || language.toLowerCase() === 'tsx'
      ? '.tsx'
      : '.jsx';
    const sourceFile = project.createSourceFile(`__snippet${ext}`, code);

    const symbols: string[] = [];

    for (const stmt of sourceFile.getStatements()) {
      if (Node.isFunctionDeclaration(stmt)) {
        const name = stmt.getName();
        if (name) symbols.push(name);
      } else if (Node.isClassDeclaration(stmt)) {
        const name = stmt.getName();
        if (name) symbols.push(name);
      } else if (Node.isInterfaceDeclaration(stmt)) {
        symbols.push(stmt.getName());
      } else if (Node.isTypeAliasDeclaration(stmt)) {
        symbols.push(stmt.getName());
      } else if (Node.isEnumDeclaration(stmt)) {
        symbols.push(stmt.getName());
      } else if (Node.isVariableStatement(stmt)) {
        for (const decl of stmt.getDeclarations()) {
          const name = decl.getName();
          if (typeof name === 'string') symbols.push(name);
        }
      } else if (Node.isExportAssignment(stmt)) {
        // export default ... — skip, no named symbol
      } else if (Node.isExpressionStatement(stmt)) {
        // e.g. `app.use(...)` — skip
      }
    }

    return symbols;
  } catch {
    return [];
  }
}
