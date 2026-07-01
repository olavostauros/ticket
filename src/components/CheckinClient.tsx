"use client";

interface Props {
  slug: string;
}

export default function CheckinClient({ slug }: Props) {
  return (
    <div>
      <p style={{ color: "#888" }}>Componente de check-in em construção. Use a API diretamente:</p>
      <pre style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, marginTop: 12 }}>
        POST /api/checkin {`{ "ticket_code": "..." }`}
      </pre>
    </div>
  );
}