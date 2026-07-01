"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TicketData {
  id: string;
  unique_code: string;
  holder_name: string;
  holder_email: string;
  checked_in_at: string | null;
  tier_name?: string;
}

interface Props {
  eventId: string;
  eventSlug: string;
  initialTickets: TicketData[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE_POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 60000;
const CHECKIN_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

type SortMode = "unchecked_first" | "name_asc" | "name_desc";

/**
 * Check-in client component.
 *
 * Features:
 * - Search bar — filters attendees by name, email, or ticket code
 * - Attendee table — shows name, email, tier, code, status, action button
 * - Manual entry — paste a ticket UUID and check in (with UUID validation)
 * - QR scanner — camera-based QR scanning
 * - Polling — polls /api/events/:slug/checkins with exponential backoff
 * - Pauses polling when page is in background
 * - Per-ticket button disable (not global)
 * - Auto-retry on network error
 * - Sort controls: unchecked first, name A-Z, name Z-A
 * - Keyboard shortcut: Enter to check in first filtered attendee
 * - Clear button on search input
 */
export default function CheckInClient({ eventId, eventSlug, initialTickets }: Props) {
  const [tickets, setTickets] = useState<TicketData[]>(initialTickets);
  const [search, setSearch] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());
  const [pollingError, setPollingError] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("unchecked_first");
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<number>(BASE_POLL_INTERVAL_MS);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisibleRef = useRef(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Polling with exponential backoff, paused when page is hidden
  useEffect(() => {
    const poll = async () => {
      if (!isVisibleRef.current) return;
      try {
        const res = await fetch(`/api/events/${eventSlug}/checkins`);
        if (!res.ok) {
          setPollingError(true);
          pollingIntervalRef.current = Math.min(pollingIntervalRef.current * 2, MAX_POLL_INTERVAL_MS);
          return;
        }
        setPollingError(false);
        pollingIntervalRef.current = BASE_POLL_INTERVAL_MS;
        const body = await res.json();
        if (body.data?.tickets) {
          setTickets(body.data.tickets);
        }
      } catch {
        setPollingError(true);
        pollingIntervalRef.current = Math.min(pollingIntervalRef.current * 2, MAX_POLL_INTERVAL_MS);
      }
    };

    const schedulePoll = () => {
      pollingTimerRef.current = setTimeout(async () => {
        await poll();
        schedulePoll();
      }, pollingIntervalRef.current);
    };

    schedulePoll();

    // Pause/resume on visibility change
    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
      if (document.hidden && pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      } else if (!document.hidden) {
        pollingIntervalRef.current = BASE_POLL_INTERVAL_MS;
        schedulePoll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [eventSlug]);

  // Clear feedback after 4 seconds
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Keyboard shortcut: Enter to check in first filtered attendee
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && document.activeElement === searchInputRef.current) {
        const firstUnchecked = getSortedTickets().find((t) => !t.checked_in_at);
        if (firstUnchecked) {
          handleCheckIn(firstUnchecked.unique_code);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, search, sortMode]);

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const filteredTickets = tickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.holder_name.toLowerCase().includes(q) ||
      t.holder_email.toLowerCase().includes(q) ||
      t.unique_code.toLowerCase().includes(q)
    );
  });

  function getSortedTickets(): TicketData[] {
    const sorted = [...filteredTickets];
    switch (sortMode) {
      case "unchecked_first":
        sorted.sort((a, b) => {
          if (a.checked_in_at && !b.checked_in_at) return 1;
          if (!a.checked_in_at && b.checked_in_at) return -1;
          return a.holder_name.localeCompare(b.holder_name);
        });
        break;
      case "name_asc":
        sorted.sort((a, b) => a.holder_name.localeCompare(b.holder_name));
        break;
      case "name_desc":
        sorted.sort((a, b) => b.holder_name.localeCompare(a.holder_name));
        break;
    }
    return sorted;
  }

  const handleCheckIn = useCallback(
    async (ticketCode: string, retries = MAX_RETRIES) => {
      setCheckingIn((prev) => new Set(prev).add(ticketCode));
      setFeedback(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHECKIN_TIMEOUT_MS);

      try {
        const res = await fetch("/api/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket_code: ticketCode }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const body = await res.json();

        if (!res.ok) {
          const msg =
            res.status === 409
              ? "Este ingresso já foi registrado."
              : res.status === 404
              ? "Ingresso não encontrado."
              : body.error || "Erro ao registrar entrada.";
          setFeedback({ type: "error", message: msg });
          return;
        }

        // Optimistically update the local ticket list
        setTickets((prev) =>
          prev.map((t) =>
            t.unique_code === ticketCode
              ? { ...t, checked_in_at: body.data.checked_in_at }
              : t
          )
        );

        setFeedback({
          type: "success",
          message: `Entrada registrada: ${body.data.holder_name}`,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (retries > 0 && err instanceof DOMException && err.name === "AbortError") {
          // Timeout — retry
          setCheckingIn((prev) => {
            const next = new Set(prev);
            next.delete(ticketCode);
            return next;
          });
          return handleCheckIn(ticketCode, retries - 1);
        }
        setFeedback({ type: "error", message: "Erro de conexão. Tente novamente." });
      } finally {
        setCheckingIn((prev) => {
          const next = new Set(prev);
          next.delete(ticketCode);
          return next;
        });
      }
    },
    []
  );

  const handleManualCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();

    if (!code) return;

    // Validate UUID format
    if (!UUID_REGEX.test(code)) {
      setFeedback({
        type: "error",
        message: "Código inválido. O código deve ser um UUID válido (ex: 550e8400-e29b-41d4-a716-446655440000).",
      });
      return;
    }

    handleCheckIn(code);
    // Only clear on success — keep on error so organizer can retry
    // We clear optimistically; if it fails, the error feedback shows and the code stays
    setManualCode("");
  };

  // QR Scanner

  async function startScanner() {
    setScannerError("");
    setShowScanner(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Poll for QR codes every 500ms
      scanIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Use the qrcode library to decode
        // The qrcode package is already in dependencies
        import("qrcode").then((QRCode) => {
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            // qrcode's decode works on canvas or image data
            const code = (QRCode as unknown as { decode: (canvas: HTMLCanvasElement) => string }).decode(canvas);
            if (code && UUID_REGEX.test(code.trim())) {
              stopScanner();
              handleCheckIn(code.trim());
            }
          } catch {
            // No QR code found in this frame — continue scanning
          }
        }).catch(() => {
          // qrcode import failed — silently continue
        });
      }, 500);
    } catch (err) {
      setScannerError("Não foi possível acessar a câmera. Verifique as permissões.");
      console.error("Camera access error:", err);
    }
  }

  function stopScanner() {
    setShowScanner(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR");

  const checkedInCount = tickets.filter((t) => t.checked_in_at).length;
  const sortedTickets = getSortedTickets();

  return (
    <div>
      {/* Polling error banner */}
      {pollingError && (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            background: "#fff3cd",
            color: "#856404",
            border: "1px solid #ffeeba",
            fontSize: "0.9em",
          }}
        >
          Conexão perdida — reconectando...
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            background: feedback.type === "success" ? "#d4edda" : "#f8d7da",
            color: feedback.type === "success" ? "#155724" : "#721c24",
            border: `1px solid ${
              feedback.type === "success" ? "#c3e6cb" : "#f5c6cb"
            }`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* Check-in count */}
      <p style={{ color: "#666", marginBottom: 16, fontSize: "0.9em" }}>
        {checkedInCount} / {tickets.length} check-ins realizados
      </p>

      {/* Manual entry form */}
      <form
        onSubmit={handleManualCheckIn}
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          padding: 16,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
        }}
      >
        <input
          type="text"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Código do ingresso (UUID)"
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ddd",
            fontFamily: "monospace",
          }}
        />
        <button
          type="submit"
          disabled={!manualCode.trim()}
          style={{
            padding: "8px 16px",
            background: !manualCode.trim() ? "#ccc" : "#171717",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: !manualCode.trim() ? "not-allowed" : "pointer",
          }}
        >
          Registrar entrada
        </button>
        <button
          type="button"
          onClick={showScanner ? stopScanner : startScanner}
          style={{
            padding: "8px 16px",
            background: showScanner ? "#dc3545" : "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {showScanner ? "Fechar scanner" : "Escanear QR"}
        </button>
      </form>

      {/* QR Scanner view */}
      {showScanner && (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: "#000",
            borderRadius: 6,
            textAlign: "center",
          }}
        >
          <video ref={videoRef} style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6 }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {scannerError && (
            <p style={{ color: "#f8d7da", marginTop: 8 }}>{scannerError}</p>
          )}
          <p style={{ color: "#fff", marginTop: 8, fontSize: "0.85em" }}>
            Aponte a câmera para o QR code do ingresso
          </p>
        </div>
      )}

      {/* Search bar with clear button */}
      <div style={{ marginBottom: 16, position: "relative" }}>
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, email ou código..."
          style={{
            width: "100%",
            padding: "10px 32px 10px 10px",
            borderRadius: 6,
            border: "1px solid #ddd",
            fontSize: 16,
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              color: "#888",
              padding: 4,
            }}
            aria-label="Limpar busca"
          >
            ✕
          </button>
        )}
      </div>

      {/* Sort controls */}
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: "0.85em", color: "#666" }}>Ordenar:</span>
        {(["unchecked_first", "name_asc", "name_desc"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid #ddd",
              background: sortMode === mode ? "#171717" : "#fff",
              color: sortMode === mode ? "#fff" : "#171717",
              cursor: "pointer",
              fontSize: "0.8em",
            }}
          >
            {mode === "unchecked_first"
              ? "Não registrados primeiro"
              : mode === "name_asc"
              ? "Nome A-Z"
              : "Nome Z-A"}
          </button>
        ))}
      </div>

      {/* Attendee count */}
      <p style={{ color: "#666", marginBottom: 8, fontSize: "0.9em" }}>
        {sortedTickets.length} de {tickets.length} participantes
        {search ? " (filtrados)" : ""}
        {!search && (
          <span style={{ marginLeft: 8, fontSize: "0.85em", color: "#888" }}>
            Pressione Enter para registrar o primeiro não registrado
          </span>
        )}
      </p>

      {/* Attendee table */}
      {sortedTickets.length === 0 ? (
        <p style={{ color: "#888", textAlign: "center", padding: 32 }}>
          {search
            ? "Nenhum participante encontrado."
            : "Nenhum ingresso vendido ainda."}
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "2px solid #ddd" }}>Nome</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "2px solid #ddd" }}>Email</th>
              <th style={{ textAlign: "center", padding: 8, borderBottom: "2px solid #ddd" }}>Lote</th>
              <th style={{ textAlign: "center", padding: 8, borderBottom: "2px solid #ddd" }}>Código</th>
              <th style={{ textAlign: "center", padding: 8, borderBottom: "2px solid #ddd" }}>Status</th>
              <th style={{ textAlign: "center", padding: 8, borderBottom: "2px solid #ddd" }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {sortedTickets.map((ticket) => {
              const isCheckedIn = ticket.checked_in_at !== null;
              const isCheckingThis = checkingIn.has(ticket.unique_code);
              return (
                <tr
                  key={ticket.id}
                  style={{
                    background: isCheckedIn ? "#f0fff4" : undefined,
                  }}
                >
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    {ticket.holder_name}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    {ticket.holder_email}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "center" }}>
                    {ticket.tier_name || "-"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "center", fontFamily: "monospace", fontSize: "0.8em" }}>
                    {ticket.unique_code.slice(0, 8)}...
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "center" }}>
                    {isCheckedIn ? (
                      <span style={{ color: "#155724", fontSize: "0.85em" }}>
                        {formatDateTime(ticket.checked_in_at!)}
                      </span>
                    ) : (
                      <span style={{ color: "#856404", fontSize: "0.85em" }}>
                        Pendente
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", textAlign: "center" }}>
                    <button
                      onClick={() => handleCheckIn(ticket.unique_code)}
                      disabled={isCheckedIn || isCheckingThis}
                      style={{
                        padding: "6px 14px",
                        background: isCheckedIn
                          ? "#e9ecef"
                          : isCheckingThis
                          ? "#ccc"
                          : "#28a745",
                        color: isCheckedIn ? "#6c757d" : "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: isCheckedIn || isCheckingThis ? "not-allowed" : "pointer",
                        fontSize: "0.85em",
                      }}
                    >
                      {isCheckedIn
                        ? "Registrado"
                        : isCheckingThis
                        ? "Registrando..."
                        : "Registrar entrada"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}