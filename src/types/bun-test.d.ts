declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>, timeout?: number): void;
  export function test(name: string, fn: () => void | Promise<void>, timeout?: number): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function expect(value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeDefined(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toThrow(expected?: unknown): void;
    rejects: {
      toThrow(expected?: unknown): Promise<void>;
      toBe(expected: unknown): Promise<void>;
      toEqual(expected: unknown): Promise<void>;
    };
    resolves: {
      toBe(expected: unknown): Promise<void>;
      toEqual(expected: unknown): Promise<void>;
    };
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toBeNull(): void;
      toBeUndefined(): void;
      toContain(expected: unknown): void;
      toThrow(expected?: unknown): void;
    };
  };

  /** Minimal shape of a `bun:test` spy: a callable wrapper exposing recorded call arguments. */
  export interface Mock<Fn extends (...args: never[]) => unknown = (...args: never[]) => unknown> {
    (...args: Parameters<Fn>): ReturnType<Fn>;
    mock: { calls: Array<Parameters<Fn>> };
  }

  export function spyOn<T extends object, K extends keyof T>(
    object: T,
    method: K,
  ): T[K] extends (...args: never[]) => unknown ? Mock<T[K]> : never;
}
