interface CardProps {
  label: string;
  value: string;
}

export function Card({ label, value }: CardProps) {
  return (
    <div
      style={{
        padding: 16,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
      }}
    >
      <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>{value}</p>
    </div>
  );
}