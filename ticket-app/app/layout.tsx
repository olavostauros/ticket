import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ticket — Venda de ingressos para eventos",
  description: "Plataforma de venda de ingressos para eventos. Crie, publique e venda ingressos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}