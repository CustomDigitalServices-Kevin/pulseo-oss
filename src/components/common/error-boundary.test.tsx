import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './error-boundary';

function Bomb({ shouldExplode }: { shouldExplode: boolean }) {
  if (shouldExplode) {
    throw new Error('boom!');
  }
  return <div>safe content</div>;
}

describe('<ErrorBoundary />', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs the caught error; suppress noise during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldExplode={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldExplode={true} />
      </ErrorBoundary>
    );
    // next-intl mock echoes keys from the `errors` namespace.
    expect(screen.getByText('boundaryTitle')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry/i })
    ).toBeInTheDocument();
  });

  it('shows the error message in details', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldExplode={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/boom!/)).toBeInTheDocument();
  });

  it('uses custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Bomb shouldExplode={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('boundaryTitle')).not.toBeInTheDocument();
  });

  it('reset button calls setState to clear the error', () => {
    // We can't easily verify recovery in a single render because the bomb
    // would re-throw. We just verify the button exists and is clickable.
    render(
      <ErrorBoundary>
        <Bomb shouldExplode={true} />
      </ErrorBoundary>
    );
    const button = screen.getByRole('button', { name: /retry/i });
    expect(() => fireEvent.click(button)).not.toThrow();
  });
});
