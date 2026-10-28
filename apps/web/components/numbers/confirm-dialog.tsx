'use client';

/** FloZap's "Before You Proceed" step: shown before the wallet is charged. */
const TIPS = [
  {
    title: 'VPN or proxy may be required',
    text: "If the code doesn't arrive, try a VPN or proxy whose location matches the number. Some services block SMS by region or IP.",
  },
  {
    title: 'Automatic refunds',
    text: 'Every code that does not arrive is refunded to your wallet.',
  },
  {
    title: 'The first attempt may fail',
    text: "Some numbers don't get a code first time. Cancel and pick another number, or switch server. This is normal.",
  },
  {
    title: 'Higher price, better success',
    text: 'Higher-priced numbers usually deliver more reliably.',
  },
  {
    title: 'We only provide the number',
    text: 'Our service ends once you receive the code. Bans or restrictions on the platform afterwards are between you and that platform.',
  },
];

export function ConfirmDialog({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="text-lg font-extrabold">Before you proceed</h2>
        <p className="text-sm text-muted">Please read this before activating your number.</p>

        <div className="mt-3 space-y-2 overflow-y-auto">
          {TIPS.map((t) => (
            <div key={t.title} className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-sm font-bold">{t.title}</p>
              <p className="text-sm leading-relaxed text-muted">{t.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="h-10 flex-1 rounded-lg bg-red-600 text-sm font-bold text-white hover:bg-red-700">
            Cancel
          </button>
          <button type="button" onClick={onContinue} className="h-10 flex-1 rounded-lg bg-accent text-sm font-bold text-white">
            Purchase
          </button>
        </div>
      </div>
    </div>
  );
}
