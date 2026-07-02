"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Html5QrcodeScanner } from "html5-qrcode";

interface Props {
  slug: string;
}

interface TicketResult {
  id: string;
  unique_code: string;
  holder_name: string;
  holder_email: string;
  checked_in_at: string | null;
  tier_name: string;
}

interface CheckinResponse {
  checked_in?: boolean;
  already_checked_in?: boolean;
  checked_in_at?: string;
  ticket: {
    id: string;
    holder_name: string;
    holder_email: string;
    event_title: string;
  };
}

type Mode = "scan" | "manual";

/**
 * Extract the ticket code from a scanned QR code value or manual input.
 * Supports:
 *   - Full URL: https://ticket.app/tickets/<code>  (UUID or short code)
 *   - Path: /tickets/<code>
 *   - Raw: <code> (UUID or 8-char short code)
 */
function extractTicketCode(scanned: string): string | null {
  const trimmed = scanned.trim();
  if (!trimmed) return null;

  // If the input is an 8-char uppercase hex code, return it directly
  const shortCodePat = /^[A-F0-9]{8}$/;
  if (shortCodePat.test(trimmed)) return trimmed;

  // UUID pattern
  const uuidPat = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // Try to parse as URL first
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    // Check for short code in the last path segment
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || "";
    if (shortCodePat.test(lastSegment)) return lastSegment;
    const match = url.pathname.match(uuidPat);
    if (match) return match[0];
  } catch {
    // Not a URL — try raw patterns
  }

  // Try extracting UUID from raw text
  const match = trimmed.match(uuidPat);
  if (match) return match[0];

  return null;
}

export default function CheckinClient({ slug }: Props) {
  const [mode, setMode] = useState<Mode>("scan");
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "reentry" | "error";
    message: string;
    data?: CheckinResponse;
  } | null>(null);

  // Recent check-ins
  const [tickets, setTickets] = useState<TicketResult[]>([]);
  const [ticketsTotal, setTicketsTotal] = useState(0);

  // QR scanner
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstance = useRef<Html5QrcodeScanner | null>(null);

  const checkIn = useCallback(async (ticketCode: string) => {
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_code: ticketCode }),
      });

      const json = await res.json().catch(() => ({}));
      const data = json.data || json;

      if (res.ok) {
        if (data.already_checked_in) {
          setResult({
            type: "reentry",
            message: `Reentrada registrada para ${data.ticket.holder_name}.`,
            data,
          });
        } else {
          setResult({
            type: "success",
            message: `${data.ticket.holder_name} fez check-in com sucesso!`,
            data,
          });
        }
        // Reload recent list after successful check-in
        loadTickets();
      } else {
        setResult({
          type: "error",
          message: data.error || "Erro ao processar check-in.",
        });
      }
    } catch {
      setResult({ type: "error", message: "Erro de conexão. Tente novamente." });
    } finally {
      setSubmitting(false);
    }
  }, []);

  const handleScan = useCallback(
    (decodedText: string) => {
      const code = extractTicketCode(decodedText);
      if (code) {
        checkIn(code);
      } else {
        setResult({
          type: "error",
          message: "QR code inválido. Escaneie o código do ingresso.",
        });
      }
    },
    [checkIn]
  );

  const handleScanError = useCallback((err: string) => {
    // html5-qrcode fires errors for transient camera blips — ignore them
    if (err?.includes("NotFound")) {
      setResult({
        type: "error",
        message: "Câmera não encontrada. Use a entrada manual.",
      });
    }
  }, []);

  // Initialize QR scanner
  useEffect(() => {
    if (mode !== "scan" || !scannerRef.current) return;

    let mounted = true;

    const initScanner = async () => {
      try {
        const { Html5QrcodeScanner } = await import("html5-qrcode");

        if (!mounted || !scannerRef.current) return;

        const scanner = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          false
        );

        scannerInstance.current = scanner;
        scanner.render(handleScan, handleScanError);
      } catch {
        if (mounted) {
          setResult({
            type: "error",
            message: "Não foi possível iniciar a câmera. Use a entrada manual.",
          });
        }
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (scannerInstance.current) {
        try {
          scannerInstance.current.clear();
        } catch {
          // ignore cleanup errors
        }
        scannerInstance.current = null;
      }
    };
  }, [mode, handleScan, handleScanError]);

  // Load recent tickets
  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${slug}/checkins?limit=50`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data || json;
      setTickets(data.tickets || []);
      setTicketsTotal(data.pagination?.total || 0);
    } catch {
      // silent fail — list is best-effort
    }
  }, [slug]);

  useEffect(() => {
    loadTickets();
    const interval = setInterval(loadTickets, 5000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    checkIn(manualCode.trim());
  };

  const dismissResult = () => setResult(null);

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid #e5e7eb" }}>
        <button
          onClick={() => setMode("scan")}
          style={{
            flex: 1,
            padding: "10px 16px",
            border: "none",
            borderBottom: mode === "scan" ? "2px solid #1a73e8" : "2px solid transparent",
            marginBottom: -2,
            background: "none",
            cursor: "pointer",
            fontWeight: mode === "scan" ? 600 : 400,
            color: mode === "scan" ? "#1a73e8" : "#666",
            fontSize: "0.95rem",
          }}
        >
          📷 Scanear QR
        </button>
        <button
          onClick={() => setMode("manual")}
          style={{
            flex: 1,
            padding: "10px 16px",
            border: "none",
            borderBottom: mode === "manual" ? "2px solid #1a73e8" : "2px solid transparent",
            marginBottom: -2,
            background: "none",
            cursor: "pointer",
            fontWeight: mode === "manual" ? 600 : 400,
            color: mode === "manual" ? "#1a73e8" : "#666",
            fontSize: "0.95rem",
          }}
        >
          ⌨️ Código Manual
        </button>
      </div>

      {/* QR Scanner */}
      {mode === "scan" && (
        <div>
          <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: 12 }}>
            Aponte a câmera para o QR code do ingresso.
          </p>
          <div
            id="qr-reader"
            ref={scannerRef}
            style={{
              width: "100%",
              maxWidth: 400,
              margin: "0 auto",
              borderRadius: 12,
              overflow: "hidden",
            }}
          />
        </div>
      )}

      {/* Manual entry */}
      {mode === "manual" && (
        <form onSubmit={handleManualSubmit} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label
              htmlFor="ticket-code"
              style={{ display: "block", marginBottom: 4, fontWeight: 600, fontSize: "0.9rem" }}
            >
              Código do ingresso
            </label>
            <input
              id="ticket-code"
              type="text"
              placeholder="Cole o código do ingresso (ex: A3B4C5D6)"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ccc",
                borderRadius: 6,
                fontSize: "1rem",
                boxSizing: "border-box",
                fontFamily: "monospace",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !manualCode.trim()}
            style={{
              padding: "10px 24px",
              background: submitting || !manualCode.trim() ? "#93c5fd" : "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: "1rem",
              cursor: submitting || !manualCode.trim() ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Verificando..." : "Verificar ingresso"}
          </button>
        </form>
      )}

      {/* Result display */}
      {result && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 8,
            marginBottom: 24,
            border: "1px solid",
            background:
              result.type === "success"
                ? "#f0fdf4"
                : result.type === "reentry"
                  ? "#fefce8"
                  : "#fef2f2",
            borderColor:
              result.type === "success"
                ? "#bbf7d0"
                : result.type === "reentry"
                  ? "#fde68a"
                  : "#fecaca",
            color:
              result.type === "success"
                ? "#166534"
                : result.type === "reentry"
                  ? "#854d0e"
                  : "#991b1b",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "1.05rem" }}>
                {result.type === "success" && "✅ "}
                {result.type === "reentry" && "🔄 "}
                {result.type === "error" && "❌ "}
                {result.type === "success"
                  ? "Check-in realizado!"
                  : result.type === "reentry"
                    ? "Reentrada registrada"
                    : "Erro"}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "0.95rem" }}>{result.message}</p>
              {result.data?.ticket && (
                <div style={{ marginTop: 8, fontSize: "0.9rem" }}>
                  <p style={{ margin: 0 }}>
                    <strong>Nome:</strong> {result.data.ticket.holder_name}
                  </p>
                  <p style={{ margin: "2px 0 0" }}>
                    <strong>Email:</strong> {result.data.ticket.holder_email}
                  </p>
                  <p style={{ margin: "2px 0 0" }}>
                    <strong>Evento:</strong> {result.data.ticket.event_title}
                  </p>
                  {result.checked_in_at && (
                    <p style={{ margin: "2px 0 0" }}>
                      <strong>Check-in:</strong>{" "}
                      {new Date(result.checked_in_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={dismissResult}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "1.2rem",
                color: "inherit",
                padding: 4,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator during submission */}
      {submitting && !result && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 8,
            marginBottom: 24,
            background: "#f0f5ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            textAlign: "center",
          }}
        >
          Verificando ingresso...
        </div>
      )}

      {/* Recent tickets list */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
            Ingressos ({ticketsTotal})
          </h3>
          <span style={{ color: "#888", fontSize: "0.8rem" }}>
            Atualiza a cada 5s
          </span>
        </div>

        {tickets.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: 24 }}>
            Nenhum ingresso vendido ainda.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", whiteSpace: "nowrap" }}>
                    Nome
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 12px", whiteSpace: "nowrap" }}>
                    Email
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 12px", whiteSpace: "nowrap" }}>
                    Ingresso
                  </th>
                  <th style={{ textAlign: "center", padding: "8px 12px", whiteSpace: "nowrap" }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    style={{
                      borderBottom: "1px solid #f0f0f0",
                      background: ticket.checked_in_at ? "#f0fdf4" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 12px" }}>{ticket.holder_name}</td>
                    <td style={{ padding: "10px 12px", color: "#666" }}>
                      {ticket.holder_email}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#666" }}>
                      {ticket.tier_name || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      {ticket.checked_in_at ? (
                        <span
                          style={{
                            background: "#dcfce7",
                            color: "#166534",
                            padding: "2px 10px",
                            borderRadius: 999,
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          ✅ Check-in
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#f3f4f6",
                            color: "#6b7280",
                            padding: "2px 10px",
                            borderRadius: 999,
                            fontSize: "0.8rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Pendente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}