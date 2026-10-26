import nodemailer from 'nodemailer';

// SMTP delivery. Disabled (and silently skipped) until SMTP_HOST is configured, so every
// caller can treat mail as fire-and-forget and fall back to handing links over manually.
export const mailEnabled = () => !!process.env.SMTP_HOST && process.env.MAIL_ENABLED !== 'false';

const from = () => process.env.MAIL_FROM || `WorkNovas <${process.env.SMTP_USER || 'no-reply@worknovas.local'}>`;
export const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

let transporter;
function transport() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Implicit TLS on 465; STARTTLS everywhere else.
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {})
    });
  }
  return transporter;
}

// Checked once at boot so a bad SMTP config is loud in the logs instead of at the first invite.
export async function verifyMailer() {
  if (!mailEnabled()) return console.log('[mail] disabled (set SMTP_HOST to enable)');
  try {
    await transport().verify();
    console.log(`[mail] ready via ${process.env.SMTP_HOST}`);
  } catch (e) {
    console.error('[mail] SMTP verify failed:', e.message);
  }
}

// Never throws: a failed email must not break the action that triggered it.
export async function sendMail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: 'no recipient' };
  if (!mailEnabled()) {
    console.log(`[mail] skipped (disabled) -> ${to}: ${subject}`);
    return { sent: false, reason: 'mail disabled' };
  }
  try {
    const info = await transport().sendMail({ from: from(), to, subject, html, text: text || stripTags(html) });
    console.log(`[mail] sent -> ${to}: ${subject}`);
    return { sent: true, messageId: info.messageId };
  } catch (e) {
    console.error(`[mail] failed -> ${to}: ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

const stripTags = html => String(html || '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|tr)>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Shared brand shell: inline styles only, since mail clients drop stylesheets.
export function layout(heading, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#334155">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0a192f;padding:20px 24px">
      <div style="font-size:16px;font-weight:700;color:#fff">WorkNovas</div>
      <div style="font-size:10px;letter-spacing:1.5px;color:#94a3b8;font-family:monospace">RECRUITMENT HUB</div>
    </td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 16px;font-size:17px;color:#0f172a">${esc(heading)}</h1>
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
      Sent automatically by WorkNovas. If you weren't expecting this email you can ignore it.
    </td></tr>
  </table>
</body></html>`;
}

export const p = text => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">${text}</p>`;
export const muted = text => `<p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:#94a3b8">${text}</p>`;

export const button = (label, href) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">${esc(label)}</a></p>` +
  muted(`Or paste this link into your browser:<br><span style="font-family:monospace;word-break:break-all;color:#64748b">${esc(href)}</span>`);

export const codeBlock = code =>
  `<p style="margin:20px 0;font-family:monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#0f172a;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center">${esc(code)}</p>`;

export { esc };
