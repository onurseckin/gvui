import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class LayoutErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("LayoutErrorBoundary caught an error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: "24px",
            margin: "16px",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600 }}>
            Layout Rendering Error
          </h3>
          <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#b91c1c" }}>
            {this.state.error?.message ?? "An unexpected layout calculation error occurred."}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "8px 16px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "13px",
            }}
          >
            Retry Layout Calculation
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
