export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: "3px solid #e5e7eb",
        borderTop: "3px solid #171717",
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
      }}
    />
  );
}