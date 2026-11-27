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
  ],
  coverageReporters: ['text-summary'],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 60,
      functions: 65,
      lines: 65,
    },
  },
};
