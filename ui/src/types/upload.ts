export type AppTab = 'upload' | 'history' | 'account';

export type QueueStatus = 'queued' | 'uploading' | 'paused' | 'sent' | 'error';

export type HistoryStatus = 'sent' | 'error';

export type MediaKind = 'image' | 'video' | 'other';

export interface GoogleAccount {
  id: string;
  email: string;
  active: boolean;
  connectedAt: number;
}

export interface UploadQueueItem {
  id: string;
  jobId?: string;
  name: string;
  size: number;
  mimeType: string;
  mediaKind: MediaKind;
  progress: number;
  status: QueueStatus;
  attempts: number;
  speedBps?: number;
  errorMessage?: string;
  previewUrl?: string;
  addedAt: number;
  accountEmail: string;
  pausable?: boolean;
}

export interface HistoryItem {
  id: string;
  name: string;
  size: number;
  mediaKind: MediaKind;
  status: HistoryStatus;
  attempts: number;
  timestamp: number;
  accountEmail: string;
  errorMessage?: string;
  retryable?: boolean;
}

export interface UploadMetrics {
  sent: number;
  queued: number;
  failed: number;
  total: number;
  totalBytesSent: number;
}
