/**
 * Helpers to mock Drizzle queries in unit tests.
 *
 * Drizzle's query builder is fluent and chainable, so we provide a small
 * factory that returns a chain whose terminal methods (`returning`, `then`)
 * resolve to a configurable value.
 */
import { vi, type Mock } from 'vitest';

/**
 * A mock chain for `db.insert(...)` style calls.
 * Use `setReturnValue` to control what `.returning()` resolves to.
 * The chain itself is awaitable (resolves to undefined when not using `.returning()`).
 */
export interface MockInsertChain {
  values: Mock;
  returning: Mock;
  setReturnValue(value: unknown): void;
  then: (resolve: (v: unknown) => void) => void;
}

export function createInsertChain(): MockInsertChain {
  let returnValue: unknown = [];
  const chain = {
    values: vi.fn(),
    returning: vi.fn(),
    setReturnValue(value: unknown) {
      returnValue = value;
    },
    then(resolve: (v: unknown) => void) {
      resolve(undefined);
    },
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockImplementation(() => Promise.resolve(returnValue));
  return chain as MockInsertChain;
}

export interface MockUpdateChain {
  set: Mock;
  where: Mock;
  returning: Mock;
  setReturnValue(value: unknown): void;
  then: (resolve: (v: unknown) => void) => void;
}

export function createUpdateChain(): MockUpdateChain {
  let returnValue: unknown = [];
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
    setReturnValue(value: unknown) {
      returnValue = value;
    },
    then(resolve: (v: unknown) => void) {
      resolve(undefined);
    },
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockImplementation(() => Promise.resolve(returnValue));
  return chain as MockUpdateChain;
}

export interface MockDeleteChain {
  where: Mock;
  then: (resolve: (v: unknown) => void) => void;
}

export function createDeleteChain(): MockDeleteChain {
  const chain = {
    where: vi.fn(),
    then(resolve: (v: unknown) => void) {
      resolve(undefined);
    },
  };
  chain.where.mockReturnValue(chain);
  return chain as MockDeleteChain;
}
