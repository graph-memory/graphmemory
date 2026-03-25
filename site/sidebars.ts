import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/index',
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/configuration',
        'getting-started/cli-reference',
        'getting-started/docker',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/graphs',
        'concepts/docs-indexing',
        'concepts/code-indexing',
        'concepts/knowledge-graph',
        'concepts/tasks',
        'concepts/skills',
        'concepts/file-index',
        'concepts/search',
        'concepts/embeddings',
        'concepts/cross-graph-links',
      ],
    },
    {
      type: 'category',
      label: 'MCP Tools',
      items: [
        'mcp-tools/index',
        'mcp-tools/context',
        'mcp-tools/docs',
        'mcp-tools/code-blocks',
        'mcp-tools/cross-graph',
        'mcp-tools/code',
        'mcp-tools/file-index',
        'mcp-tools/knowledge',
        'mcp-tools/tasks',
        'mcp-tools/skills',
        'mcp-tools/best-practices',
      ],
    },
    {
      type: 'category',
      label: 'Prompt Builder',
      items: [
        'prompt-builder/index',
        'prompt-builder/simple-builder',
        'prompt-builder/advanced-builder',
        'prompt-builder/scenarios',
        'prompt-builder/roles',
        'prompt-builder/styles',
        'prompt-builder/presets-export',
      ],
    },
    {
      type: 'category',
      label: 'Web UI',
      items: [
        'web-ui/index',
        'web-ui/dashboard-navigation',
        'web-ui/knowledge-tasks-skills',
        'web-ui/search-graph',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        'security/authentication',
        'security/access-control',
        'security/hardening',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/mcp-clients',
        'guides/multi-project',
        'guides/workspaces',
        'guides/team',
        'guides/readonly-mode',
        'guides/using-with-ai',
      ],
    },
    {
      type: 'category',
      label: 'Use Cases',
      items: [
        'use-cases/onboarding',
        'use-cases/code-review',
        'use-cases/knowledge-base',
        'use-cases/tech-debt',
        'use-cases/incident-response',
      ],
    },
    'faq',
  ],
};

export default sidebars;
