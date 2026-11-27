/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/tests/**',
    '!src/scenarios/**',
    '!src/dashboard/**',
    // CLI and package barrel are exercised via smoke tests, not unit tests.
    '!src/index.ts',
    '!src/cli/**',
  ],
  coverageReporters: ['text-summary'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 65,
      functions: 72,
      lines: 72,
    },
  },
};
