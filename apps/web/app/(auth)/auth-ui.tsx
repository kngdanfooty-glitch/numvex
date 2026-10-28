'use client';

import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { AUTH_CODE_LENGTH } from '@numvexs/shared';
import { cn } from '@/lib/cn';

const SVG = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/* ---------- icon badge shown above the title ---------- */

export type AuthIconName = 'user' | 'mail' | 'lock' | 'key' | 'shield' | 'check';

const ICONS: Record<AuthIconName, React.ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3" />
    </>
  ),
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

export function AuthIcon({ name, tone }: { name: AuthIconName; tone?: 'ok' }) {
  return (
    <div className={cn('auth-icon', tone)} aria-hidden>
      <svg {...SVG}>{ICONS[name]}</svg>
    </div>
  );
}

/* ---------- alert ---------- */

export function AuthError({ message }: { message: string }) {
  return (
    <div className={cn('auth-error', message && 'visible')} role="alert">
      {message}
    </div>
  );
}

/* ---------- text field ---------- */

export function TextField({
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional ? <span className="optional">(optional)</span> : null}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...input} />
      {error ? <span className="field-error">{error}</span> : null}
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/* ---------- password field with show/hide toggle ---------- */

export function PasswordField({
  label,
  placeholder,
  value,
  onChange,
  autoComplete,
  disabled,
  error,
  showStrength,
  autoFocus,
  onBlur,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
  error?: string;
  showStrength?: boolean;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-wrap">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <button
          type="button"
          className={cn('password-toggle', show && 'visible')}
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((s) => !s)}
        >
          <svg className="eye-on" {...SVG}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <svg className="eye-off" {...SVG}>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>
      </div>
      {showStrength && value ? <StrengthMeter password={value} /> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

/** 0–4 score: length, mixed case, digit, symbol. */
export function passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return s;
}

const STRENGTH_LABEL = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

function StrengthMeter({ password }: { password: string }) {
  const level = password.length < 8 ? Math.min(passwordScore(password), 1) : passwordScore(password);
  return (
    <>
      <div className="strength" data-level={level} aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="field-hint">{STRENGTH_LABEL[level]} — use 8+ characters with a mix.</span>
    </>
  );
}

/* ---------- submit button with arrow / spinner ---------- */

export function SubmitButton({
  label,
  loading,
  type = 'submit',
  onClick,
  disabled,
}: {
  label: string;
  loading: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn('auth-btn', loading && 'loading')}
      disabled={loading || disabled}
    >
      <span>{label}</span>
      <svg className="btn-arrow" {...SVG}>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
      <svg className="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/* ---------- 6-box one-time code input ---------- */

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus = true,
  length = AUTH_CODE_LENGTH,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  length?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const commit = (next: string) => {
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const onInput = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '');
    if (!d) return;
    // Typing over a filled box, or autofill dumping the whole code, lands here.
    const next = (value.slice(0, i) + d).slice(0, length);
    commit(next);
    refs.current[Math.min(next.length, length - 1)]?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
      } else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const d = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!d) return;
    e.preventDefault();
    commit(d);
    refs.current[Math.min(d.length, length - 1)]?.focus();
  };

  return (
    <div className={cn('code-row', invalid && 'invalid')} role="group" aria-label="Verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          aria-label={`Digit ${i + 1}`}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={d}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
