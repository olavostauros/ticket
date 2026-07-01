/**
 * Format a value in cents to BRL currency string.
 * Example: 1500 → "R$ 15,00"
 */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}