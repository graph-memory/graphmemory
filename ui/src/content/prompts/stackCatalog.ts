// Stack catalog: 9 domains, each with categories of options

export interface StackCategory {
  key: string;
  label: string;
  options: string[];
}

export interface StackDomainDef {
  id: string;
  label: string;
  categories: StackCategory[];
}

export const STACK_DOMAINS: StackDomainDef[] = [
  {
    id: 'languages',
    label: 'Languages & Runtimes',
    categories: [
      {
        key: 'languages',
        label: 'Languages',
        options: [
          'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'Kotlin',
          'C#', 'C++', 'C', 'Ruby', 'PHP', 'Swift', 'Dart', 'Scala', 'Elixir',
          'Clojure', 'Haskell', 'Zig', 'R', 'Shell/Bash', 'Lua',
        ],
      },
      {
        key: 'runtimes',
        label: 'Runtimes',
        options: [
          'Node.js', 'Deno', 'Bun', 'JVM', '.NET/CLR', 'CPython', 'PyPy',
          'GraalVM', 'BEAM (Erlang VM)',
        ],
      },
      {
        key: 'packageManagers',
        label: 'Package Managers',
        options: [
          'npm', 'yarn', 'pnpm', 'bun', 'pip', 'poetry', 'uv', 'conda',
          'cargo', 'go modules', 'Maven', 'Gradle', 'Composer', 'Bundler',
          'NuGet', 'CocoaPods', 'pub', 'Hex',
        ],
      },
    ],
  },
  {
    id: 'frontend',
    label: 'Web Frontend',
    categories: [
      {
        key: 'frameworks',
        label: 'Frameworks',
        options: [
          'React', 'Next.js', 'Vue', 'Nuxt', 'Svelte', 'SvelteKit', 'Angular',
          'Astro', 'Solid', 'Qwik', 'Remix', 'Gatsby', 'Eleventy', 'Hugo',
        ],
      },
      {
        key: 'stateManagement',
        label: 'State Management',
        options: [
          'Redux', 'Zustand', 'MobX', 'Jotai', 'Recoil', 'Pinia', 'XState',
          'TanStack Query', 'SWR', 'Apollo Client', 'Vuex',
        ],
      },
      {
        key: 'styling',
        label: 'Styling',
        options: [
          'Tailwind CSS', 'CSS Modules', 'Styled Components', 'Emotion',
          'Sass/SCSS', 'Less', 'Vanilla Extract', 'UnoCSS', 'Panda CSS', 'PostCSS',
        ],
      },
      {
        key: 'uiLibraries',
        label: 'UI Libraries',
        options: [
          'MUI', 'Ant Design', 'Chakra UI', 'Radix', 'shadcn/ui', 'Headless UI',
          'Mantine', 'DaisyUI', 'Bootstrap', 'Vuetify', 'PrimeVue', 'Element Plus',
        ],
      },
      {
        key: 'buildTools',
        label: 'Build Tools',
        options: [
          'Vite', 'Webpack', 'esbuild', 'Rollup', 'Turbopack', 'Parcel',
          'SWC', 'Rolldown', 'tsup', 'Rspack',
        ],
      },
    ],
  },
  {
    id: 'backend',
    label: 'Web Backend',
    categories: [
      {
        key: 'jsTs',
        label: 'JS/TS',
        options: ['Express', 'Fastify', 'Nest.js', 'Hono', 'Koa', 'tRPC', 'AdonisJS', 'Elysia'],
      },
      {
        key: 'python',
        label: 'Python',
        options: ['Django', 'Flask', 'FastAPI', 'Starlette', 'Litestar', 'Tornado', 'Sanic'],
      },
      {
        key: 'go',
        label: 'Go',
        options: ['Gin', 'Echo', 'Fiber', 'Chi', 'net/http', 'Gorilla Mux'],
      },
      {
        key: 'rust',
        label: 'Rust',
        options: ['Actix Web', 'Axum', 'Rocket', 'Warp'],
      },
      {
        key: 'javaKotlin',
        label: 'Java/Kotlin',
        options: ['Spring Boot', 'Quarkus', 'Micronaut', 'Ktor', 'Vert.x', 'Javalin'],
      },
      {
        key: 'php',
        label: 'PHP',
        options: ['Laravel', 'Symfony', 'Slim', 'CodeIgniter', 'Laminas'],
      },
      {
        key: 'ruby',
        label: 'Ruby',
        options: ['Rails', 'Sinatra', 'Hanami'],
      },
      {
        key: 'dotnet',
        label: 'C#/.NET',
        options: ['ASP.NET Core', 'Minimal API', 'Blazor'],
      },
      {
        key: 'elixir',
        label: 'Elixir',
        options: ['Phoenix', 'Plug'],
      },
      {
        key: 'apiStyle',
        label: 'API Style',
        options: ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'tRPC', 'OpenAPI/Swagger'],
      },
    ],
  },
  {
    id: 'mobile',
    label: 'Mobile & Desktop',
    categories: [
      {
        key: 'ios',
        label: 'iOS',
        options: ['Swift', 'SwiftUI', 'UIKit', 'Objective-C'],
      },
      {
        key: 'android',
        label: 'Android',
        options: ['Kotlin', 'Jetpack Compose', 'Android XML', 'Java'],
      },
      {
        key: 'crossPlatform',
        label: 'Cross-platform',
        options: ['React Native', 'Flutter', 'Expo', 'Ionic', 'Capacitor', 'MAUI', 'Kotlin Multiplatform'],
      },
      {
        key: 'desktop',
        label: 'Desktop',
        options: ['Electron', 'Tauri', 'Qt', 'GTK', 'WPF', 'WinForms', 'SwiftUI (macOS)', 'JavaFX'],
      },
    ],
  },
  {
    id: 'data',
    label: 'Data & Storage',
    categories: [
      {
        key: 'relational',
        label: 'Relational',
        options: ['PostgreSQL', 'MySQL', 'MariaDB', 'SQLite', 'SQL Server', 'Oracle', 'CockroachDB', 'PlanetScale'],
      },
      {
        key: 'document',
        label: 'Document',
        options: ['MongoDB', 'DynamoDB', 'Firestore', 'CouchDB', 'FaunaDB', 'SurrealDB'],
      },
      {
        key: 'cache',
        label: 'Key-Value / Cache',
        options: ['Redis', 'Memcached', 'Valkey', 'KeyDB', 'DragonflyDB'],
      },
      {
        key: 'search',
        label: 'Search',
        options: ['Elasticsearch', 'OpenSearch', 'Meilisearch', 'Typesense', 'Algolia'],
      },
      {
        key: 'graph',
        label: 'Graph',
        options: ['Neo4j', 'ArangoDB', 'DGraph', 'TigerGraph'],
      },
      {
        key: 'timeSeries',
        label: 'Time-series',
        options: ['InfluxDB', 'TimescaleDB', 'QuestDB'],
      },
      {
        key: 'vector',
        label: 'Vector',
        options: ['Pinecone', 'Weaviate', 'Qdrant', 'Milvus', 'Chroma', 'pgvector'],
      },
      {
        key: 'orm',
        label: 'ORM / Query Builder',
        options: [
          'Prisma', 'Drizzle', 'TypeORM', 'Sequelize', 'Knex', 'SQLAlchemy',
          'Django ORM', 'GORM', 'Diesel', 'Sea-ORM', 'Entity Framework',
          'Hibernate', 'ActiveRecord', 'Eloquent', 'Exposed',
        ],
      },
      {
        key: 'messageQueue',
        label: 'Message Queue',
        options: ['Kafka', 'RabbitMQ', 'NATS', 'Redis Pub/Sub', 'SQS', 'Pulsar', 'BullMQ'],
      },
    ],
  },
  {
    id: 'devops',
    label: 'DevOps & Infrastructure',
    categories: [
      {
        key: 'ciCd',
        label: 'CI/CD',
        options: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'CircleCI', 'Argo CD', 'Buildkite', 'Drone', 'Travis CI'],
      },
      {
        key: 'containers',
        label: 'Containers',
        options: ['Docker', 'Podman', 'containerd', 'Docker Compose', 'Buildah'],
      },
      {
        key: 'orchestration',
        label: 'Orchestration',
        options: ['Kubernetes', 'Docker Swarm', 'Nomad', 'ECS', 'Cloud Run'],
      },
      {
        key: 'iac',
        label: 'IaC',
        options: ['Terraform', 'Pulumi', 'CloudFormation', 'CDK', 'Ansible', 'Crossplane'],
      },
      {
        key: 'cloud',
        label: 'Cloud',
        options: [
          'AWS', 'GCP', 'Azure', 'DigitalOcean', 'Vercel', 'Netlify',
          'Cloudflare', 'Fly.io', 'Railway', 'Render', 'Hetzner',
        ],
      },
      {
        key: 'monitoring',
        label: 'Monitoring',
        options: [
          'Prometheus', 'Grafana', 'Datadog', 'New Relic', 'Sentry',
          'OpenTelemetry', 'Jaeger', 'PagerDuty', 'Honeycomb',
        ],
      },
      {
        key: 'secrets',
        label: 'Secrets',
        options: ['Vault', 'AWS Secrets Manager', 'Doppler', 'SOPS', '1Password CLI'],
      },
    ],
  },
  {
    id: 'testing',
    label: 'Testing & Quality',
    categories: [
      {
        key: 'unitIntegration',
        label: 'Unit / Integration',
        options: ['Jest', 'Vitest', 'pytest', 'Go testing', 'JUnit', 'xUnit', 'PHPUnit', 'RSpec', 'Mocha', 'Minitest'],
      },
      {
        key: 'e2e',
        label: 'E2E',
        options: ['Playwright', 'Cypress', 'Selenium', 'Puppeteer', 'WebdriverIO'],
      },
      {
        key: 'apiTesting',
        label: 'API Testing',
        options: ['Postman', 'Bruno', 'Insomnia', 'Hurl', 'k6', 'Artillery'],
      },
      {
        key: 'linting',
        label: 'Linting / Formatting',
        options: [
          'ESLint', 'Biome', 'Prettier', 'Ruff', 'Black', 'golangci-lint',
          'Clippy', 'RuboCop', 'PHPStan', 'mypy', 'pyright', 'Pylint', 'Checkstyle',
        ],
      },
      {
        key: 'codeQuality',
        label: 'Code Quality',
        options: ['SonarQube', 'CodeClimate', 'Codecov', 'Coveralls'],
      },
      {
        key: 'loadTesting',
        label: 'Load Testing',
        options: ['k6', 'Locust', 'JMeter', 'Gatling', 'Artillery'],
      },
      {
        key: 'paradigms',
        label: 'Paradigms',
        options: ['TDD', 'BDD', 'Contract Testing', 'Mutation Testing', 'Property Testing', 'Snapshot Testing'],
      },
    ],
  },
  {
    id: 'aiMl',
    label: 'AI & ML',
    categories: [
      {
        key: 'frameworks',
        label: 'Frameworks',
        options: ['PyTorch', 'TensorFlow', 'JAX', 'scikit-learn', 'Keras', 'Hugging Face Transformers', 'spaCy'],
      },
      {
        key: 'llm',
        label: 'LLM / GenAI',
        options: ['OpenAI API', 'Anthropic API', 'LangChain', 'LlamaIndex', 'Ollama', 'vLLM', 'Vercel AI SDK', 'Semantic Kernel'],
      },
      {
        key: 'dataProcessing',
        label: 'Data Processing',
        options: ['pandas', 'NumPy', 'SciPy', 'Polars', 'Dask', 'Apache Spark', 'Apache Beam'],
      },
      {
        key: 'mlops',
        label: 'MLOps',
        options: ['MLflow', 'Weights & Biases', 'DVC', 'Kubeflow', 'BentoML', 'Ray'],
      },
      {
        key: 'notebooks',
        label: 'Notebooks',
        options: ['Jupyter', 'Google Colab', 'Observable'],
      },
      {
        key: 'embeddings',
        label: 'Embeddings / Vector',
        options: ['sentence-transformers', 'OpenAI Embeddings', 'Cohere', 'FAISS'],
      },
    ],
  },
  {
    id: 'project',
    label: 'Project & Process',
    categories: [
      {
        key: 'methodology',
        label: 'Methodology',
        options: ['Agile', 'Scrum', 'Kanban', 'SAFe', 'XP', 'Shape Up'],
      },
      {
        key: 'tracker',
        label: 'Tracker',
        options: ['Jira', 'Linear', 'GitHub Projects', 'Asana', 'Trello', 'ClickUp', 'Shortcut', 'Notion'],
      },
      {
        key: 'documentation',
        label: 'Documentation',
        options: ['Confluence', 'Notion', 'GitBook', 'Docusaurus', 'ReadTheDocs', 'Mintlify', 'Storybook'],
      },
      {
        key: 'communication',
        label: 'Communication',
        options: ['Slack', 'Discord', 'Teams', 'Zulip'],
      },
      {
        key: 'design',
        label: 'Design',
        options: ['Figma', 'Sketch', 'Adobe XD', 'Storybook', 'Zeplin'],
      },
      {
        key: 'vcs',
        label: 'Version Control',
        options: ['Git', 'GitHub', 'GitLab', 'Bitbucket', 'Gitea'],
      },
    ],
  },
];
