/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  // Keep workers bounded: several suites share temp directories and lockfiles,
  // and unconstrained workers make CI flaky on small runners.
  maxWorkers: 2,
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
