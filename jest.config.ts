import type { Config } from 'jest';

// Silence pino logs during tests
process.env.LOG_LEVEL = 'silent';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', 'embedder\\.test\\.ts$', 'search-quality\\.test\\.ts$'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@huggingface/transformers$': '<rootDir>/src/tests/__mocks__/huggingface-transformers.ts',
    '^chokidar$': '<rootDir>/src/tests/__mocks__/chokidar.ts',
    '^mime$': '<rootDir>/src/tests/__mocks__/mime.ts',
    '^parse-duration$': '<rootDir>/src/tests/__mocks__/parse-duration.ts',
  },
  watchman: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text-summary'],
};

export default config;
