import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Graph Memory',
  tagline: 'Semantic graph memory for AI-powered development',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://graphmemory.dev',
  baseUrl: '/',
  trailingSlash: false,

  organizationName: 'graph-memory',
  projectName: 'graphmemory',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  headTags: [
    {
      tagName: 'link',
      attributes: {rel: 'icon', type: 'image/png', sizes: '32x32', href: '/img/favicon-32x32.png'},
    },
    {
      tagName: 'link',
      attributes: {rel: 'icon', type: 'image/png', sizes: '16x16', href: '/img/favicon-16x16.png'},
    },
    {
      tagName: 'link',
      attributes: {rel: 'apple-touch-icon', sizes: '180x180', href: '/img/apple-touch-icon.png'},
    },
    {
      tagName: 'link',
      attributes: {rel: 'manifest', href: '/site.webmanifest'},
    },
    {
      tagName: 'link',
      attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    },
    {
      tagName: 'link',
      attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'},
    },
    {
      tagName: 'link',
      attributes: {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'},
    },
    {
      tagName: 'script',
      attributes: {type: 'application/ld+json'},
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Graph Memory',
        description: 'MCP server that builds semantic graph memory from project directories',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Cross-platform',
        url: 'https://graphmemory.dev',
        downloadUrl: 'https://www.npmjs.com/package/@graphmemory/server',
        softwareVersion: '1.8.2',
        author: {
          '@type': 'Organization',
          name: 'Graph Memory',
          url: 'https://github.com/graph-memory',
        },
        license: 'https://www.elastic.co/licensing/elastic-license',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      }),
    },
  ],

  presets: [
    [
      'classic',
      {
        gtag: {
          trackingID: 'G-8DM7KRKR58',
          anonymizeIP: true,
        },
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/graph-memory/graphmemory/tree/main/site/',
        },
        blog: {
          showReadingTime: true,
          blogSidebarTitle: 'Recent posts',
          blogSidebarCount: 10,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly' as const,
          priority: 0.5,
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.jpg',
    metadata: [
      {name: 'keywords', content: 'MCP, graph memory, semantic search, knowledge graph, AI tools, Model Context Protocol, code indexing'},
      {name: 'twitter:card', content: 'summary_large_image'},
    ],
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Graph Memory',
      logo: {
        alt: 'Graph Memory Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/mcp-tools',
          label: 'MCP Tools',
          position: 'left',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {to: '/changelog', label: 'Changelog', position: 'left'},
        {
          href: 'https://github.com/graph-memory/graphmemory',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Getting Started', to: '/docs/getting-started'},
            {label: 'MCP Tools', to: '/docs/mcp-tools'},
            {label: 'Prompt Builder', to: '/docs/prompt-builder'},
          ],
        },
        {
          title: 'Community',
          items: [
            {label: 'GitHub', href: 'https://github.com/graph-memory/graphmemory'},
            {label: 'Issues', href: 'https://github.com/graph-memory/graphmemory/issues'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'Blog', to: '/blog'},
            {label: 'Changelog', to: '/changelog'},
            {label: 'npm', href: 'https://www.npmjs.com/package/@graphmemory/server'},
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Graph Memory. Elastic License 2.0.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'typescript'],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
