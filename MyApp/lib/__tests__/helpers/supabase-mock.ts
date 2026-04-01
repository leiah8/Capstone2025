import { supabase } from '../../supabase';

type SupabaseResponse<T = any> = { data: T; error: null } | { data: null; error: any };

/**
 * Creates a chainable mock query builder that resolves to the given response.
 * Every chainable method returns `this`, and the object is a thenable
 * that resolves to `response`.
 */
function createChainableMock(response: SupabaseResponse) {
  const chain: any = {};

  // All chainable methods return the chain itself
  const chainableMethods = [
    'select', 'eq', 'neq', 'not', 'in', 'order', 'limit', 'update', 'delete',
  ];
  for (const method of chainableMethods) {
    chain[method] = jest.fn(() => chain);
  }

  // Terminal methods resolve to the response
  chain.single = jest.fn().mockResolvedValue(response);
  chain.maybeSingle = jest.fn().mockResolvedValue(response);
  chain.upsert = jest.fn().mockResolvedValue(response);

  // Make the chain itself thenable so `await supabase.from(...).select(...).eq(...)` works
  chain.then = jest.fn((resolve: any) => resolve(response));

  return chain;
}

/**
 * Configure supabase.from(tableName) to return a chain that resolves to `response`.
 * Can be called multiple times with different table names.
 */
export function mockSupabaseFrom(tableName: string, response: SupabaseResponse) {
  const chain = createChainableMock(response);
  const fromMock = supabase.from as jest.Mock;
  const existing = fromMock.getMockImplementation();
  fromMock.mockImplementation((table: string) => {
    if (table === tableName) return chain;
    if (existing) return existing(table);
    return createChainableMock({ data: null, error: null });
  });
  return chain;
}

/**
 * Configure supabase.from(tableName) to return different chains on successive calls.
 * Useful for functions that call from(sameName) multiple times (select then delete, etc.).
 */
export function mockSupabaseFromSequence(tableName: string, responses: SupabaseResponse[]) {
  let callIndex = 0;
  const chains: any[] = responses.map((r) => createChainableMock(r));
  const fromMock = supabase.from as jest.Mock;
  const existing = fromMock.getMockImplementation();
  fromMock.mockImplementation((table: string) => {
    if (table === tableName) {
      const chain = chains[Math.min(callIndex, chains.length - 1)];
      callIndex++;
      return chain;
    }
    if (existing) return existing(table);
    return createChainableMock({ data: null, error: null });
  });
  return chains;
}

export function mockSupabaseFunctionsInvoke(response: { data?: any; error?: any }) {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: response.data ?? null,
    error: response.error ?? null,
  });
}

export function mockSupabaseAuthSession(session: { access_token: string } | null) {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session },
  });
}

export function mockSupabaseAuthUser(user: { id: string } | null) {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user },
  });
}

export function mockSupabaseStorage(publicUrl: string) {
  (supabase.storage.from as jest.Mock).mockReturnValue({
    getPublicUrl: jest.fn().mockReturnValue({
      data: { publicUrl },
    }),
  });
}

export function resetSupabaseMocks() {
  (supabase.from as jest.Mock).mockReset();
  (supabase.functions.invoke as jest.Mock).mockReset();
  (supabase.auth.getSession as jest.Mock).mockReset();
  (supabase.auth.getUser as jest.Mock).mockReset();
  (supabase.storage.from as jest.Mock).mockReset();
}
