import { Component } from 'react';
import type { ReactNode } from 'react';

export class RenderBoundary extends Component<{ children: ReactNode; onFailure: (error: Error) => void; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFailure(error); }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children; }
}
