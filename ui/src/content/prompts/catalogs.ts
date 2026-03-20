// JS/TS ecosystem catalogs for TechStackTab

export const LANGUAGES = ['TypeScript', 'JavaScript'] as const;

export const RUNTIMES = ['Node.js', 'Deno', 'Bun'] as const;

export const FRAMEWORKS = {
  frontend: ['React', 'Next.js', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'SvelteKit', 'Astro', 'Remix', 'Solid'],
  backend: ['Express', 'Fastify', 'NestJS', 'Hono', 'tRPC', 'Koa', 'Hapi', 'Adonis'],
  mobile: ['React Native', 'Expo', 'Capacitor', 'Ionic'],
  testing: ['Jest', 'Vitest', 'Playwright', 'Cypress', 'Testing Library', 'Mocha', 'Supertest', 'MSW'],
  bundler: ['Vite', 'Webpack', 'esbuild', 'SWC', 'Turbopack', 'tsup', 'Rollup', 'Rolldown'],
  orm: ['Prisma', 'Drizzle', 'TypeORM', 'Mongoose', 'Knex', 'Sequelize', 'Kysely', 'MikroORM'],
  stateManagement: ['Redux', 'Zustand', 'MobX', 'Jotai', 'Recoil', 'Pinia', 'XState', 'Valtio', 'Signals'],
  styling: ['MUI', 'Tailwind', 'Styled-components', 'Chakra UI', 'Ant Design', 'shadcn/ui', 'Mantine', 'Emotion'],
} as const;

export const PARADIGMS = ['OOP', 'FP', 'DDD', 'Event-Driven', 'Hexagonal', 'CQRS', 'Microservices', 'Monolith'] as const;

export const TESTING_APPROACHES = ['TDD', 'BDD', 'E2E-first', 'Integration-first', 'Property-based', 'Snapshot'] as const;

export const PACKAGE_MANAGERS = ['npm', 'yarn', 'pnpm', 'bun'] as const;

export const FRAMEWORK_GROUPS = [
  { key: 'frontend' as const, label: 'Frontend' },
  { key: 'backend' as const, label: 'Backend' },
  { key: 'mobile' as const, label: 'Mobile' },
  { key: 'testing' as const, label: 'Testing' },
  { key: 'bundler' as const, label: 'Bundler / Tooling' },
  { key: 'orm' as const, label: 'ORM / Database' },
  { key: 'stateManagement' as const, label: 'State Management' },
  { key: 'styling' as const, label: 'Styling / UI' },
] as const;
