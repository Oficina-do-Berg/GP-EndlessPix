import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUp, X } from 'lucide-react';
import { AppLang, TRANSLATIONS } from '../i18n/translations';

interface UploadDropzoneProps {
  activeEmail: string | null;
  onFilesSelected: (files: File[]) => void;
  onOpenAccountTab: () => void;
  validationErrors: string[];
  onDismissErrors: () => void;
  maxSizeLabel: string;
  lang: AppLang;
}

export function UploadDropzone({
  activeEmail,
  onFilesSelected,
  onOpenAccountTab,
  validationErrors,
  onDismissErrors,
  maxSizeLabel,
  lang,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const t = TRANSLATIONS[lang].dropzone;

  const handleFiles = useCallback(
    (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) return;
      onFilesSelected(Array.from(fileList));
    },
    [onFilesSelected],
  );

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.files;
      if (items && items.length > 0) {
        handleFiles(items);
      }
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFiles]);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <section aria-labelledby="upload-hero-heading" className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        accept="image/*,video/*,.heic,.heif,.raw,.dng,.cr2,.nef,.arw,.mov,.mkv"
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        // @ts-expect-error webkitdirectory is standard in modern browsers for folder selection
        webkitdirectory=""
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Destination and limit line above the drop area */}
      <div className="mb-3 flex items-center justify-between gap-3 px-1 text-xs text-zinc-500">
        {activeEmail ? (
          <button
            type="button"
            onClick={onOpenAccountTab}
            className="truncate transition-colors hover:text-zinc-300"
          >
            {t.to} <span className="text-zinc-300">{activeEmail}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAccountTab}
            className="text-amber-400/90 hover:underline"
          >
            {t.connectPrompt}
          </button>
        )}
        <span className="shrink-0 tabular-nums">{maxSizeLabel}</span>
      </div>

      {/* Flat upload surface */}
      <div
        data-testid="upload-dropzone"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-xl px-6 py-20 text-center ring-1 transition-colors duration-150 sm:py-24 ${
          isDragging
            ? 'bg-white/[0.06] ring-white/25'
            : 'bg-black ring-white/[0.08] hover:bg-white/[0.025]'
        }`}
      >
        <div
          className={`mb-6 flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
            isDragging
              ? 'bg-white text-black'
              : 'bg-white/[0.06] text-zinc-300'
          }`}
        >
          <ArrowUp className="h-5 w-5" strokeWidth={1.75} />
        </div>

        <h1
          id="upload-hero-heading"
          className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-[28px]"
        >
          {isDragging ? t.dropActive : t.idleTitle}
        </h1>

        <p className="mt-2.5 max-w-sm text-sm text-zinc-400">{t.subtitle}</p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-7 inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-white px-6 text-sm font-medium text-black transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {t.selectFiles}
        </button>

        <p className="mt-4 text-xs text-zinc-500">
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            {t.selectFolder}
          </button>
          <span aria-hidden="true" className="mx-2 text-zinc-700">
            ·
          </span>
          <span>{t.orPaste}</span>
        </p>
      </div>

      {/* Inline validation alert */}
      {validationErrors.length > 0 && (
        <div
          role="alert"
          className="mt-4 flex items-start justify-between gap-3 rounded-lg bg-red-500/[0.09] px-4 py-3 text-xs text-red-300"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="space-y-0.5">
              {validationErrors.map((err, idx) => (
                <p key={idx}>{err}</p>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissErrors}
            aria-label={t.dismissAlert}
            className="rounded p-1 text-red-300/70 hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}
