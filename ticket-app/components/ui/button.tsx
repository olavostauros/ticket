interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "danger" | "ghost";
}

export function Button({
  children,
  loading,
  disabled,
  variant = "primary",
  style,
  ...props
}: ButtonProps) {
  const variantStyles = {
    primary: { background: "#171717", color: "#fff" },
    danger: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
    ghost: { background: "none", color: "#171717" },
  };

  return (
    <button
      disabled={disabled || loading}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: "none",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.6 : 1,
        fontSize: "0.875rem",
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {loading ? "Carregando..." : children}
    </button>
  );
}