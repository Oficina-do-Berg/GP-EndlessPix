import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_EMBEDDED_SETUP_URL,
  MAX_FILE_SIZE_BYTES,
  calculateUploadDetails,
  computeMetrics,
  computeRemainingTransferBytes,
  detectMediaKind,
  extractOAuthTokenFromText,
  filterHistory,
  formatBytes,
  formatEta,
  getQueueProgressView,
  validateOAuthToken,
  validateUploadFile,
} from './uploadLogic';
import type { HistoryItem, UploadQueueItem } from '../types/upload';

function queueItem(overrides: Partial<UploadQueueItem>): UploadQueueItem {
  return {
    id: 'q1',
    name: 'foto.jpg',
    size: 1000,
    mimeType: 'image/jpeg',
    mediaKind: 'image',
    progress: 0,
    status: 'queued',
    attempts: 0,
    addedAt: 1,
    accountEmail: 'a@gmail.com',
    ...overrides,
  };
}

test('detectMediaKind identifies images, videos, and unsupported files', () => {
  assert.equal(detectMediaKind('foto.JPG', ''), 'image');
  assert.equal(detectMediaKind('clip.mov', 'video/quicktime'), 'video');
  assert.equal(detectMediaKind('documento.pdf', 'application/pdf'), 'other');
});

test('validateUploadFile enforces 4 GB limit and media formats', () => {
  assert.equal(validateUploadFile({ name: 'img.heic', size: 1024 }).valid, true);
  assert.equal(validateUploadFile({ name: 'empty.jpg', size: 0 }).valid, false);
  assert.equal(
    validateUploadFile({ name: 'huge.mp4', size: MAX_FILE_SIZE_BYTES + 1 }).valid,
    false,
  );
  assert.equal(validateUploadFile({ name: 'archive.zip', size: 2048 }).valid, false);
});

test('formatBytes formats KB, MB, and GB in Brazilian Portuguese decimal format', () => {
  assert.equal(formatBytes(460_800), '450 KB');
  assert.equal(formatBytes(2_202_010), '2,1 MB');
  assert.equal(formatBytes(3_145_728), '3 MB');
  assert.equal(formatBytes(1_610_612_736), '1,50 GB');
});

test('computeMetrics aggregates sent, queued, failed, and total counts', () => {
  const queue: UploadQueueItem[] = [
    {
      id: 'q1',
      name: 'a.jpg',
      size: 1000,
      mimeType: 'image/jpeg',
      mediaKind: 'image',
      progress: 40,
      status: 'uploading',
      attempts: 1,
      addedAt: 1,
      accountEmail: 'a@gmail.com',
    },
    {
      id: 'q2',
      name: 'b.mp4',
      size: 2000,
      mimeType: 'video/mp4',
      mediaKind: 'video',
      progress: 0,
      status: 'error',
      attempts: 1,
      addedAt: 2,
      accountEmail: 'a@gmail.com',
    },
  ];
  const history: HistoryItem[] = [
    {
      id: 'h1',
      name: 'c.png',
      size: 500,
      mediaKind: 'image',
      status: 'sent',
      attempts: 1,
      timestamp: 3,
      accountEmail: 'a@gmail.com',
    },
  ];

  const metrics = computeMetrics(queue, history);
  assert.deepEqual(metrics, {
    sent: 1,
    queued: 1,
    failed: 1,
    total: 3,
    totalBytesSent: 500,
  });
});

test('filterHistory filters by filename query and status', () => {
  const items: HistoryItem[] = [
    {
      id: '1',
      name: 'perfil.jpg',
      size: 100,
      mediaKind: 'image',
      status: 'sent',
      attempts: 1,
      timestamp: 1,
      accountEmail: 'berg@gmail.com',
    },
    {
      id: '2',
      name: 'video.mov',
      size: 200,
      mediaKind: 'video',
      status: 'error',
      attempts: 2,
      timestamp: 2,
      accountEmail: 'berg@gmail.com',
    },
  ];

  assert.equal(filterHistory(items, 'perfil', 'all').length, 1);
  assert.equal(filterHistory(items, '', 'error').length, 1);
  assert.equal(filterHistory(items, 'perfil', 'error').length, 0);
});

test('validateOAuthToken rejects empty or malformed tokens and accepts valid tokens', () => {
  assert.equal(validateOAuthToken('').valid, false);
  assert.equal(validateOAuthToken('short').valid, false);
  assert.equal(validateOAuthToken('invalid token with spaces').valid, false);
  assert.equal(validateOAuthToken('oauth2_ya29_a0AfH6SMBx991234', 'nao-e-email').valid, false);
  const ok = validateOAuthToken('oauth2_ya29_a0AfH6SMBx991234', 'studio@gmail.com');
  assert.equal(ok.valid, true);
  assert.equal(ok.token, 'oauth2_ya29_a0AfH6SMBx991234');
  assert.equal(ok.email, 'studio@gmail.com');
});

test('extractOAuthTokenFromText extracts value from cookie headers and raw strings', () => {
  assert.equal(
    extractOAuthTokenFromText('SID=xyz; oauth_token=oauth2_ya29_test987654321; Path=/'),
    'oauth2_ya29_test987654321',
  );
  assert.equal(extractOAuthTokenFromText('  oauth2_ya29_plainvalue123  '), 'oauth2_ya29_plainvalue123');
  assert.equal(
    validateOAuthToken('oauth_token=oauth2_ya29_cookie1234567890;').token,
    'oauth2_ya29_cookie1234567890',
  );
});

test('token button points to the Google Embedded Setup v2 Android page', () => {
  assert.equal(
    GOOGLE_EMBEDDED_SETUP_URL,
    'https://accounts.google.com/embedded/setup/v2/android',
  );
});

test('getQueueProgressView only shows percentages for real browser transfer', () => {
  const browserUpload = getQueueProgressView(
    queueItem({ status: 'uploading', progress: 42 }),
  );
  assert.deepEqual(browserUpload, {
    server: false,
    indeterminate: false,
    showPercent: true,
    barPercent: 42,
  });

  const localQueued = getQueueProgressView(queueItem({ status: 'queued', progress: 0 }));
  assert.equal(localQueued.showPercent, true);
  assert.equal(localQueued.barPercent, 0);

  const serverQueued = getQueueProgressView(
    queueItem({ status: 'queued', progress: 100, jobId: 'job-1' }),
  );
  assert.deepEqual(serverQueued, {
    server: true,
    indeterminate: false,
    showPercent: false,
    barPercent: 0,
  });

  const serverUploading = getQueueProgressView(
    queueItem({ status: 'uploading', progress: 100, jobId: 'job-1' }),
  );
  assert.equal(serverUploading.indeterminate, true);
  assert.equal(serverUploading.showPercent, false);

  const sent = getQueueProgressView(
    queueItem({ status: 'sent', progress: 100, jobId: 'job-1' }),
  );
  assert.equal(sent.showPercent, true);
  assert.equal(sent.barPercent, 100);
});

test('computeRemainingTransferBytes ignores files already delivered to the server', () => {
  const remaining = computeRemainingTransferBytes([
    queueItem({ id: 'local-uploading', status: 'uploading', progress: 40, size: 1000 }),
    queueItem({ id: 'local-queued', status: 'queued', progress: 0, size: 500 }),
    queueItem({
      id: 'server-queued',
      status: 'queued',
      progress: 100,
      size: 100_000,
      jobId: 'job-1',
    }),
    queueItem({ id: 'sent', status: 'sent', progress: 100, size: 1000, jobId: 'job-2' }),
    queueItem({ id: 'error', status: 'error', progress: 25, size: 1000 }),
  ]);

  assert.equal(remaining, 1100);
});

test('calculateUploadDetails and formatEta compute remaining bytes and ETA accurately', () => {
  const details = calculateUploadDetails(2_000_000, 50, 500_000);
  assert.deepEqual(details, {
    uploadedBytes: 1_000_000,
    remainingBytes: 1_000_000,
    etaSeconds: 2,
  });
  assert.equal(formatEta(0), 'concluindo');
  assert.equal(formatEta(14), '14s restantes');
  assert.equal(formatEta(125), '2m 5s restantes');
  assert.equal(formatEta(14, 'en'), '14s left');
  assert.equal(formatBytes(2_202_010, 'en'), '2.1 MB');
});
