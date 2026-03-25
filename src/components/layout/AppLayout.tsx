export function AppLayout() {
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
            className="text-white text-xs font-mono rounded-md"
            style={{
              background: "var(--sb-accent)",
              padding: "6px 12px",
            }}
          >
            + New
          </button>
        </div>
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: "var(--sb-text-tertiary)" }}
        >
          <p className="text-center" style={{ fontSize: 12 }}>
            No sessions yet.
            <br />
            Start your first session.
          </p>
        </div>
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
          <span style={{ color: "var(--sb-text-primary)" }}>
            Switchboard v0.1.0
          </span>
        </div>

        {/* Terminal placeholder */}
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
              className="text-white text-sm font-mono rounded-md"
              style={{
                background: "var(--sb-accent)",
                padding: "10px 24px",
              }}
            >
              Start First Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
