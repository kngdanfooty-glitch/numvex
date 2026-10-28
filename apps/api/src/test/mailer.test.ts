import { afterEach, describe, expect, it, vi } from 'vitest';

// The mail settings are read once when the mailer is loaded, so each test sets them first and loads it fresh.
const load = async (env: Record<string, string>) => {
  vi.resetModules();
  const sendMail = vi.fn().mockResolvedValue({});
  const createTransport = vi.fn(() => ({ sendMail }));
  vi.doMock('nodemailer', () => ({ default: { createTransport } }));
  Object.assign(process.env, env);
  const { sendCodeEmail } = await import('../lib/mailer.js');
  return { sendCodeEmail, sendMail, createTransport };
};

afterEach(() => {
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']) delete process.env[k];
  process.env.SMTP_HOST = '';
  vi.doUnmock('nodemailer');
  vi.restoreAllMocks();
});

describe('mailer', () => {
  it('with no SMTP server it prints the code instead of sending', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sendCodeEmail, createTransport } = await load({ SMTP_HOST: '' });
    await sendCodeEmail('a@x.com', 'verify_email', '123456', 10);
    expect(createTransport).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).toContain('123456');
  });

  it('sends over SMTP from the configured mailbox, with the code in both text and html', async () => {
    const { sendCodeEmail, sendMail, createTransport } = await load({ SMTP_HOST: 'mail.example.com', SMTP_PORT: '465', SMTP_USER: 'no-reply@example.com', SMTP_PASS: 'pw', EMAIL_FROM: 'NumVex <no-reply@example.com>' });
    await sendCodeEmail('ada@x.com', 'reset_password', '654321', 15);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'mail.example.com', port: 465, secure: true, auth: { user: 'no-reply@example.com', pass: 'pw' } }));
    const msg = sendMail.mock.calls[0]![0];
    expect(msg).toMatchObject({ from: 'NumVex <no-reply@example.com>', to: 'ada@x.com', subject: 'Your NumVex password reset code' });
    expect(msg.text).toContain('654321');
    expect(msg.html).toContain('654321');
  });

  it('port 587 uses STARTTLS (secure false) unless told otherwise', async () => {
    const { createTransport, sendCodeEmail } = await load({ SMTP_HOST: 'mail.example.com', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p' });
    await sendCodeEmail('a@x.com', 'verify_email', '111111', 10);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });

  it('a mail server error is passed up, so sign-up can say it failed', async () => {
    const { sendCodeEmail, sendMail } = await load({ SMTP_HOST: 'mail.example.com', SMTP_USER: 'u', SMTP_PASS: 'p' });
    sendMail.mockRejectedValueOnce(new Error('535 bad login'));
    await expect(sendCodeEmail('a@x.com', 'verify_email', '111111', 10)).rejects.toThrow('535 bad login');
  });
});
