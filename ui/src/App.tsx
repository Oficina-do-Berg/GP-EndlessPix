import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import {
  type ApiJob,
  type ApiJobStatus,
  addAccount,
  cancelJob,
  clearHistory,
  deleteHistoryItem,
  describeError,
  listAccounts,
  listJobs,
  pauseJob,
  removeAccount,
  resumeJob,
  retryJob,
  selectAccount,
  uploadJob,
} from './api/client';
import { AccountPanel } from './components/AccountPanel';
import { Header } from './components/Header';
import { HistoryPanel } from './components/HistoryPanel';
import { SignedOutView } from './components/SignedOutView';
import { TokenAuthenticatorModal } from './components/TokenAuthenticatorModal';
import { UploadDropzone } from './components/UploadDropzone';
import { UploadQueue } from './components/UploadQueue';
import { AppLang, TRANSLATIONS } from './i18n/translations';
import { AppTab, GoogleAccount, HistoryItem, UploadQueueItem } from './types/upload';
import {
  computeMetrics,
  detectMediaKind,
  formatBytes,
  formatMaxSize,
  validateUploadFile,
} from './utils/uploadLogic';

const STORAGE_KEYS = {
  lang: 'photosweb_lang_v1',
};

const MAX_PARALLEL_UPLOADS = 2;
const DEFAULT_MAX_UPLOAD_MB = 4096;

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function createId(): string {
  try {
    return window.crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function mapAccounts(rows: { email: string; active: boolean }[]): GoogleAccount[] {
  const now = Date.now();
  return rows.map((row) => ({
    id: row.email,
    email: row.email,
    active: row.active,
    connectedAt: now,
  }));
}

function jobToQueueStatus(status: ApiJobStatus): UploadQueueItem['status'] {
  if (status === 'success') return 'sent';
  if (status === 'error' || status === 'cancelled') return 'error';
  return status;
}

function jobToQueueItem(job: ApiJob): UploadQueueItem {
  const status = jobToQueueStatus(job.status);
  return {
    id: job.id,
    jobId: job.id,
    name: job.original_name,
    size: job.size,
    mimeType:
      detectMediaKind(job.original_name) === 'video'
        ? 'video/mp4'
        : 'image/jpeg',
    mediaKind: detectMediaKind(job.original_name),
    // Todo job no servidor já recebeu o arquivo do navegador. O progresso do
    // gotohp não é percentual, então a UI mostra uma fase indeterminada.
    progress: 100,
    status,
    attempts: job.attempts,
    errorMessage: job.error ?? undefined,
    addedAt: parseTimestamp(job.created_at),
    accountEmail: job.account ?? '',
    pausable: job.status === 'queued' || job.status === 'paused',
  };
}

function jobToHistoryItem(job: ApiJob): HistoryItem {
  return {
    id: job.id,
    name: job.original_name,
    size: job.size,
    mediaKind: detectMediaKind(job.original_name),
    status: job.status === 'success' ? 'sent' : 'error',
    attempts: job.attempts,
    timestamp: parseTimestamp(job.updated_at),
    accountEmail: job.account ?? '',
    errorMessage: job.error ?? undefined,
    retryable: job.retryable,
  };
}

export default function App() {
  const [lang, setLang] = useState<AppLang>(() =>
    loadStored<AppLang>(STORAGE_KEYS.lang, 'pt'),
  );
  const [activeTab, setActiveTab] = useState<AppTab>('upload');
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [maxUploadMb, setMaxUploadMb] = useState(DEFAULT_MAX_UPLOAD_MB);
  const [uploadTick, setUploadTick] = useState(0);

  const queueRef = useRef<UploadQueueItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  const abortRef = useRef<Map<string, () => void>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const pauseAbortsRef = useRef<Set<string>>(new Set());
  const removeAbortsRef = useRef<Set<string>>(new Set());
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const activeUploadsRef = useRef(0);

  const t = TRANSLATIONS[lang];

  const mutateQueue = useCallback(
    (updater: (previous: UploadQueueItem[]) => UploadQueueItem[]) => {
      const next = updater(queueRef.current);
      queueRef.current = next;
      setQueue(next);
      return next;
    },
    [],
  );

  const revokePreview = useCallback((url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrlsRef.current.delete(url);
  }, []);

  const setError = useCallback((message: string) => {
    setValidationErrors([message]);
  }, []);

  useEffect(() => {
    document.title = t.pageTitle;
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    try {
      localStorage.setItem(STORAGE_KEYS.lang, JSON.stringify(lang));
    } catch {
      // Ignore storage quota errors
    }
  }, [lang, t.pageTitle]);

  useEffect(() => {
    const abortMap = abortRef.current;
    const previews = previewUrlsRef.current;
    return () => {
      abortMap.forEach((abort) => abort());
      previews.forEach((url) => URL.revokeObjectURL(url));
      previews.clear();
    };
  }, []);

  const activeAccount = useMemo(
    () => accounts.find((acc) => acc.active) ?? accounts[0] ?? null,
    [accounts],
  );

  const metrics = useMemo(() => computeMetrics(queue, history), [queue, history]);

  const refreshAccounts = useCallback(async (): Promise<GoogleAccount[]> => {
    const data = await listAccounts();
    const mapped = mapAccounts(data.accounts);
    setDryRun(data.dry_run);
    setAccounts(mapped);
    if (data.error) {
      setError(data.error);
    }
    return mapped;
  }, [setError]);

  const applyJobs = useCallback(
    (jobs: ApiJob[]) => {
      const jobMap = new Map(jobs.map((job) => [job.id, job]));

      mutateQueue((previous) => {
        const seen = new Set<string>();
        const reconciled = previous.map((item) => {
          if (!item.jobId) return item;
          const job = jobMap.get(item.jobId);
          if (!job) return item;
          seen.add(job.id);
          const status = jobToQueueStatus(job.status);
          return {
            ...item,
            status,
            attempts: job.attempts,
            errorMessage: job.error ?? undefined,
            accountEmail: job.account ?? item.accountEmail,
            progress: 100,
            pausable: job.status === 'queued' || job.status === 'paused',
          };
        });

        const added = jobs
          .filter(
            (job) =>
              (job.status === 'queued' ||
                job.status === 'uploading' ||
                job.status === 'paused') &&
              !seen.has(job.id),
          )
          .map(jobToQueueItem);

        return [...reconciled, ...added];
      });

      setHistory(
        jobs
          .filter((job) => job.status === 'success' || job.status === 'error')
          .map(jobToHistoryItem),
      );
    },
    [mutateQueue],
  );

  const refreshJobs = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setIsRefreshing(true);
      try {
        const data = await listJobs(100);
        if (typeof data.server.max_upload_mb === 'number') {
          setMaxUploadMb(data.server.max_upload_mb);
        }
        setDryRun(data.server.dry_run);
        applyJobs(data.jobs);
      } finally {
        if (showSpinner) setIsRefreshing(false);
      }
    },
    [applyJobs],
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        await Promise.all([refreshAccounts(), refreshJobs()]);
      } catch (error) {
        if (alive) {
          setError(describeError(error, 'pt'));
        }
      } finally {
        if (alive) setBootstrapped(true);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [refreshAccounts, refreshJobs, setError]);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const data = await listJobs(100);
        if (stopped) return;
        if (typeof data.server.max_upload_mb === 'number') {
          setMaxUploadMb(data.server.max_upload_mb);
        }
        setDryRun(data.server.dry_run);
        applyJobs(data.jobs);
      } catch {
        // Polling errors are transient; the next tick tries again.
      }
    }

    const timer = window.setInterval(poll, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [applyJobs]);

  const startUpload = useCallback(
    (item: UploadQueueItem) => {
      const file = filesRef.current.get(item.id);
      if (!file || inFlightRef.current.has(item.id)) return;

      const current = queueRef.current.find((entry) => entry.id === item.id);
      if (!current || current.status !== 'queued' || current.jobId) return;

      inFlightRef.current.add(item.id);
      activeUploadsRef.current += 1;

      mutateQueue((previous) =>
        previous.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: 'uploading',
                progress: Math.max(entry.progress, 1),
                errorMessage: undefined,
                pausable: true,
              }
            : entry,
        ),
      );

      const controller = new AbortController();
      abortRef.current.set(item.id, () => controller.abort());

      uploadJob(
        file,
        file.lastModified,
        ({ percent, speedBps }) => {
          const progress = Math.max(0, Math.min(100, Math.round(percent)));
          mutateQueue((previous) =>
            previous.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    progress: Math.max(entry.progress, progress),
                    speedBps: speedBps > 0 ? speedBps : entry.speedBps,
                  }
                : entry,
            ),
          );
        },
        controller.signal,
      )
        .then((job) => {
          filesRef.current.delete(item.id);
          mutateQueue((previous) =>
            previous.map((entry) => {
              if (entry.id !== item.id) return entry;
              const status = jobToQueueStatus(job.status);
              return {
                ...entry,
                jobId: job.id,
                status,
                attempts: job.attempts,
                progress: 100,
                errorMessage: job.error ?? undefined,
                accountEmail: job.account ?? entry.accountEmail,
                pausable: status === 'queued' || status === 'paused',
              };
            }),
          );
          void refreshJobs().catch(() => undefined);
        })
        .catch((error) => {
          if (isAbortError(error)) {
            const paused = pauseAbortsRef.current.delete(item.id);
            const removed = removeAbortsRef.current.delete(item.id);
            if (paused) {
              mutateQueue((previous) =>
                previous.map((entry) =>
                  entry.id === item.id
                    ? {
                        ...entry,
                        status: 'paused',
                        pausable: true,
                        errorMessage: undefined,
                      }
                    : entry,
                ),
              );
            } else if (!removed) {
              mutateQueue((previous) =>
                previous.map((entry) =>
                  entry.id === item.id
                    ? {
                        ...entry,
                        status: 'error',
                        pausable: false,
                        errorMessage: describeError(error, lang),
                      }
                    : entry,
                ),
              );
            }
          } else {
            mutateQueue((previous) =>
              previous.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      status: 'error',
                      pausable: false,
                      errorMessage: describeError(error, lang),
                    }
                  : entry,
              ),
            );
          }
        })
        .finally(() => {
          inFlightRef.current.delete(item.id);
          activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
          abortRef.current.delete(item.id);
          setUploadTick((value) => value + 1);
        });
    },
    [lang, mutateQueue, refreshJobs],
  );

  useEffect(() => {
    if (!activeAccount && !dryRun) return;
    const available = MAX_PARALLEL_UPLOADS - activeUploadsRef.current;
    if (available <= 0) return;

    const candidates = queueRef.current
      .filter(
        (item) =>
          item.status === 'queued' &&
          !item.jobId &&
          filesRef.current.has(item.id) &&
          !inFlightRef.current.has(item.id),
      )
      .slice(0, available);

    candidates.forEach(startUpload);
  }, [queue, uploadTick, activeAccount, dryRun, startUpload]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (!activeAccount && !dryRun) {
        setError(t.dropzone.needAccountError);
        return;
      }

      const errors: string[] = [];
      const newItems: UploadQueueItem[] = [];
      const maxBytes = maxUploadMb * 1024 * 1024;

      files.forEach((file) => {
        const check = validateUploadFile(
          {
            name: file.name,
            size: file.size,
            type: file.type,
          },
          lang,
          maxBytes,
        );

        if (!check.valid) {
          errors.push(`${file.name}: ${check.reason}`);
          return;
        }

        let previewUrl: string | undefined;
        if (check.mediaKind === 'image') {
          try {
            previewUrl = URL.createObjectURL(file);
            previewUrlsRef.current.add(previewUrl);
          } catch {
            previewUrl = undefined;
          }
        }

        const id = createId();
        filesRef.current.set(id, file);
        newItems.push({
          id,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          mediaKind: check.mediaKind,
          progress: 0,
          status: 'queued',
          attempts: 0,
          previewUrl,
          addedAt: Date.now(),
          accountEmail: activeAccount?.email ?? 'dry-run',
          pausable: true,
        });
      });

      setValidationErrors(errors);
      if (newItems.length > 0) {
        mutateQueue((previous) => [...newItems, ...previous]);
      }
    },
    [activeAccount, dryRun, lang, maxUploadMb, mutateQueue, setError, t.dropzone.needAccountError],
  );

  const dropQueueItem = useCallback(
    (id: string) => {
      const target = queueRef.current.find((item) => item.id === id);
      revokePreview(target?.previewUrl);
      filesRef.current.delete(id);
      abortRef.current.delete(id);
      mutateQueue((previous) => previous.filter((item) => item.id !== id));
      setUploadTick((value) => value + 1);
    },
    [mutateQueue, revokePreview],
  );

  const handleTogglePause = useCallback(
    async (id: string) => {
      const item = queueRef.current.find((entry) => entry.id === id);
      if (!item) return;

      try {
        if (item.status === 'paused') {
          if (item.jobId) {
            const response = await resumeJob(item.jobId);
            const status = jobToQueueStatus(response.job.status);
            mutateQueue((previous) =>
              previous.map((entry) =>
                entry.id === id
                  ? {
                      ...entry,
                      status,
                      progress: 100,
                      errorMessage: undefined,
                      pausable: status === 'queued' || status === 'paused',
                    }
                  : entry,
              ),
            );
          } else {
            if (!filesRef.current.has(id)) {
              mutateQueue((previous) =>
                previous.map((entry) =>
                  entry.id === id
                    ? {
                        ...entry,
                        status: 'error',
                        pausable: false,
                        errorMessage:
                          lang === 'en'
                            ? 'The file is no longer available to resume.'
                            : 'O arquivo não está mais disponível para retomar.',
                      }
                    : entry,
                ),
              );
              return;
            }
            mutateQueue((previous) =>
              previous.map((entry) =>
                entry.id === id
                  ? {
                      ...entry,
                      status: 'queued',
                      progress: 0,
                      errorMessage: undefined,
                      pausable: true,
                    }
                  : entry,
              ),
            );
            setUploadTick((value) => value + 1);
          }
          return;
        }

        if (item.status === 'uploading') {
          if (item.jobId || !abortRef.current.has(id)) {
            setError(
              lang === 'en'
                ? 'This upload already started on the server and cannot be paused.'
                : 'Este envio já começou no servidor e não pode ser pausado.',
            );
            return;
          }
          pauseAbortsRef.current.add(id);
          abortRef.current.get(id)?.();
          return;
        }

        if (item.status === 'queued') {
          if (item.jobId) {
            await pauseJob(item.jobId);
            mutateQueue((previous) =>
              previous.map((entry) =>
                entry.id === id
                  ? {
                      ...entry,
                      status: 'paused',
                      pausable: true,
                      errorMessage: undefined,
                    }
                  : entry,
              ),
            );
          } else {
            mutateQueue((previous) =>
              previous.map((entry) =>
                entry.id === id
                  ? {
                      ...entry,
                      status: 'paused',
                      pausable: true,
                      errorMessage: undefined,
                    }
                  : entry,
              ),
            );
          }
        }
      } catch (error) {
        setError(describeError(error, lang));
      }
    },
    [lang, mutateQueue, setError],
  );

  const handleRetryQueueItem = useCallback(
    async (id: string) => {
      const item = queueRef.current.find((entry) => entry.id === id);
      if (!item) return;

      setValidationErrors([]);

      if (item.jobId) {
        try {
          const response = await retryJob(item.jobId);
          const status = jobToQueueStatus(response.job.status);
          mutateQueue((previous) =>
            previous.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    status,
                    progress: 100,
                    attempts: response.job.attempts,
                    errorMessage: undefined,
                    pausable: status === 'queued' || status === 'paused',
                  }
                : entry,
            ),
          );
          void refreshJobs().catch(() => undefined);
          return;
        } catch (error) {
          if (!filesRef.current.has(id)) {
            setError(describeError(error, lang));
            return;
          }
        }
      }

      if (!filesRef.current.has(id)) {
        setError(
          lang === 'en'
            ? 'The file is no longer available for another attempt.'
            : 'O arquivo não está mais disponível para uma nova tentativa.',
        );
        return;
      }

      mutateQueue((previous) =>
        previous.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                jobId: undefined,
                status: 'queued',
                progress: 0,
                attempts: entry.attempts + 1,
                errorMessage: undefined,
                pausable: true,
              }
            : entry,
        ),
      );
      setUploadTick((value) => value + 1);
    },
    [lang, mutateQueue, refreshJobs, setError],
  );

  const handleRemoveQueueItem = useCallback(
    async (id: string) => {
      const item = queueRef.current.find((entry) => entry.id === id);
      if (!item) return;

      if (
        item.jobId &&
        (item.status === 'queued' ||
          item.status === 'paused' ||
          item.status === 'uploading')
      ) {
        try {
          await cancelJob(item.jobId);
        } catch (error) {
          setError(describeError(error, lang));
          return;
        }
      }

      if (item.status === 'uploading' && !item.jobId) {
        removeAbortsRef.current.add(id);
        abortRef.current.get(id)?.();
      }

      dropQueueItem(id);

      if (item.jobId) {
        void refreshJobs().catch(() => undefined);
      }
    },
    [dropQueueItem, lang, refreshJobs, setError],
  );

  const handleClearCompleted = useCallback(() => {
    queueRef.current
      .filter((item) => item.status === 'sent')
      .forEach((item) => revokePreview(item.previewUrl));
    mutateQueue((previous) => previous.filter((item) => item.status !== 'sent'));
  }, [mutateQueue, revokePreview]);

  const handleRefreshHistory = useCallback(async () => {
    try {
      await refreshJobs(true);
    } catch (error) {
      window.alert(describeError(error, lang));
    }
  }, [lang, refreshJobs]);

  const handleRemoveHistoryItem = useCallback(
    async (id: string) => {
      try {
        await deleteHistoryItem(id);
        await refreshJobs();
      } catch (error) {
        window.alert(describeError(error, lang));
      }
    },
    [lang, refreshJobs],
  );

  const handleRetryHistoryItem = useCallback(
    async (item: HistoryItem) => {
      try {
        await retryJob(item.id);
        setActiveTab('upload');
        await refreshJobs();
      } catch (error) {
        window.alert(describeError(error, lang));
      }
    },
    [lang, refreshJobs],
  );

  const handleClearHistory = useCallback(async () => {
    try {
      await clearHistory();
      await refreshJobs();
    } catch (error) {
      window.alert(describeError(error, lang));
    }
  }, [lang, refreshJobs]);

  const handleConnectAccount = useCallback(
    async (token: string, email?: string) => {
      const result = await addAccount(token, email);
      await refreshAccounts();
      await refreshJobs();
      return { email: result.email };
    },
    [refreshAccounts, refreshJobs],
  );

  const handleSetActiveAccount = useCallback(
    async (id: string) => {
      const account = accounts.find((entry) => entry.id === id);
      if (!account) return;
      await selectAccount(account.email);
      await refreshAccounts();
    },
    [accounts, refreshAccounts],
  );

  const handleRemoveAccount = useCallback(
    async (id: string) => {
      const account = accounts.find((entry) => entry.id === id);
      if (!account) return;
      await removeAccount(account.email);
      await refreshAccounts();
      await refreshJobs();
    },
    [accounts, refreshAccounts, refreshJobs],
  );

  const handleSignOut = useCallback(() => {
    window.location.assign('/logout');
  }, []);

  const handleReconnect = useCallback(async () => {
    const rows = await refreshAccounts();
    await refreshJobs();
    if (rows.length === 0) {
      throw new Error(t.signedOut.reconnectEmpty);
    }
  }, [refreshAccounts, refreshJobs, t.signedOut.reconnectEmpty]);

  const maxSizeLabel = t.dropzone.maxSize(formatMaxSize(maxUploadMb, lang));

  if (!bootstrapped) {
    return <div className="min-h-screen bg-black" />;
  }

  if (!dryRun && accounts.length === 0) {
    return (
      <>
        <SignedOutView
          lang={lang}
          onLangChange={setLang}
          onOpenTokenModal={() => setIsTokenModalOpen(true)}
          onReconnectDefault={handleReconnect}
          onConnectWithToken={handleConnectAccount}
        />
        <TokenAuthenticatorModal
          open={isTokenModalOpen}
          onClose={() => setIsTokenModalOpen(false)}
          onConnectToken={handleConnectAccount}
          lang={lang}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        queueCount={metrics.queued}
        activeAccount={activeAccount}
        onSignOut={handleSignOut}
        onOpenTokenModal={() => setIsTokenModalOpen(true)}
        lang={lang}
        onLangChange={setLang}
      />

      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-10">
        <div key={activeTab} className="animate-page-enter">
          {activeTab === 'upload' && (
            <div className="mx-auto max-w-3xl">
              <UploadDropzone
                activeEmail={activeAccount?.email ?? null}
                onFilesSelected={handleFilesSelected}
                onOpenAccountTab={() => setActiveTab('account')}
                validationErrors={validationErrors}
                onDismissErrors={() => setValidationErrors([])}
                maxSizeLabel={maxSizeLabel}
                lang={lang}
              />

              <UploadQueue
                items={queue}
                onTogglePause={handleTogglePause}
                onRetry={handleRetryQueueItem}
                onRemove={handleRemoveQueueItem}
                onClearCompleted={handleClearCompleted}
                lang={lang}
              />

              {/* Footer summary below the upload area */}
              <div className="mt-4 flex items-center justify-between gap-3 px-1 text-xs text-zinc-500">
                <div className="flex flex-wrap items-center gap-3">
                  {metrics.queued > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-zinc-300">
                      <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      {t.footer.queuedCount(metrics.queued)}
                    </span>
                  )}
                  <span data-testid="upload-summary" className="tabular-nums">
                    {t.footer.sentCount(metrics.sent)} ·{' '}
                    {formatBytes(metrics.totalBytesSent, lang)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="inline-flex shrink-0 items-center gap-1 text-zinc-400 transition-colors hover:text-white"
                >
                  {t.footer.viewHistory}
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <HistoryPanel
              items={history}
              activeQueue={queue}
              onTogglePauseQueue={handleTogglePause}
              onRetryQueue={handleRetryQueueItem}
              onRemoveQueue={handleRemoveQueueItem}
              onRefresh={handleRefreshHistory}
              isRefreshing={isRefreshing}
              onRemoveItem={handleRemoveHistoryItem}
              onRetryItem={handleRetryHistoryItem}
              onClearHistory={handleClearHistory}
              lang={lang}
            />
          )}

          {activeTab === 'account' && (
            <AccountPanel
              accounts={accounts}
              onConnectAccount={handleConnectAccount}
              onSetActiveAccount={handleSetActiveAccount}
              onRemoveAccount={handleRemoveAccount}
              onOpenTokenModal={() => setIsTokenModalOpen(true)}
              lang={lang}
            />
          )}
        </div>
      </main>

      <TokenAuthenticatorModal
        open={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        onConnectToken={handleConnectAccount}
        lang={lang}
      />
    </div>
  );
}
