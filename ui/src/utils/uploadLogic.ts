import { HistoryItem, MediaKind, UploadMetrics, UploadQueueItem } from '../types/upload';

export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB

const SUPPORTED_IMAGE_EXTS = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'tif',
  'tiff',
  'webp',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'orf',
  'raf',
  'rw2',
  'pef',
  'sr2',
  'dng',
]);

const SUPPORTED_VIDEO_EXTS = new Set([
  '3gp',
  '3g2',
  'asf',
  'avi',
  'divx',
  'm2t',
  'm2ts',
  'm4v',
  'mkv',
  'mmv',
  'mod',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'mts',
  'tod',
  'ts',
  'webm',
  'wmv',
]);

export function getFileExtension(filename: string): string {
  const parts = filename.trim().toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function detectMediaKind(filename: string, mimeType = ''): MediaKind {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';

  const ext = getFileExtension(filename);
  if (SUPPORTED_IMAGE_EXTS.has(ext)) return 'image';
  if (SUPPORTED_VIDEO_EXTS.has(ext)) return 'video';
  return 'other';
}

export function validateUploadFile(
  file: {
    name: string;
    size: number;
    type?: string;
  },
  lang: 'pt' | 'en' = 'pt',
  maxBytes: number = MAX_FILE_SIZE_BYTES,
): { valid: boolean; reason?: string; mediaKind: MediaKind } {
  const mediaKind = detectMediaKind(file.name, file.type ?? '');
  const limitLabel = formatMaxSize(maxBytes / (1024 * 1024), lang);

  if (file.size <= 0) {
    return {
      valid: false,
      mediaKind,
      reason:
        lang === 'en'
          ? 'Empty file (0 B) cannot be uploaded.'
          : 'Arquivo vazio (0 B) não pode ser enviado.',
    };
  }

  if (file.size > maxBytes) {
    return {
      valid: false,
      mediaKind,
      reason:
        lang === 'en'
          ? `Exceeds the ${limitLabel} maximum per file.`
          : `Excede o limite máximo de ${limitLabel} por arquivo.`,
    };
  }

  if (mediaKind === 'other') {
    return {
      valid: false,
      mediaKind,
      reason:
        lang === 'en'
          ? 'Unsupported format. Please upload photos or videos.'
          : 'Formato não suportado. Envie fotos ou vídeos.',
    };
  }

  return { valid: true, mediaKind };
}

export function formatBytes(bytes: number, lang: 'pt' | 'en' = 'pt'): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const sep = lang === 'en' ? '.' : ',';

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    const rounded = Number.isInteger(mb) || mb >= 100 ? mb.toFixed(0) : mb.toFixed(1);
    return `${rounded.replace('.', sep)} MB`;
  }

  const gb = mb / 1024;
  return `${gb.toFixed(2).replace('.', sep)} GB`;
}

export function formatMaxSize(maxMb: number, _lang: 'pt' | 'en' = 'pt'): string {
  if (!Number.isFinite(maxMb) || maxMb <= 0) return '4 GB';
  if (maxMb >= 1024 && maxMb % 1024 === 0) {
    return `${maxMb / 1024} GB`;
  }
  return `${Math.round(maxMb)} MB`;
}

export function formatTimestamp(ts: number, lang: 'pt' | 'en' = 'pt'): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  if (lang === 'en') {
    return `${month}/${day}/${year}, ${hours}:${minutes}`;
  }
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

export function computeMetrics(
  queue: UploadQueueItem[],
  history: HistoryItem[],
): UploadMetrics {
  const activeQueued = queue.filter(
    (item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'paused',
  ).length;
  const queueErrors = queue.filter((item) => item.status === 'error').length;
  const queueErrorJobIds = new Set(
    queue
      .filter((item) => item.status === 'error' && item.jobId)
      .map((item) => item.jobId as string),
  );

  const historySent = history.filter((item) => item.status === 'sent').length;
  const historyErrors = history.filter(
    (item) => item.status === 'error' && !queueErrorJobIds.has(item.id),
  ).length;

  const sent = historySent;
  const failed = historyErrors + queueErrors;
  const queued = activeQueued;
  const total = sent + queued + failed;
  const totalBytesSent = history
    .filter((item) => item.status === 'sent')
    .reduce((acc, item) => acc + item.size, 0);

  return {
    sent,
    queued,
    failed,
    total,
    totalBytesSent,
  };
}

export function filterHistory(
  items: HistoryItem[],
  query: string,
  statusFilter: 'all' | 'sent' | 'error',
): HistoryItem[] {
  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }
    if (!normalized) return true;
    return (
      item.name.toLowerCase().includes(normalized) ||
      item.accountEmail.toLowerCase().includes(normalized)
    );
  });
}

export const GOOGLE_EMBEDDED_SETUP_URL =
  'https://accounts.google.com/embedded/setup/v2/android';

export function extractOAuthTokenFromText(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  const cookieMatch = trimmed.match(/(?:^|[;\s])oauth_token\s*=\s*([^;\s]+)/i);
  if (cookieMatch?.[1]) {
    return cookieMatch[1].replace(/^["']|["']$/g, '').trim();
  }

  return trimmed;
}

export function validateOAuthToken(
  rawToken: string,
  emailInput?: string,
  lang: 'pt' | 'en' = 'pt',
): { valid: boolean; error?: string; token?: string; email?: string } {
  const token = extractOAuthTokenFromText(rawToken);
  if (!token) {
    return {
      valid: false,
      error:
        lang === 'en'
          ? 'Paste the oauth_token cookie before connecting.'
          : 'Cole o cookie oauth_token antes de conectar.',
    };
  }

  if (token.length < 16) {
    return {
      valid: false,
      error:
        lang === 'en'
          ? 'Token is too short. Copy the full oauth_token cookie value.'
          : 'Token muito curto. Copie o valor completo do cookie oauth_token.',
    };
  }

  if (/\s/.test(token)) {
    return {
      valid: false,
      error:
        lang === 'en'
          ? 'The token cannot contain spaces or line breaks.'
          : 'O token não pode conter espaços ou quebras de linha.',
    };
  }

  const trimmedEmail = (emailInput ?? '').trim().toLowerCase();
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return {
      valid: false,
      error:
        lang === 'en'
          ? 'Enter a valid email address or leave it blank.'
          : 'Informe um endereço de e-mail válido ou deixe em branco.',
    };
  }

  return {
    valid: true,
    token,
    email: trimmedEmail || undefined,
  };
}

export function calculateUploadDetails(
  totalSize: number,
  progressPercent: number,
  speedBps: number,
): {
  uploadedBytes: number;
  remainingBytes: number;
  etaSeconds: number;
} {
  const clamped = Math.max(0, Math.min(100, progressPercent));
  const uploadedBytes = Math.round((totalSize * clamped) / 100);
  const remainingBytes = Math.max(0, totalSize - uploadedBytes);
  const etaSeconds =
    speedBps > 0 && remainingBytes > 0 ? Math.ceil(remainingBytes / speedBps) : 0;

  return {
    uploadedBytes,
    remainingBytes,
    etaSeconds,
  };
}

export interface QueueProgressView {
  server: boolean;
  indeterminate: boolean;
  showPercent: boolean;
  barPercent: number;
}

/**
 * A barra só mostra percentual quando existe transferência real do navegador.
 * Depois que o arquivo chega ao servidor, o gotohp não informa progresso, então
 * a interface usa um estado indeterminado em vez de inventar 95%/97%.
 */
export function getQueueProgressView(item: UploadQueueItem): QueueProgressView {
  const server = Boolean(item.jobId);

  if (item.status === 'sent') {
    return { server, indeterminate: false, showPercent: true, barPercent: 100 };
  }

  if (item.status === 'error') {
    return {
      server,
      indeterminate: false,
      showPercent: !server,
      barPercent: server ? 100 : item.progress,
    };
  }

  if (item.status === 'uploading') {
    return server
      ? { server, indeterminate: true, showPercent: false, barPercent: 0 }
      : { server, indeterminate: false, showPercent: true, barPercent: item.progress };
  }

  if (item.status === 'paused') {
    return server
      ? { server, indeterminate: false, showPercent: false, barPercent: 0 }
      : { server, indeterminate: false, showPercent: true, barPercent: item.progress };
  }

  return {
    server,
    indeterminate: false,
    showPercent: !server,
    barPercent: server ? 0 : item.progress,
  };
}

/**
 * Bytes que ainda faltam sair do navegador para o servidor. Arquivos que já
 * têm job no servidor não entram na conta, mesmo que o Google ainda esteja
 * processando.
 */
export function computeRemainingTransferBytes(items: UploadQueueItem[]): number {
  return items.reduce((acc, item) => {
    if (item.jobId || item.status === 'sent' || item.status === 'error') {
      return acc;
    }
    return acc + calculateUploadDetails(item.size, item.progress, 0).remainingBytes;
  }, 0);
}

export function formatEta(seconds: number, lang: 'pt' | 'en' = 'pt'): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return lang === 'en' ? 'finishing' : 'concluindo';
  }
  const suffix = lang === 'en' ? 'left' : 'restantes';
  if (seconds < 60) return `${seconds}s ${suffix}`;

  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  if (mins < 60) {
    return remSecs > 0 ? `${mins}m ${remSecs}s ${suffix}` : `${mins}m ${suffix}`;
  }

  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m ${suffix}` : `${hours}h ${suffix}`;
}
