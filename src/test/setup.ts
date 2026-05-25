/**
 * Vitest setup file — runs before each test file.
 *
 * - Extends expect with @testing-library/jest-dom matchers
 * - Cleans up the React DOM between tests
 * - Polyfills missing browser APIs for jsdom
 * - Stubs required env vars for modules that throw at import time
 */
// Required by src/lib/auth/index.ts which throws at import time if missing.
// Tests that load the real `./session` module transitively import `./index`.
process.env.BETTER_AUTH_SECRET ??= 'test-secret-minimum-32-characters-long-ok';

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// ─── next-intl mocks ────────────────────────────────────────────────────────
// Tests render components in isolation without NextIntlClientProvider. We mock
// next-intl (client) + next-intl/server so useTranslations/getTranslations
// return a translator that echoes the key and interpolates {param} minimally.

function makeTranslator() {
  const fn = (key: string, params?: Record<string, unknown>) => {
    if (!params) return key;
    return Object.entries(params).reduce<string>(
      (out, [k, v]) => out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      key,
    );
  };
  (fn as unknown as { rich: typeof fn }).rich = fn;
  return fn;
}

vi.mock('next-intl', async () => {
  const actual = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    ...actual,
    useTranslations: () => makeTranslator(),
    useLocale: () => 'fr',
    useFormatter: () => ({
      dateTime: (d: Date) => (d instanceof Date ? d.toISOString() : String(d)),
      number: (n: number) => String(n),
      relativeTime: (d: Date) => (d instanceof Date ? d.toISOString() : String(d)),
    }),
  };
});

vi.mock('next-intl/server', async () => {
  const actual = await vi.importActual<typeof import('next-intl/server')>('next-intl/server');
  return {
    ...actual,
    getTranslations: async () => makeTranslator(),
    getLocale: async () => 'fr',
    getFormatter: async () => ({
      dateTime: (d: Date) => (d instanceof Date ? d.toISOString() : String(d)),
      number: (n: number) => String(n),
      relativeTime: (d: Date) => (d instanceof Date ? d.toISOString() : String(d)),
    }),
  };
});

// jsdom does not implement matchMedia — needed by next-themes and Tailwind hooks
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom does not implement IntersectionObserver — used by some shadcn primitives
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
}

// jsdom does not implement ResizeObserver — needed by Recharts ResponsiveContainer.
// We provide a mock that invokes the callback synchronously on observe() with
// a plausible contentRect so charts actually render (otherwise Recharts logs
// "width(-1) height(-1)" and bails out, leaving the SVG empty).
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  type RoCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;

  class MockResizeObserver {
    private readonly cb: RoCallback;

    constructor(cb: RoCallback) {
      this.cb = cb;
    }

    observe(_target: Element): void {
      // Fire a single entry with fixed dimensions so downstream libs
      // (e.g. Recharts ResponsiveContainer) can measure and render.
      this.cb([{ contentRect: { width: 600, height: 300 } }]);
    }

    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });
}
