"use client";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>Algo deu errado</h1>
      <p style={{ color: "#666", margin: "1rem 0" }}>{error.message}</p>
      <button
        onClick={reset}
        style={{
          padding: "8px 16px",
          background: "#171717",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}