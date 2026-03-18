import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', 'embedder\\.test\\.ts$'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@huggingface/transformers$': '<rootDir>/src/tests/__mocks__/huggingface-transformers.ts',
    '^chokidar$': '<rootDir>/src/tests/__mocks__/chokidar.ts',
  },
  watchman: false,
};

export default config;
