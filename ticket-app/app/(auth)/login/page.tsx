"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function validateEmail(value: string): string {
  if (!value.trim()) return "Informe seu email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Email inválido.";
  return "";
}

function validatePassword(value: string): string {
  if (!value.trim()) return "Informe sua senha.";
  return "";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validate before submit
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(data.error || "Muitas tentativas. Tente novamente em alguns minutos.");
          return;
        }
        setError(data.error || "Email ou senha inválidos");
        return;
      }

      // Cookie is set by the server via httpOnly Set-Cookie header
      router.push(redirect);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "0 auto",
        padding: "4rem 1rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Entrar</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Acesse sua conta de organizador.
      </p>

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

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="email"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(validateEmail(e.target.value));
            }}
            onBlur={() => setEmailError(validateEmail(email))}
            autoFocus
            error={emailError}
            required
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="password"
            style={{
              display: "block",
              marginBottom: "0.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Senha
          </label>
          <div style={{ position: "relative" }}>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(validatePassword(e.target.value));
              }}
              onBlur={() => setPasswordError(validatePassword(password))}
              error={passwordError}
              required
              style={{ paddingRight: "2.5rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                lineHeight: 1,
                color: "#666",
                fontSize: "1rem",
              }}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: "-0.5rem", marginBottom: "1.5rem", textAlign: "right" }}>
          <a
            href="/reset-password"
            style={{ fontSize: "0.875rem", color: "#666", textDecoration: "underline" }}
          >
            Esqueci minha senha?
          </a>
        </div>

        <Button
          type="submit"
          loading={loading}
          disabled={loading}
          style={{ width: "100%", padding: "0.75rem", fontSize: "1rem" }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "#666" }}>
        Não tem uma conta?{" "}
        <a
          href="/signup"
          style={{ color: "#171717", textDecoration: "underline" }}
        >
          Criar conta
        </a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: "4rem 1rem", textAlign: "center", color: "#888" }}>Carregando...</div>}>
      <LoginForm />
    </Suspense>
  );
}