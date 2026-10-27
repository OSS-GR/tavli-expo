/**
 * The app's top-level error boundary. When a screen throws while it
 * renders, this reports the error through the `CrashReporter` port and
 * shows the "Something went wrong" screen instead of a blank app.
 *
 * Errors outside React rendering (event handlers, promises) do not reach
 * a boundary. The Sentry SDK catches those itself.
 */
import type { CrashReporter } from '@tavli/contracts';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { CrashScreen } from './CrashScreen';
import { restartApp } from './restart';

export interface CrashBoundaryProps {
  reporter: CrashReporter;
  children: ReactNode;
  /** What Restart does. Default: reload the whole app. */
  onRestart?: () => Promise<void> | void;
}

interface CrashBoundaryState {
  hasError: boolean;
}

export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  override state: CrashBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CrashBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.reporter.captureException(error, {
      level: 'fatal',
      tags: { boundary: 'root' },
      ...(info.componentStack ? { componentStack: info.componentStack } : {}),
    });
  }

  private restart = (): void => {
    const run = this.props.onRestart ?? restartApp;
    // If a full reload is not possible, render the app again from the top.
    Promise.resolve()
      .then(run)
      .catch(() => this.setState({ hasError: false }));
  };

  override render(): ReactNode {
    if (this.state.hasError) return <CrashScreen onRestart={this.restart} />;
    return this.props.children;
  }
}
