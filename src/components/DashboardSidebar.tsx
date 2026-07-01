"use client";

import { useState } from "react";

const navLinks = [
  { href: "/dashboard", label: "Visão Geral" },
  { href: "/dashboard/profile", label: "Perfil" },
  { href: "/dashboard/events", label: "Eventos" },
];

export default function DashboardSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(!open)} style={{
        position: "fixed", top: 12, left: 12, zIndex: 50, padding: "8px 12px",
        background: "#171717", color: "#fff", border: "none", borderRadius: 6,
        cursor: "pointer", fontSize: "1.25rem", display: "none"
      }} className="hamburger-btn" aria-label="Abrir menu">
        {open ? "✕" : "☰"}
      </button>
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.3)" }} className="sidebar-overlay" />}
      <nav style={{
        width: 240, padding: 16, borderRight: "1px solid #e5e7eb",
        background: "#f9fafb", flexShrink: 0
      }} className="dashboard-sidebar">
        <h2 style={{ fontSize: "1.25rem", marginBottom: 24 }}>Ticket</h2>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {navLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} onClick={() => setOpen(false)} style={{
                display: "block", padding: "8px 12px", borderRadius: 6,
                color: "#171717", textDecoration: "none"
              }}>{link.label}</a>
            </li>
          ))}
          <li>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" style={{
                display: "block", width: "100%", padding: "8px 12px",
                borderRadius: 6, color: "#991b1b", background: "none",
                border: "none", cursor: "pointer", textAlign: "left", fontSize: "inherit"
              }}>Sair</button>
            </form>
          </li>
        </ul>
      </nav>
      <style>{`
        @media (max-width: 768px) {
          .hamburger-btn { display: block !important; }
          .dashboard-sidebar { position: fixed; top: 0; left: 0; z-index: 45; height: 100vh; transform: translateX(${open ? "0" : "-100%"}); transition: transform 0.2s ease; }
          .sidebar-overlay { display: block !important; }
        }
      `}</style>
    </>
  );
}