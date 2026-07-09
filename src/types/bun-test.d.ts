declare module 'bun:test' {
  type BunLifecycleFn = (
    name: string,
    callback: () => void | Promise<void>
  ) => void

  type BunHookFn = (callback: () => void | Promise<void>) => void

  type ExpectMatcher = {
    toEqual(expected: unknown): void
    toBe(expected: unknown): void
    toBeNull(): void
    toHaveLength(expected: number): void
    toMatchObject(expected: unknown): void
    toHaveBeenCalled(): void
    toHaveBeenCalledWith(...args: unknown[]): void
    toThrow(expected?: unknown): void
    readonly not: ExpectMatcher
    readonly rejects: ExpectMatcher
    readonly resolves: ExpectMatcher
  }

  // biome-ignore lint/suspicious/noExplicitAny: mock wraps arbitrary functions
  type AnyFn = (...args: any[]) => any

  type BunMock<T extends AnyFn> = T & {
    mockClear(): void
    mockReset(): void
    mockImplementation(fn: T): BunMock<T>
    mockReturnValue(value: ReturnType<T>): BunMock<T>
    mockResolvedValue(value: Awaited<ReturnType<T>>): BunMock<T>
  }

  type BunMockFn = {
    <T extends AnyFn>(fn: T): BunMock<T>
    module(id: string, factory: () => unknown): void
  }

  export const describe: BunLifecycleFn
  export const expect: (value: unknown) => ExpectMatcher
  export const test: BunLifecycleFn
  export const beforeEach: BunHookFn
  export const afterEach: BunHookFn
  export const beforeAll: BunHookFn
  export const afterAll: BunHookFn
  export const mock: BunMockFn
}
