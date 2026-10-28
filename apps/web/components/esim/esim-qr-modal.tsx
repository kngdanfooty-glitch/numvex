'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { EsimDetails } from '@numvexs/shared';
import { Icon } from '@/components/ui/icons';

/** The install window: the QR code to scan, and the same data for installing by hand. */
export function EsimQrModal({
  title,
  details,
  loading,
  onClose,
}: {
  title: string;
  details: EsimDetails | null | undefined;
  loading?: boolean;
  onClose: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  // The QR is drawn here from the activation string, unless the provider already gave a ready-made image.
  useEffect(() => {
    if (!details?.lpa) return setQr(null);
    let alive = true;
    QRCode.toDataURL(details.lpa, { width: 260, margin: 1 })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [details?.lpa]);

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const image = qr ?? details?.qrUrl ?? null;
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: 'SM-DP+ address', value: details?.smdp },
    { label: 'Activation code', value: details?.activationCode },
    { label: 'APN', value: details?.apn },
    { label: 'Data', value: details?.remainingData && details.totalData ? `${details.remainingData} left of ${details.totalData}` : null },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Your eSIM</h2>
            <p className="text-sm text-muted">{title}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="mt-4 overflow-y-auto">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted">Loading your eSIM…</p>
          ) : !details ? (
            <p className="rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted">
              Your eSIM is paid for, but the provider hasn't sent the install data yet. Close this and open it again from My eSIMs in a minute.
            </p>
          ) : (
            <>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="eSIM install QR code" width={260} height={260} className="mx-auto rounded-xl border border-border bg-white p-2" />
              ) : null}
              <p className="mt-3 text-center text-sm font-semibold">Scan this with your phone to install the eSIM.</p>

              {details.instructions ? <p className="mt-2 whitespace-pre-line text-center text-xs text-muted">{details.instructions}</p> : null}

              <dl className="mt-4 space-y-2 text-sm">
                {rows.filter((r) => r.value).map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">{r.label}</dt>
                      <dd className="truncate font-mono text-[13px] font-semibold">{r.value}</dd>
                    </div>
                    {r.label !== 'Data' && (
                      <button type="button" onClick={() => copy(r.label, r.value!)} className="shrink-0 text-xs font-bold text-accent">
                        {copied === r.label ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                ))}
              </dl>
              {details.lpa ? (
                <button type="button" onClick={() => copy('lpa', details.lpa!)} className="mt-3 w-full text-center text-xs font-bold text-accent">
                  {copied === 'lpa' ? 'Copied' : 'Copy the full activation string'}
                </button>
              ) : null}
            </>
          )}
        </div>

        <button type="button" onClick={onClose} className="mt-4 h-10 w-full rounded-lg bg-accent text-sm font-bold text-white">
          Done
        </button>
      </div>
    </div>
  );
}
