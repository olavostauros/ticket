interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function Input({ error, style, ...props }: InputProps) {
  return (
    <div>
      <input
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${error ? "#dc2626" : "#d1d5db"}`,
          fontSize: "0.875rem",
          ...style,
        }}
        {...props}
      />
      {error && (
        <p style={{ color: "#dc2626", fontSize: "0.75rem", marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}