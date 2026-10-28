import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export type CodePurpose = 'verify_email' | 'reset_password';

const COPY: Record<CodePurpose, { subject: string; intro: string }> = {
  verify_email: {
    subject: 'Your NumVex verification code',
    intro: 'Use this code to verify your email address:',
  },
  reset_password: {
    subject: 'Your NumVex password reset code',
    intro: 'Use this code to reset your password:',
  },
};

// Only create the mail connection if an SMTP server is configured.
const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000, // a dead mail server must not hang sign-up for minutes
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

/**
 * Email someone their 6-digit code.
 * In development there's no mail server, so we just PRINT the code in the terminal.
 */
export async function sendCodeEmail(to: string, purpose: CodePurpose, code: string, minutes: number) {
  if (!transport) {
    console.log(`\n[email -> ${to}] ${purpose} code: ${code}  (valid ${minutes} min)\n`);
    return;
  }

  const { subject, intro } = COPY[purpose];
  await transport.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    text: `${intro} ${code}\nIt expires in ${minutes} minutes. If you didn't ask for this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:420px">
        <p>${intro}</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
        <p>It expires in ${minutes} minutes. If you didn't ask for this, ignore this email.</p>
      </div>`,
  });
}
