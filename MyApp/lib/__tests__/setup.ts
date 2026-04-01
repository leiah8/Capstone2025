// Global test setup — runs before each test suite

// Mock the supabase module so every import of './supabase' gets this mock
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
    },
    storage: {
      from: jest.fn(),
    },
  },
}));

// React Native global used by matching-api.ts
(globalThis as any).__DEV__ = false;
