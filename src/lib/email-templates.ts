/**
 * Email templates — HTML email builders for transactional emails.
 *
 * All user-provided strings are HTML-escaped to prevent XSS in email clients.
 */

/**
 * Escape HTML special characters in user-provided strings.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Build the organizer welcome email HTML.
 *
 * @param params.name - Organizer's display name
 */
export function buildWelcomeEmail(params: {
  name: string;
  appUrl?: string;
}): string {
  const safeName = escapeHtml(params.name);
  const appUrl = params.appUrl || "https://ticket.app";

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">🎟️ Bem-vindo ao Ticket!</h1>
      <p>Olá <strong>${safeName}</strong>,</p>
      <p>Sua conta de organizador foi criada com sucesso.</p>
      <p>Com o Ticket você pode criar eventos, vender ingressos online e fazer check-in dos participantes na hora do evento.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
        <tr>
          <td style="background: #171717; border-radius: 6px; text-align: center;">
            <a href="${escapeHtml(appUrl)}/dashboard/events/new" style="display: inline-block; padding: 12px 24px; color: #fff; text-decoration: none; font-size: 16px; font-weight: 600;">
              Criar primeiro evento
            </a>
          </td>
        </tr>
      </table>
      <p style="margin-top: 20px;">
        Acesse seu dashboard para gerenciar seus eventos:
        <br>
        <a href="${escapeHtml(appUrl)}/dashboard" style="color: #171717;">${escapeHtml(appUrl)}/dashboard</a>
      </p>
      <hr style="margin-top: 30px;">
      <p style="color: #999; font-size: 12px;">
        Ticket — Plataforma de venda de ingressos
      </p>
    </body>
    </html>
  `.trim();
}

/**
 * Build the password reset email HTML.
 *
 * @param params.email - The organizer's email address
 * @param params.resetUrl - Full URL to reset password (includes the raw token)
 */
export function buildPasswordResetEmail(params: {
  email: string;
  resetUrl: string;
}): string {
  const safeEmail = escapeHtml(params.email);
  const safeResetUrl = escapeHtml(params.resetUrl);

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">🔐 Redefinição de senha</h1>
      <p>Olá,</p>
      <p>Recebemos uma solicitação para redefinir a senha da conta <strong>${safeEmail}</strong>.</p>
      <p>Clique no botão abaixo para criar uma nova senha. Este link expira em <strong>1 hora</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
        <tr>
          <td style="background: #171717; border-radius: 6px; text-align: center;">
            <a href="${safeResetUrl}" style="display: inline-block; padding: 12px 24px; color: #fff; text-decoration: none; font-size: 16px; font-weight: 600;">
              Redefinir senha
            </a>
          </td>
        </tr>
      </table>
      <p style="color: #666; font-size: 14px;">
        Se você não solicitou esta redefinição, ignore este email. Nenhuma alteração será feita.
      </p>
      <p style="color: #666; font-size: 14px;">
        Link direto: <a href="${safeResetUrl}" style="color: #171717;">${safeResetUrl}</a>
      </p>
      <hr style="margin-top: 30px;">
      <p style="color: #999; font-size: 12px;">
        Ticket — Plataforma de venda de ingressos
      </p>
    </body>
    </html>
  `.trim();
}

/**
 * Build the order confirmation email HTML.
 *
 * @param params.attendeeName  - Display name for the greeting
 * @param params.orderReference - Short order reference (e.g., TCK-ABCD1234)
 * @param params.ticketUrls    - Full URLs to each ticket page (e.g., https://.../tickets/uuid)
 */
export function buildConfirmationEmail(params: {
  attendeeName: string;
  orderReference: string;
  ticketUrls: string[];
}): string {
  const safeName = escapeHtml(params.attendeeName);
  const safeReference = escapeHtml(params.orderReference);
  const ticketLinks = params.ticketUrls
    .map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`)
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">🎟️ Compra confirmada!</h1>
      <p>Olá <strong>${safeName}</strong>,</p>
      <p>Sua compra foi confirmada. Seus ingressos estão prontos!</p>
      <p><strong>Pedido:</strong> ${safeReference}</p>
      <h2 style="margin-top: 20px;">Seus ingressos</h2>
      <ul>${ticketLinks}</ul>
      <p style="margin-top: 20px; color: #666; font-size: 14px;">
        Apresente o QR code na entrada do evento.
      </p>
      <hr style="margin-top: 30px;">
      <p style="color: #999; font-size: 12px;">
        Ticket — Plataforma de venda de ingressos
      </p>
    </body>
    </html>
  `.trim();
}