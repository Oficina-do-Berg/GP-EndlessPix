import { useEffect, useState } from 'react';
import {
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  X,
} from 'lucide-react';
import { describeError } from '../api/client';
import { AppLang, TRANSLATIONS } from '../i18n/translations';
import {
  GOOGLE_EMBEDDED_SETUP_URL,
  extractOAuthTokenFromText,
  validateOAuthToken,
} from '../utils/uploadLogic';

interface TokenAuthenticatorModalProps {
  open: boolean;
  onClose: () => void;
  onConnectToken: (token: string, email?: string) => Promise<{ email: string | null }>;
  lang: AppLang;
}

export function TokenAuthenticatorModal({
  open,
  onClose,
  onConnectToken,
  lang,
}: TokenAuthenticatorModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<'url' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleCopy(text: string, target: 'url') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      window.setTimeout(() => {
        setCopiedTarget((curr) => (curr === target ? null : curr));
      }, 1800);
    } catch {
      // Fallback: ignore if clipboard write blocked
    }
  }

  async function handlePasteFromClipboard() {
    setError(null);
    try {
      const clipText = await navigator.clipboard.readText();
      const extracted = extractOAuthTokenFromText(clipText);
      if (!extracted) {
        setError(t.tokenAuth.clipboardEmptyError);
        return;
      }
      setToken(extracted);
    } catch {
      setError(t.tokenAuth.clipboardDeniedError);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validation = validateOAuthToken(token, emailInput, lang);
    if (!validation.valid || !validation.token) {
      setError(validation.error ?? t.tokenAuth.clipboardEmptyError);
      return;
    }

    setSubmitting(true);
    try {
      await onConnectToken(validation.token, validation.email);
      setToken('');
      setEmailInput('');
      onClose();
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-auth-modal-title"
        className="animate-page-enter max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl bg-black p-5 ring-1 ring-white/[0.1] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="token-auth-modal-title"
              className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white"
            >
              <KeyRound className="h-4 w-4 text-zinc-500" />
              {t.tokenAuth.modalTitle}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {t.tokenAuth.modalSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.tokenAuth.closeLabel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          {/* Step 1 */}
          <section>
            <p className="text-xs font-semibold text-white">{t.tokenAuth.step1Title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {t.tokenAuth.step1Desc}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={GOOGLE_EMBEDDED_SETUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3.5 text-xs font-medium text-black transition-colors hover:bg-zinc-200"
              >
                <span>{t.tokenAuth.openGoogleBtn}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <button
                type="button"
                onClick={() => handleCopy(GOOGLE_EMBEDDED_SETUP_URL, 'url')}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.06] px-3 text-xs text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                {copiedTarget === 'url' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">{t.tokenAuth.copiedLabel}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>{t.tokenAuth.copyLinkBtn}</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Step 2 */}
          <section>
            <p className="text-xs font-semibold text-white">{t.tokenAuth.step2Title}</p>
            <ol className="mt-2.5 space-y-2 text-xs leading-relaxed text-zinc-400">
              {t.tokenAuth.step2Steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="w-3 shrink-0 text-right tabular-nums text-zinc-500">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">
              {t.tokenAuth.step2Hint}
            </p>
          </section>

          {/* Step 3: Paste & connect */}
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">{t.tokenAuth.step3Title}</p>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/[0.06] px-2.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                <ClipboardPaste className="h-3 w-3" />
                <span>{t.tokenAuth.pasteClipboardBtn}</span>
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              <div>
                <label htmlFor="modal-account-email" className="sr-only">
                  {t.account.emailLabel}
                </label>
                <input
                  id="modal-account-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={t.account.emailPlaceholder}
                  className="h-10 w-full rounded-md bg-black px-3.5 text-sm text-white ring-1 ring-white/[0.08] placeholder:text-zinc-600 focus:outline-none focus:ring-white/25"
                />
              </div>

              <div className="relative">
                <label htmlFor="modal-oauth-token" className="sr-only">
                  {t.account.tokenLabel}
                </label>
                <input
                  id="modal-oauth-token"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={t.account.tokenPlaceholder}
                  autoComplete="off"
                  className="h-10 w-full rounded-md bg-black pr-10 pl-3.5 text-sm text-white ring-1 ring-white/[0.08] placeholder:text-zinc-600 focus:outline-none focus:ring-white/25"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  aria-label={showToken ? t.account.hideToken : t.account.showToken}
                  className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-zinc-500 transition-colors hover:text-white"
                >
                  {showToken ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-400">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
                >
                  {t.tokenAuth.applyBtn}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
