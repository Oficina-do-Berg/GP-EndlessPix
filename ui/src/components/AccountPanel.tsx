import { useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import { describeError } from '../api/client';
import { AppLang, TRANSLATIONS } from '../i18n/translations';
import { GoogleAccount } from '../types/upload';
import { validateOAuthToken } from '../utils/uploadLogic';

interface AccountPanelProps {
  accounts: GoogleAccount[];
  onConnectAccount: (token: string, email?: string) => Promise<{ email: string | null }>;
  onSetActiveAccount: (id: string) => Promise<void>;
  onRemoveAccount: (id: string) => Promise<void>;
  onOpenTokenModal: () => void;
  lang: AppLang;
}

export function AccountPanel({
  accounts,
  onConnectAccount,
  onSetActiveAccount,
  onRemoveAccount,
  onOpenTokenModal,
  lang,
}: AccountPanelProps) {
  const [token, setToken] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = TRANSLATIONS[lang].account;
  const tokenAuthT = TRANSLATIONS[lang].tokenAuth;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const validation = validateOAuthToken(token, emailInput, lang);
    if (!validation.valid || !validation.token) {
      setError(validation.error ?? 'Token inválido.');
      return;
    }

    setBusy(true);
    try {
      const result = await onConnectAccount(validation.token, validation.email);
      setToken('');
      setEmailInput('');
      setSuccessMsg(t.connectedSuccess(result.email ?? validation.email ?? 'Google'));
    } catch (err) {
      setError(describeError(err, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetActive(id: string) {
    setError(null);
    setSuccessMsg(null);
    try {
      await onSetActiveAccount(id);
    } catch (err) {
      setError(describeError(err, lang));
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    setSuccessMsg(null);
    try {
      await onRemoveAccount(id);
    } catch (err) {
      setError(describeError(err, lang));
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-9">
      {/* Connected accounts */}
      <section aria-labelledby="connected-accounts-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h1 id="connected-accounts-heading" className="text-lg font-semibold text-white">
            {t.title}
          </h1>
          <span className="text-xs tabular-nums text-zinc-500">
            {t.connectedCount(accounts.length)}
          </span>
        </div>

        <div className="mt-3 space-y-1">
          {accounts.length === 0 ? (
            <p className="py-5 text-sm text-zinc-500">{t.noneConnected}</p>
          ) : (
            accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-black px-4 py-3 ring-1 ring-white/[0.08]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-100">{acc.email}</p>
                  <p
                    className={`mt-0.5 flex items-center gap-1.5 text-xs ${
                      acc.active ? 'text-emerald-400' : 'text-zinc-500'
                    }`}
                  >
                    {acc.active && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                      />
                    )}
                    {acc.active ? t.activeForUpload : t.inactive}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {!acc.active && (
                    <button
                      type="button"
                      onClick={() => handleSetActive(acc.id)}
                      disabled={busy}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.06] px-2.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      {t.setActive}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(acc.id)}
                    disabled={busy}
                    aria-label={t.disconnectLabel(acc.email)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Connect another account */}
      <section aria-labelledby="connect-account-heading">
        <h2 id="connect-account-heading" className="text-sm font-semibold text-white">
          {t.connectHeading}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          {t.connectHelperBefore}{' '}
          <span className="text-zinc-300">oauth_token</span>{' '}
          {t.connectHelperAfter}
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-2.5">
          <div>
            <label htmlFor="account-email-input" className="sr-only">
              {t.emailLabel}
            </label>
            <input
              id="account-email-input"
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder={t.emailPlaceholder}
              className="h-10 w-full rounded-md bg-black px-3.5 text-sm text-white ring-1 ring-white/[0.08] placeholder:text-zinc-600 focus:outline-none focus:ring-white/25"
            />
          </div>

          <div className="relative">
            <label htmlFor="oauth-token-input" className="sr-only">
              {t.tokenLabel}
            </label>
            <input
              id="oauth-token-input"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t.tokenPlaceholder}
              autoComplete="off"
              className="h-10 w-full rounded-md bg-black pr-10 pl-3.5 text-sm text-white ring-1 ring-white/[0.08] placeholder:text-zinc-600 focus:outline-none focus:ring-white/25"
            />
            <button
              type="button"
              onClick={() => setShowToken((prev) => !prev)}
              aria-label={showToken ? t.hideToken : t.showToken}
              className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-zinc-500 transition-colors hover:text-white"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          {successMsg && (
            <p role="status" className="text-xs text-emerald-400">
              {successMsg}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1.5">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-wait disabled:opacity-60"
            >
              {t.connectBtn}
            </button>
            <button
              type="button"
              onClick={onOpenTokenModal}
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-white/[0.06] px-3.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {tokenAuthT.buttonLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
