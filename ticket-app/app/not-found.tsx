import Link from "next/link";
export default function NotFound() {
  return (
    <div style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>Página não encontrada</h1>
      <p style={{ color: "#666", margin: "1rem 0" }}>
        A página que você procura não existe ou foi removida.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "8px 16px",
          background: "#171717",
          color: "#fff",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        Ir para o início
      </Link>
    </div>
  );
}