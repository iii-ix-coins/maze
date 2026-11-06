import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[React] Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main role="alert" style={{ padding: '24px', fontFamily: 'sans-serif' }}>
          <h1>Page could not be rendered</h1>
          <p>Please reload the page. Existing backend services have not been changed.</p>
        </main>
      );
    }

    return this.props.children;
  }
}
