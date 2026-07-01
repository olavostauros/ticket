import Link from "next/link";

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 2rem",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>🎟️ Ticket</span>
        <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link href="/my-tickets" style={{ fontSize: "0.875rem", color: "#555" }}>
            Meus ingressos
          </Link>
          <Link
            href="/login"
            style={{
              padding: "0.5rem 1rem",
              background: "#171717",
              color: "#fff",
              borderRadius: 6,
              fontSize: "0.875rem",
              textDecoration: "none",
            }}
          >
            Entrar
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 1rem",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3rem)",
            fontWeight: 800,
            marginBottom: "0.75rem",
            lineHeight: 1.2,
          }}
        >
          Venda ingressos para seus eventos
        </h1>
        <p
          style={{
            color: "#666",
            fontSize: "1.125rem",
            maxWidth: 480,
            marginBottom: "3rem",
            lineHeight: 1.5,
          }}
        >
          Crie, publique e venda ingressos online. Seus participantes compram com
          PIX, boleto ou cartão e recebem o ingresso por email.
        </p>

        {/* Two paths */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: 600,
          }}
        >
          {/* Organizer card */}
          <div
            style={{
              flex: "1 1 240px",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "2rem",
              background: "#fafafa",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <span style={{ fontSize: "2rem" }}>🎪</span>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>
              Sou organizador
            </h2>
            <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.5rem" }}>
              Crie e gerencie seus eventos, venda ingressos e faça check-in.
            </p>
            <Link
              href="/signup"
              style={{
                display: "inline-block",
                padding: "0.625rem 1.25rem",
                background: "#171717",
                color: "#fff",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Criar conta grátis
            </Link>
            <p style={{ fontSize: "0.8rem", color: "#888" }}>
              Já tem conta?{" "}
              <Link href="/login" style={{ color: "#171717", textDecoration: "underline" }}>
                Entrar
              </Link>
            </p>
          </div>

          {/* Attendee card */}
          <div
            style={{
              flex: "1 1 240px",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "2rem",
              background: "#fafafa",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <span style={{ fontSize: "2rem" }}>🎫</span>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700 }}>
              Sou participante
            </h2>
            <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.5rem" }}>
              Compre ingressos ou acesse seus ingressos já comprados.
            </p>
            <Link
              href="/my-tickets"
              style={{
                display: "inline-block",
                padding: "0.625rem 1.25rem",
                background: "#171717",
                color: "#fff",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Meus ingressos
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "1.5rem",
          fontSize: "0.8rem",
          color: "#999",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <Link href="/privacy" style={{ color: "#666", textDecoration: "underline" }}>
          Política de Privacidade
        </Link>
      </footer>
    </div>
  );
}