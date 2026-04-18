Write tests using Vitest.

- Use `describe`, `it`, `expect` from vitest
- Co-locate test files next to source (e.g., `foo.test.ts` beside `foo.ts`)
- Use `beforeEach`/`afterEach` for setup/teardown
- Mock external dependencies with `vi.mock()` or `vi.fn()`
- Prefer integration tests over unit tests when testing data flows
- Aim for clear test names that describe the expected behavior
