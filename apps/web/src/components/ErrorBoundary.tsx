import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional fallback; defaults to nothing (e.g. a single feed card just disappears). */
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
}

/** Catches render errors so one bad component can't white-screen the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[ErrorBoundary] caught', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
