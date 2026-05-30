// App-level error boundary so a render-time crash in any leaf doesn't take
// down the entire new-tab page. Falls back to a minimal recoverable view.

import { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background text-foreground"
      >
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          The app hit an unexpected error. Your data is safe — try reloading. If
          this keeps happening, you can clear local storage to reset to defaults.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
