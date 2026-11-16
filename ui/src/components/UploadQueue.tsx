import {
  AlertCircle,
  Check,
  Film,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { AppLang, TRANSLATIONS } from '../i18n/translations';
import { UploadQueueItem } from '../types/upload';
import {
  calculateUploadDetails,
  computeRemainingTransferBytes,
  formatBytes,
  formatEta,
  getQueueProgressView,
} from '../utils/uploadLogic';

interface UploadQueueProps {
  items: UploadQueueItem[];
  onTogglePause: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClearCompleted?: () => void;
  title?: string;
  lang: AppLang;
}

export function UploadQueue({
  items,
  onTogglePause,
  onRetry,
  onRemove,
  onClearCompleted,
  title,
  lang,
}: UploadQueueProps) {
  if (items.length === 0) return null;

  const t = TRANSLATIONS[lang].queue;
  const activeItems = items.filter(
    (i) => i.status === 'uploading' || i.status === 'queued' || i.status === 'paused',
  );
  const hasCompleted = items.some((i) => i.status === 'sent');

  const totalRemainingBytes = computeRemainingTransferBytes(activeItems);

  return (
    <section
      aria-label={t.sectionLabel}
      data-testid="upload-queue"
      className="mt-6 rounded-xl bg-black px-3 py-3 ring-1 ring-white/[0.08] sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1 pb-2 text-xs">
        <div className="flex items-center gap-2">
          {activeItems.length > 0 && (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-zinc-300" />
          )}
          <span className="font-medium text-zinc-200">
            {title ??
              t.uploadsTitle(activeItems.length > 0 ? activeItems.length : items.length)}
          </span>
          {activeItems.length > 0 && totalRemainingBytes > 0 && (
            <span className="tabular-nums text-zinc-500">
              · {t.remainingPrefix} {formatBytes(totalRemainingBytes, lang)}
            </span>
          )}
        </div>

        {hasCompleted && onClearCompleted && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="rounded px-1 text-zinc-500 transition-colors hover:text-zinc-200"
          >
            {t.clearCompleted}
          </button>
        )}
      </div>

      <ul>
        {items.map((item) => {
          const speedBps = item.speedBps ?? 0;
          const { uploadedBytes, remainingBytes, etaSeconds } = calculateUploadDetails(
            item.size,
            item.progress,
            speedBps,
          );
          const view = getQueueProgressView(item);

          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.06] text-zinc-500">
                  {item.previewUrl && item.mediaKind === 'image' ? (
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : item.mediaKind === 'video' ? (
                    <Film className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-[13px] text-zinc-100">{item.name}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                    {item.status === 'uploading' && !view.server && (
                      <>
                        {formatBytes(uploadedBytes, lang)} {t.of}{' '}
                        {formatBytes(item.size, lang)} · {t.remainingPrefix}{' '}
                        <span className="text-zinc-300">
                          {formatBytes(remainingBytes, lang)}
                        </span>
                        {speedBps > 0 && etaSeconds > 0 && (
                          <> · {formatEta(etaSeconds, lang)}</>
                        )}
                      </>
                    )}
                    {item.status === 'queued' && !view.server && (
                      <>
                        0 B {t.of} {formatBytes(item.size, lang)} · {t.waitingNote}
                      </>
                    )}
                    {item.status === 'queued' && view.server && (
                      <>
                        {formatBytes(item.size, lang)} · {t.serverQueuedNote}
                      </>
                    )}
                    {item.status === 'uploading' && view.server && (
                      <>
                        {formatBytes(item.size, lang)} · {t.serverUploadingNote}
                      </>
                    )}
                    {item.status === 'paused' && !view.server && (
                      <>
                        {t.pausedPrefix} · {t.remainingPrefix}{' '}
                        <span className="text-zinc-300">
                          {formatBytes(remainingBytes, lang)}
                        </span>{' '}
                        {t.of} {formatBytes(item.size, lang)}
                      </>
                    )}
                    {item.status === 'paused' && view.server && (
                      <>
                        {formatBytes(item.size, lang)} · {t.serverPausedNote}
                      </>
                    )}
                    {item.status === 'sent' && (
                      <>
                        {formatBytes(item.size, lang)} · {t.completedNote}
                      </>
                    )}
                    {item.status === 'error' && (
                      <span className="text-red-400">
                        {formatBytes(item.size, lang)} ·{' '}
                        {item.errorMessage ?? t.failedFallback}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                <div className="w-36 sm:w-44">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1.5 ${
                        item.status === 'error'
                          ? 'text-red-400'
                          : item.status === 'sent'
                            ? 'text-emerald-400'
                            : item.status === 'paused'
                              ? 'text-amber-400'
                              : 'text-zinc-300'
                      }`}
                    >
                      {item.status === 'uploading' && (
                        <>
                          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                          {view.server ? t.statusServerUploading : t.statusUploading}
                        </>
                      )}
                      {item.status === 'queued' &&
                        (view.server ? t.statusServerQueued : t.statusQueued)}
                      {item.status === 'paused' && t.statusPaused}
                      {item.status === 'sent' && (
                        <>
                          <Check className="h-3 w-3" />
                          {t.statusSent}
                        </>
                      )}
                      {item.status === 'error' && (
                        <>
                          <AlertCircle className="h-3 w-3" />
                          {t.statusError}
                        </>
                      )}
                    </span>
                    <span className="tabular-nums text-zinc-400">
                      {view.showPercent ? `${item.progress}%` : '—'}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.09]">
                    {view.indeterminate ? (
                      <div className="h-full w-1/3 animate-progress-slide rounded-full bg-zinc-300" />
                    ) : (
                      <div
                        className={`h-full transition-[width] duration-150 ease-out ${
                          item.status === 'error'
                            ? 'bg-red-500'
                            : item.status === 'sent'
                              ? 'bg-emerald-400'
                              : item.status === 'paused'
                                ? 'bg-amber-400'
                                : 'bg-zinc-200'
                        }`}
                        style={{ width: `${view.barPercent}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  {(item.status === 'uploading' || item.status === 'paused') &&
                    item.pausable !== false && (
                    <button
                      type="button"
                      onClick={() => onTogglePause(item.id)}
                      aria-label={
                        item.status === 'paused'
                          ? t.resumeLabel(item.name)
                          : t.pauseLabel(item.name)
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      {item.status === 'paused' ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Pause className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}

                  {item.status === 'error' && (
                    <button
                      type="button"
                      onClick={() => onRetry(item.id)}
                      aria-label={t.retryLabel(item.name)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label={t.removeLabel(item.name)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
