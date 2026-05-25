'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface DefaultFallbackProps {
  error: Error | null;
  onReset: () => void;
}

/**
 * Functional fallback component — uses the i18n hook (React hook, cannot be
 * called from the class body). Rendered by `ErrorBoundary` when no custom
 * fallback is provided by the parent.
 */
function DefaultFallback({ error, onReset }: DefaultFallbackProps) {
  const t = useTranslations('errors');

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 animate-in">
      <div className="w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-5">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight mb-2">
        {t('boundaryTitle')}
      </h2>
      <p className="text-sm text-muted-foreground max-w-md text-center mb-6">
        {t('boundaryHint')}
      </p>
      {error && (
        <details className="mb-6 text-xs text-muted-foreground max-w-md w-full">
          <summary className="cursor-pointer hover:text-foreground transition-colors">
            {t('technicalDetails')}
          </summary>
          <pre className="mt-2 p-3 bg-muted/50 rounded-lg overflow-x-auto font-mono text-[13px] leading-relaxed">
            {error.message}
          </pre>
        </details>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={onReset} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {t('retry')}
        </Button>
        <Button
          onClick={() => window.location.reload()}
          size="sm"
          className="gap-2"
        >
          {t('reload')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Catches React render errors and shows a friendly fallback UI.
 *
 * Use this at layout level to prevent white screens.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return <DefaultFallback error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}
