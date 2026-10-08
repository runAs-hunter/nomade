/**
 * Minimal chainable Supabase query-builder fake for F8 tests.
 * Records every (method, args) call; resolves `result` when awaited or on
 * single()/maybeSingle().
 */
export type FakeResult = { data: unknown; error: unknown };

export function createFakeDb(result: FakeResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const state = { result };
  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  for (const m of ["from", "select", "eq", "contains", "order", "insert", "update"]) {
    builder[m] = chain(m);
  }
  builder.single = (...args: unknown[]) => {
    calls.push({ method: "single", args });
    return Promise.resolve(state.result);
  };
  builder.maybeSingle = (...args: unknown[]) => {
    calls.push({ method: "maybeSingle", args });
    return Promise.resolve(state.result);
  };
  builder.then = (resolve: (v: FakeResult) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(state.result).then(resolve, reject);
  const client = {
    schema: (name: string) => {
      calls.push({ method: "schema", args: [name] });
      return builder;
    },
  };
  return { client, calls, state };
}
