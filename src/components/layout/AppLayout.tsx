import { useState } from "react";
import { XTermContainer } from "../terminal/XTermContainer";

export function AppLayout() {
  const [hasSession, setHasSession] = useState(false);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className="flex flex-col border-r"
        style={{
          width: 260,
          minWidth: 260,
          background: "var(--sb-bg-surface)",
          borderColor: "var(--sb-border)",
        }}
      >
        <div
          className="flex items-center justify-between border-b"
          style={{
            padding: "14px 16px",
            borderColor: "var(--sb-border)",
          }}
        >
          <h1
            className="font-semibold tracking-wider"
            style={{ fontSize: 14, color: "var(--sb-text-primary)" }}
          >
            SWITCHBOARD
          </h1>
          <button
            onClick={() => setHasSession(true)}
            className="text-white text-xs font-mono rounded-md"
            style={{
              background: "var(--sb-accent)",
              padding: "6px 12px",
              cursor: "pointer",
              border: "none",
            }}
          >
            + New
          </button>
        </div>
        {hasSession ? (
          <div style={{ padding: 8 }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--sb-bg-active)",
                border: "1px solid var(--sb-accent)",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: "var(--sb-text-primary)",
                }}
              >
                bash
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--sb-text-secondary)",
                  marginTop: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--sb-status-running)",
                    display: "inline-block",
                  }}
                />
                running
              </div>
            </div>
          </div>
        ) : (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ color: "var(--sb-text-tertiary)" }}
          >
            <p className="text-center" style={{ fontSize: 12 }}>
              No sessions yet.
            </p>
          </div>
        )}
      </div>

      {/* Terminal area */}
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        {/* Toolbar */}
        <div
          className="flex items-center border-b"
          style={{
            padding: "8px 16px",
            borderColor: "var(--sb-border)",
            background: "var(--sb-bg-primary)",
            fontSize: 12,
            color: "var(--sb-text-secondary)",
          }}
        >
          {hasSession ? (
            <span style={{ color: "var(--sb-text-primary)" }}>bash</span>
          ) : (
            <span>Switchboard v0.1.0</span>
          )}
        </div>

        {/* Terminal or empty state */}
        {hasSession ? (
          <div className="flex-1" style={{ minHeight: 0 }}>
            <XTermContainer />
          </div>
        ) : (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ background: "var(--sb-bg-terminal)" }}
          >
            <div className="text-center" style={{ maxWidth: 400 }}>
              <h2
                className="font-semibold"
                style={{
                  fontSize: 18,
                  color: "var(--sb-text-primary)",
                  marginBottom: 12,
                }}
              >
                Welcome to Switchboard
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--sb-text-secondary)",
                  marginBottom: 24,
                  lineHeight: 1.6,
                }}
              >
                Manage multiple AI coding agents in parallel.
                <br />
                Each session gets its own interactive terminal.
              </p>
              <button
                onClick={() => setHasSession(true)}
                className="text-white text-sm font-mono rounded-md"
                style={{
                  background: "var(--sb-accent)",
                  padding: "10px 24px",
                  cursor: "pointer",
                  border: "none",
                }}
              >
                Start First Session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
