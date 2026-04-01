/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/Tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/Tests/setup.ts'],
  clearMocks: true,
};
