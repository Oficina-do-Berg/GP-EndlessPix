import { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, Loader2, LogOut, UserCheck } from 'lucide-react';
import { AppLang, TRANSLATIONS } from '../i18n/translations';
import { AppTab, GoogleAccount } from '../types/upload';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  queueCount: number;
  activeAccount: GoogleAccount | null;
  onSignOut: () => void;
  onOpenTokenModal: () => void;
  lang: AppLang;
  onLangChange: (lang: AppLang) => void;
}

export function Header({
  activeTab,
  onTabChange,
  queueCount,
  activeAccount,
  onSignOut,
  onOpenTokenModal,
  lang,
  onLangChange,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  const navItems: { id: AppTab; label: string; isUploading?: boolean }[] = [
    {
      id: 'upload',
      label: queueCount > 0 ? `${t.nav.upload} (${queueCount})` : t.nav.upload,
      isUploading: queueCount > 0,
    },
    { id: 'history', label: t.nav.history },
    { id: 'account', label: t.nav.account },
  ];

  return (
    <header className="sticky top-0 z-30 bg-black/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-5 sm:gap-5 sm:px-6">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onTabChange('upload')}
          className="flex shrink-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <BrandLogo size={30} />
          <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-white">
            GP-EndlessPix
          </span>
        </button>

        {/* Desktop nav */}
        <nav aria-label={t.nav.mainNavLabel} className="hidden h-full items-center gap-6 sm:flex">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex h-full items-center gap-1.5 whitespace-nowrap text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.isUploading && (
                  <Loader2
                    aria-hidden="true"
                    className="h-3.5 w-3.5 animate-spin text-zinc-300"
                  />
                )}
                <span>{item.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-1/2 h-px w-6 -translate-x-1/2 bg-white"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Account actions */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenTokenModal}
            className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 lg:inline-flex"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">{t.tokenAuth.buttonLabel}</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={t.nav.accountMenuLabel}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <span className="hidden max-w-[170px] truncate md:inline">
                {activeAccount ? activeAccount.email : t.nav.connectShort}
              </span>
              <span className="md:hidden">{t.nav.accountShort}</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 rounded-lg bg-black p-1.5 shadow-2xl ring-1 ring-white/10"
              >
                {activeAccount && (
                  <div className="px-3 py-2">
                    <p className="text-[11px] text-zinc-500">{t.nav.activeAccount}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-200">
                      {activeAccount.email}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onTabChange('account');
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <UserCheck className="h-3.5 w-3.5 text-zinc-400" />
                  {t.nav.manageAccount}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenTokenModal();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <KeyRound className="h-3.5 w-3.5 text-zinc-400" />
                  {t.tokenAuth.buttonLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t.nav.signOut}
                </button>
              </div>
            )}
          </div>

          {/* PT / EN language switcher */}
          <div
            role="group"
            aria-label={t.nav.languageLabel}
            className="flex items-center gap-0.5 text-[11px]"
          >
            <button
              type="button"
              onClick={() => onLangChange('pt')}
              aria-pressed={lang === 'pt'}
              aria-label="Português"
              className={`h-7 rounded px-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
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
              className={`h-7 rounded px-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                lang === 'en' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav strip */}
      <nav
        aria-label={t.nav.mobileNavLabel}
        className="grid grid-cols-3 gap-1 px-4 pb-1 sm:hidden"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center justify-center gap-1.5 py-2.5 text-xs whitespace-nowrap transition-colors ${
                isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {item.isUploading && (
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin text-zinc-300" />
              )}
              <span>{item.label}</span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-1/2 h-px w-5 -translate-x-1/2 bg-white"
                />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
