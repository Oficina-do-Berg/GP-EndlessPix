import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Film,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { AppLang, TRANSLATIONS } from '../i18n/translations';
import { HistoryItem, UploadQueueItem } from '../types/upload';
import { filterHistory, formatBytes, formatTimestamp } from '../utils/uploadLogic';
import { UploadQueue } from './UploadQueue';

interface HistoryPanelProps {
  items: HistoryItem[];
  activeQueue: UploadQueueItem[];
  onTogglePauseQueue: (id: string) => void;
  onRetryQueue: (id: string) => void;
  onRemoveQueue: (id: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onRemoveItem: (id: string) => void;
  onRetryItem: (item: HistoryItem) => void;
  onClearHistory: () => void;
  lang: AppLang;
}

export function HistoryPanel({
  items,
  activeQueue,
  onTogglePauseQueue,
  onRetryQueue,
  onRemoveQueue,
  onRefresh,
  isRefreshing,
  onRemoveItem,
  onRetryItem,
  onClearHistory,
  lang,
}: HistoryPanelProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'error'>('all');
  const t = TRANSLATIONS[lang].history;
  const qt = TRANSLATIONS[lang].queue;
  const ft = TRANSLATIONS[lang].footer;

  const filtered = filterHistory(items, query, statusFilter);
  const sentCount = items.filter((i) => i.status === 'sent').length;
  const totalBytes = items
    .filter((i) => i.status === 'sent')
    .reduce((acc, i) => acc + i.size, 0);

  const inProgressQueue = activeQueue.filter(
    (i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'paused',
  );

  return (
    <section aria-labelledby="history-heading" className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 id="history-heading" className="text-lg font-semibold text-white">
              {t.title}
            </h1>
            {inProgressQueue.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                {t.uploadingBadge(inProgressQueue.length)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
            {ft.sentCount(sentCount)} · {formatBytes(totalBytes, lang)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-white/[0.06] px-3 text-xs text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t.refresh}
          </button>

          {items.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex h-8 items-center whitespace-nowrap rounded-md bg-white/[0.06] px-3 text-xs text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-red-400"
            >
              {t.clear}
            </button>
          )}
        </div>
      </div>

      {/* Live in-progress uploads visible directly on History page */}
      {inProgressQueue.length > 0 && (
        <UploadQueue
          items={inProgressQueue}
          onTogglePause={onTogglePauseQueue}
          onRetry={onRetryQueue}
          onRemove={onRemoveQueue}
          title={qt.inProgressTitle(inProgressQueue.length)}
          lang={lang}
        />
      )}

      {/* Search & filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <label htmlFor="history-search" className="sr-only">
            {t.searchLabel}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="h-9 w-full rounded-md bg-black pr-3 pl-9 text-xs text-zinc-100 ring-1 ring-white/[0.08] placeholder:text-zinc-600 focus:outline-none focus:ring-white/25"
          />
        </div>

        <div
          role="group"
          aria-label={t.filterGroupLabel}
          className="inline-flex items-center gap-0.5 self-start rounded-md bg-black p-0.5 ring-1 ring-white/[0.08] sm:self-auto"
        >
          {(
            [
              { key: 'all', label: t.filterAll },
              { key: 'sent', label: t.filterSent },
              { key: 'error', label: t.filterError },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setStatusFilter(opt.key)}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs transition-colors ${
                statusFilter === opt.key
                  ? 'bg-white/[0.12] font-medium text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* History list */}
      <div className="mt-3">
        {isRefreshing ? (
          <div className="space-y-1" aria-busy="true">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between rounded-lg px-2 py-3.5"
              >
                <div className="space-y-2">
                  <div className="h-3.5 w-48 animate-pulse rounded bg-white/[0.08]" />
                  <div className="h-3 w-32 animate-pulse rounded bg-white/[0.05]" />
                </div>
                <div className="h-3.5 w-14 animate-pulse rounded bg-white/[0.08]" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-zinc-400">
              {items.length === 0 ? t.emptyAll : t.emptyFiltered}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-500">
                    {item.mediaKind === 'video' ? (
                      <Film className="h-3.5 w-3.5" />
                    ) : (
                      <ImageIcon className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-zinc-100">{item.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs tabular-nums text-zinc-500">
                      <span>{formatBytes(item.size, lang)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimestamp(item.timestamp, lang)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${
                      item.status === 'sent' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {item.status === 'sent' ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        {t.sentStatus}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3.5 w-3.5" />
                        {t.errorStatus}
                      </>
                    )}
                  </span>

                  {item.status === 'error' && item.retryable !== false && (
                    <button
                      type="button"
                      onClick={() => onRetryItem(item)}
                      aria-label={t.retryLabel(item.name)}
                      className="flex h-7 items-center gap-1 rounded-md bg-white/[0.06] px-2.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t.retry}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={t.removeLabel(item.name)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
