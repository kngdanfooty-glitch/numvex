import { Router } from 'express';
import * as wallet from '../services/wallet.service.js';

const router = Router();

/*
 * PocketFi tells us a transfer arrived. No sign-in here (PocketFi can't), so the signature IS the check: HMAC-SHA512 of the raw
 * body with our webhook secret, in the Pocketfi-Signature header. A wrong or missing one is refused before anything is read.
 * Once it passes we answer 200 quickly. A failure while crediting answers 500 so PocketFi retries (the reference makes a retry safe).
 */
router.post('/pocketfi', async (req, res) => {
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  // PocketFi's live calls carry the signature as `x-pocketfi-signature` and `pocketfi_signature` (seen in our own logs, 2026-10-09); the docs
  // say `Pocketfi-Signature`. Accept any of these names. The check is the same for all: HMAC-SHA512 of the raw body with our secret.
  const named = (name: string) => { const v = req.headers[name]; return Array.isArray(v) ? v[0] : v; };
  const candidates = ['x-pocketfi-signature', 'pocketfi_signature', 'pocketfi-signature', 'http_pocketfi_signature'].map(named).filter((v): v is string => !!v);
  const signature = candidates.find((v) => raw && wallet.signatureIsValid(raw, v)) ?? candidates[0];
  if (!raw || !wallet.signatureIsValid(raw, signature)) {
    // Say WHY in our logs (never the secret or the signature itself), so a misconfigured webhook can be found instead of failing in silence.
    const why = !raw ? 'no body' : !wallet.webhookSecretIsSet() ? 'POCKETFI_WEBHOOK_SECRET is not set on this server' : !signature ? 'no signature header (looked for x-pocketfi-signature, pocketfi_signature, pocketfi-signature)' : 'the signature does not match our secret (wrong secret, or the body was changed on the way)';
    // The NAMES of the headers that did arrive (never their values), so a signature sent under a different name can be spotted.
    console.error(`[wallet] webhook REFUSED (400): ${why}. content-type=${req.headers['content-type'] ?? 'none'} bytes=${raw?.length ?? 0} headers=${Object.keys(req.headers).sort().join(',')}`);
    res.status(400).json({ message: 'Invalid signature' });
    return;
  }
  try {
    const result = await wallet.handleDeposit(req.body);
    // Every outcome is logged once: credited, duplicate (a repeat), unmatched (kept for an admin) or ignored (not a payment message).
    if (result === 'credited') console.log('[wallet] webhook: deposit credited');
    else if (result === 'ignored') console.error(`[wallet] webhook ignored: not a payment we understand. top-level keys: ${Object.keys(req.body ?? {}).join(',') || 'none'}`);
    else console.log(`[wallet] webhook: ${result}`);
    res.status(200).json({ message: 'success' });
  } catch (err) {
    console.error('[wallet] could not credit a deposit (PocketFi will retry):', (err as Error).message);
    res.status(500).json({ message: 'error' });
  }
});

export default router;
