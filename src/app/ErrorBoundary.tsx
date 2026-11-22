import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[PlateMath]', error);
  }

  reset = () => {
    try {
      localStorage.removeItem('platemath:v1');
    } catch {
      /* ignore */
    }
    location.href = '/app/';
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>PlateMath hit an unexpected error. Reloading usually fixes it. If it keeps happening, reset the saved menu.</p>
        <div className="empty-actions">
          <button className="btn" onClick={() => location.reload()}>Reload</button>
          <button className="btn ghost" onClick={this.reset}>Reset saved menu</button>
        </div>
      </div>
    );
  }
}
