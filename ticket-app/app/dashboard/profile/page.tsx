"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Organizer {
  id: string;
  email: string;
  name: string;
  pix_key: string | null;
  pix_key_type: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [name, setName] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  // Auto-dismiss messages after 4 seconds
  useEffect(() => {
    if (!message && !error) return;
    const timer = setTimeout(() => {
      setMessage("");
      setError("");
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, error]);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      const org = data.data?.organizer;
      if (org) {
        setOrganizer(org);
        setName(org.name);
        setPixKey(org.pix_key || "");
        setPixKeyType(org.pix_key_type || "cpf");
      }
    } catch {
      setError("Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);

    try {
      const body: Record<string, unknown> = { name };
      if (pixKey.trim()) {
        body.pix_key = pixKey.trim();
        body.pix_key_type = pixKeyType;
      } else {
        body.pix_key = null;
        body.pix_key_type = null;
      }

      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "Erro ao salvar");
        return;
      }

      setMessage("Perfil atualizado com sucesso!");
      setOrganizer(data.data?.organizer);
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 500, margin: "0 auto", padding: "2rem 1rem" }}>
        <p style={{ color: "#888" }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "2rem 1rem" }}>

      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Meu Perfil</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        {organizer?.email}
      </p>

      {message && (
        <div
          style={{
            background: "#f0fdf4",
            color: "#166534",
            padding: "0.75rem",
            borderRadius: 6,
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fef2f2",
            color: "#991b1b",
            padding: "0.75rem",
            borderRadius: 6,
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="name"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Nome
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "1rem",
            }}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="pixKey"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Chave PIX
          </label>
          <input
            id="pixKey"
            type="text"
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="Sua chave PIX para receber pagamentos"
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "1rem",
            }}
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label
            htmlFor="pixKeyType"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Tipo de Chave PIX
          </label>
          <select
            id="pixKeyType"
            value={pixKeyType}
            onChange={(e) => setPixKeyType(e.target.value)}
            disabled={!pixKey.trim()}
            style={{
              width: "100%",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: "1rem",
              background: "#fff",
            }}
          >
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">Email</option>
            <option value="phone">Telefone</option>
            <option value="random">Chave aleatória</option>
          </select>
        </div>

        <Button type="submit" loading={saving} style={{ width: "100%", fontSize: "1rem" }}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </form>
    </div>
  );
}