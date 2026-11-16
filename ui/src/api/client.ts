export interface ApiAccount {
  email: string;
  active: boolean;
}

export interface AccountsResponse {
  accounts: ApiAccount[];
  active: string | null;
  error: string | null;
  dry_run: boolean;
}

export interface AddAccountResponse {
  ok: boolean;
  message: string;
  email: string | null;
  requested_email?: string | null;
  email_mismatch?: boolean;
  accounts: ApiAccount[];
  active: string | null;
  error: string | null;
}

export interface AccountMutationResponse {
  ok: boolean;
  message?: string;
  accounts: ApiAccount[];
  active: string | null;
  error: string | null;
}

export type ApiJobStatus =
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'success'
  | 'error'
  | 'cancelled';

export interface ApiJob {
  id: string;
  original_name: string;
  size: number;
  status: ApiJobStatus;
  attempts: number;
  media_key: string | null;
  error: string | null;
  account: string | null;
  created_at: string;
  updated_at: string;
  retryable?: boolean;
}

export interface JobsResponse {
  jobs: ApiJob[];
  stats: {
    uploaded: number;
    pending: number;
    paused?: number;
    errors: number;
    cancelled: number;
    total: number;
  };
  server: {
    dry_run: boolean;
    max_upload_mb?: number;
    binary_ok?: boolean;
    config_exists?: boolean;
  };
}

export interface JobResponse {
  ok: boolean;
  job: ApiJob;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function describeError(error: unknown, lang: 'pt' | 'en' = 'pt'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return lang === 'en' ? 'Unexpected error. Try again.' : 'Erro inesperado. Tente novamente.';
}

function extractDetail(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== 'object') return fallback;

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return '';
      })
      .filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
  });

  if (response.status === 401) {
    window.location.assign('/login');
    throw new ApiError(401, 'Sessão expirada. Entre novamente.');
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractDetail(payload, `Falha na requisição (${response.status}).`),
    );
  }

  return payload as T;
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  };
}

export function listAccounts(): Promise<AccountsResponse> {
  return request<AccountsResponse>('/api/accounts');
}

export function addAccount(
  token: string,
  email?: string,
): Promise<AddAccountResponse> {
  return request<AddAccountResponse>(
    '/api/accounts',
    jsonBody(email ? { token, email } : { token }),
  );
}

export function selectAccount(email: string): Promise<AccountMutationResponse> {
  return request<AccountMutationResponse>('/api/accounts/select', jsonBody({ email }));
}

export function removeAccount(email: string): Promise<AccountMutationResponse> {
  return request<AccountMutationResponse>(
    `/api/accounts/${encodeURIComponent(email)}`,
    { method: 'DELETE' },
  );
}

export function listJobs(limit = 100): Promise<JobsResponse> {
  return request<JobsResponse>(`/api/jobs?limit=${limit}`);
}

export function cancelJob(jobId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/jobs/${jobId}`, { method: 'DELETE' });
}

export function pauseJob(jobId: string): Promise<JobResponse> {
  return request<JobResponse>(`/api/jobs/${jobId}/pause`, { method: 'POST' });
}

export function resumeJob(jobId: string): Promise<JobResponse> {
  return request<JobResponse>(`/api/jobs/${jobId}/resume`, { method: 'POST' });
}

export function retryJob(jobId: string): Promise<JobResponse> {
  return request<JobResponse>(`/api/jobs/${jobId}/retry`, { method: 'POST' });
}

export function deleteHistoryItem(jobId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/history/${jobId}`, { method: 'DELETE' });
}

export function clearHistory(): Promise<{ ok: boolean; deleted: number }> {
  return request<{ ok: boolean; deleted: number }>('/api/history', {
    method: 'DELETE',
  });
}

export interface UploadProgress {
  percent: number;
  speedBps: number;
}

export function uploadJob(
  file: File,
  lastModified: number,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<ApiJob> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload cancelado.', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('last_modified', String(Math.trunc(lastModified || Date.now())));

    let lastLoaded = 0;
    let lastTime = Date.now();

    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });

    const cleanup = () => {
      signal.removeEventListener('abort', abort);
    };

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      let speedBps = 0;
      if (elapsed > 0.15) {
        speedBps = Math.max(0, (event.loaded - lastLoaded) / elapsed);
        lastLoaded = event.loaded;
        lastTime = now;
      }
      const percent = Math.max(
        0,
        Math.min(100, Math.round((event.loaded / Math.max(1, event.total)) * 100)),
      );
      onProgress({ percent, speedBps });
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(0, 'Falha de rede ao enviar o arquivo.'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Upload cancelado.', 'AbortError'));
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status === 401) {
        window.location.assign('/login');
        reject(new ApiError(401, 'Sessão expirada. Entre novamente.'));
        return;
      }

      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = xhr.responseText;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new ApiError(
            xhr.status,
            extractDetail(payload, `Falha ao enviar o arquivo (${xhr.status}).`),
          ),
        );
        return;
      }

      const job = (payload as { job?: ApiJob } | null)?.job;
      if (!job) {
        reject(new ApiError(xhr.status, 'O servidor não retornou o envio criado.'));
        return;
      }
      resolve(job);
    };

    xhr.open('POST', '/api/jobs');
    xhr.withCredentials = true;
    xhr.send(form);
  });
}
