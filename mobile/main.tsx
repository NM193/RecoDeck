import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { MobileApp } from "./App";
import "./mobile.css";

class MobileErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[MobileApp] Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
            background: "#0a0a0f",
            color: "#e0e0e8",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#888", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Try opening the link again, or enter the URL manually below.
          </p>
          <p
            style={{
              color: "#666",
              fontSize: "0.75rem",
              wordBreak: "break-all",
              maxWidth: "100%",
            }}
          >
            {typeof window !== "undefined" ? window.location.href : ""}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MobileErrorBoundary>
      <MobileApp />
    </MobileErrorBoundary>
  </React.StrictMode>
);
