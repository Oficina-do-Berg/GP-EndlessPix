import { useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { describeError } from '../api/client';
import { AppLang, TRANSLATIONS } from '../i18n/translations';
import { validateOAuthToken } from '../utils/uploadLogic';
import { BrandLogo } from './BrandLogo';

interface SignedOutViewProps {
  onReconnectDefault: () => Promise<void>;
  onConnectWithToken: (token: string, email?: string) => Promise<{ email: string | null }>;
  onOpenTokenModal: () => void;
  lang: AppLang;
  onLangChange: (lang: AppLang) => void;
}

export function SignedOutView({
  onReconnectDefault,
  onConnectWithToken,
  onOpenTokenModal,
  lang,
  onLangChange,
}: SignedOutViewProps) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = TRANSLATIONS[lang].signedOut;
  const tokenAuthT = TRANSLATIONS[lang].tokenAuth;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = validateOAuthToken(token, undefined, lang);
    if (!res.valid || !res.token) {
      setError(res.error ?? 'Token inválido.');
      return;
    }
    setBusy(true);
    try {
      await onConnectWithToken(res.token);
      setToken('');
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleReconnect() {
    setError(null);
    setBusy(true);
    try {
      await onReconnectDefault();
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={28} />
            <span className="text-[15px] font-semibold tracking-tight text-white">
              GP-EndlessPix
            </span>
          </div>

          <div
            role="group"
            aria-label={TRANSLATIONS[lang].nav.languageLabel}
            className="flex items-center gap-0.5 text-[11px]"
          >
            <button
              type="button"
              onClick={() => onLangChange('pt')}
              aria-pressed={lang === 'pt'}
              aria-label="Português"
              className={`h-7 rounded px-1.5 font-medium transition-colors ${
                lang === 'pt' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              PT
            </button>
            <span aria-hidden="true" className="text-zinc-700">
              /
            </span>
            <button
              type="button"
              onClick={() => onLangChange('en')}
              aria-pressed={lang === 'en'}
              aria-label="English"
              className={`h-7 rounded px-1.5 font-medium transition-colors ${
                lang === 'en' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <h1 className="mt-10 text-xl font-semibold tracking-tight text-white">
          {t.title}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          {t.subtitleBefore}{' '}
          <span className="text-zinc-200">oauth_token</span>{' '}
          {t.subtitleAfter}
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-2.5">
          <div>
            <label htmlFor="relogin-token" className="sr-only">
              Cookie oauth_token
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="relogin-token"
                type="password"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t.tokenPlaceholder}
                className="h-10 w-full rounded-md bg-black pr-3.5 pl-10 text-sm text-white ring-1 ring-white/[0.08] placeholder:text-zinc-600 focus:outline-none focus:ring-white/25"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {t.signInBtn}
          </button>
        </form>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={onOpenTokenModal}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white/[0.06] text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {tokenAuthT.buttonLabel}
          </button>
          <button
            type="button"
            onClick={handleReconnect}
            disabled={busy}
            className="flex h-9 w-full items-center justify-center rounded-md bg-white/[0.06] text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-60"
          >
            {t.reconnectBtn}
          </button>
        </div>
      </div>
    </main>
  );
}
