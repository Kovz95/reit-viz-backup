import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** A failed lazy-route import — the classic stale-tab-after-deploy error: a
 *  deploy replaced the hashed chunk files, and a tab that loaded the OLD
 *  index.html asks for chunk names that no longer exist. A reload fetches the
 *  new index and fixes it, so do that automatically (guarded so a genuinely
 *  broken build cannot cause a reload loop). */
function isStaleChunkError(error: Error | null): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i.test(
    String(error?.message ?? error ?? ""),
  );
}

const CHUNK_RELOAD_KEY = "reit-viz:chunk-reload-at";

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
    if (isStaleChunkError(error)) {
      try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch { /* storage unavailable — leave the manual fallback */ }
    }
  }

  render() {
    if (this.state.hasError) {
      if (isStaleChunkError(this.state.error)) {
        // Auto-reload in flight (or just attempted) — show a quiet notice
        // instead of the scary error screen.
        return (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
            <div className="text-sm">New version deployed — reloading…</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs rounded bg-muted hover:bg-muted/80 transition-colors"
            >
              Reload now
            </button>
          </div>
        );
      }
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-8">
          <div className="text-lg font-semibold text-red-400">Something went wrong</div>
          <div className="text-xs text-center max-w-md opacity-70">
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-xs rounded bg-muted hover:bg-muted/80 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
