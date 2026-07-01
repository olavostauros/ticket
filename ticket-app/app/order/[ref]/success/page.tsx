import Link from "next/link";

interface Props {
  params: Promise<{ ref: string }>;
}

/**
 * Order success page — Server Component.
 * Shown after the attendee is redirected back from AbacatePay.
 * The actual ticket generation happens asynchronously via webhook,
 * so we just show a confirmation message while the email is on its way.
 */
export default async function OrderSuccessPage({ params }: Props) {
  const { ref } = await params;

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: 48,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "3rem", marginBottom: 16 }}>🎉</div>
      <h1 style={{ margin: 0 }}>Pagamento Confirmado!</h1>
      <p style={{ color: "#555", marginTop: 16, lineHeight: 1.6 }}>
        Seu pedido <strong>{ref}</strong> foi processado com sucesso.
      </p>
      <p style={{ color: "#666", lineHeight: 1.6 }}>
        Você receberá seus ingressos por email em instantes.
      </p>

      <hr style={{ margin: "32px auto", maxWidth: 240 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <Link
          href="/my-tickets"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "#1a73e8",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          Meus ingressos
        </Link>
        <Link
          href="/"
          style={{
            color: "#1a73e8",
            textDecoration: "underline",
            fontSize: "0.9rem",
          }}
        >
          Voltar para o início
        </Link>
      </div>
    </main>
  );
}