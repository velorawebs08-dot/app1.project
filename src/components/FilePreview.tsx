import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { downloadTestPaperBlob } from '../lib/dataService';

export interface FilePreviewProps {
  fileName?: string;
  fileType?: string;
  file?: File | Blob | null;
  filePath?: string;
  variant?: 'inline' | 'modal';
}

function inferMimeType(fileType?: string, fileName?: string): string {
  if (fileType) return fileType;
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/pdf';
}

export const StorageFileThumbnail: React.FC<{
  filePath: string;
  fileType?: string;
  fileName?: string;
}> = ({ filePath, fileType, fileName }) => {
  const resolvedType = inferMimeType(fileType, fileName);
  const isImage = resolvedType.startsWith('image/');
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage || !filePath) {
      setThumbUrl(null);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;

    downloadTestPaperBlob(filePath, resolvedType)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setThumbUrl(createdUrl);
      })
      .catch((err) => {
        console.error('Failed to load thumbnail from test-papers:', err);
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [filePath, resolvedType, isImage]);

  if (isImage && thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt={fileName || 'Test paper thumbnail'}
        className="h-full w-full object-cover"
      />
    );
  }

  return <FileText className="w-5 h-5 text-[#0F2A4A]" />;
};

export const FilePreview: React.FC<FilePreviewProps> = ({
  fileName,
  fileType,
  file,
  filePath,
  variant = 'inline',
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const resolvedType = inferMimeType(
    fileType || (file instanceof File ? file.type : undefined),
    fileName || (file instanceof File ? file.name : undefined)
  );
  const isImage = resolvedType.startsWith('image/');
  const isPdf = resolvedType === 'application/pdf';

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    setLoadError(null);

    if (file) {
      setLoading(false);
      createdUrl = URL.createObjectURL(file);
      setBlobUrl(createdUrl);
      return () => {
        if (createdUrl) {
          URL.revokeObjectURL(createdUrl);
        }
      };
    }

    if (!filePath) {
      setLoading(false);
      setBlobUrl(null);
      return;
    }

    setLoading(true);
    setBlobUrl(null);

    downloadTestPaperBlob(filePath, resolvedType)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load test paper preview:', err);
        setLoadError(
          err instanceof Error ? err.message : 'Unable to load test paper'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [file, filePath, resolvedType]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen]);

  if (!file && !filePath) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
        <FileText className="w-10 h-10 text-slate-300 mb-2" />
        <p className="text-sm font-semibold text-slate-700">
          No test paper attached
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-slate-200 bg-white">
        <Loader2 className="w-7 h-7 text-[#0F2A4A] animate-spin mb-2" />
        <p className="text-xs font-medium text-slate-600">
          Loading test paper...
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-red-200 bg-red-50">
        <AlertCircle className="w-8 h-8 text-red-600 mb-2" />
        <p className="text-sm font-semibold text-red-800">
          Could not load test paper
        </p>
        <p className="text-xs text-red-700 mt-1 max-w-md">{loadError}</p>
      </div>
    );
  }

  const downloadName =
    fileName ||
    (file instanceof File ? file.name : undefined) ||
    (isImage ? 'test-paper.jpg' : 'test-paper.pdf');

  return (
    <div className="space-y-3">
      {isImage && blobUrl && (
        <div
          className={`relative group overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center ${
            variant === 'modal'
              ? 'min-h-[260px] max-h-[70vh] p-2'
              : 'max-h-56 p-2'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setLightboxOpen(true);
            }}
            className="relative block cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] rounded-xl"
            aria-label={`Open full-screen preview of ${downloadName}`}
          >
            <img
              src={blobUrl}
              alt={downloadName}
              className={`rounded-xl object-contain mx-auto ${
                variant === 'modal' ? 'max-h-[65vh] w-auto' : 'max-h-48 w-auto'
              }`}
            />
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F2A4A]/85 text-white text-[11px] font-semibold opacity-90 group-hover:opacity-100 transition-opacity shadow">
              <Maximize2 className="w-3 h-3 text-[#F5A623]" />
              <span>Zoom</span>
            </span>
          </button>
        </div>
      )}

      {isPdf && blobUrl && (
        <div className="w-full rounded-xl border border-slate-200 bg-white overflow-hidden">
          <object
            data={blobUrl}
            type="application/pdf"
            aria-label={downloadName}
            className={`w-full block ${
              variant === 'modal' ? 'h-[60vh] md:h-[70vh]' : 'h-60'
            }`}
          >
            {/* Fallback rendered automatically when device/browser cannot render PDFs inline */}
            <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-slate-50">
              <FileText className="w-10 h-10 text-[#0F2A4A] mb-2" />
              <p className="text-sm font-semibold text-[#0F2A4A]">
                Inline PDF preview is not supported on this device
              </p>
              <p className="text-xs text-slate-500 mt-1 mb-4 max-w-xs">
                Open the PDF in a new tab or download it directly.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <a
                  href={blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F2A4A] text-white text-xs font-semibold hover:bg-[#193D68] transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#F5A623]" />
                  <span>Open PDF</span>
                </a>
                <a
                  href={blobUrl}
                  download={downloadName}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white text-[#0F2A4A] text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          </object>
        </div>
      )}

      {/* Action Bar: Open PDF (for PDFs) + Always Download */}
      {blobUrl && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <span className="text-xs text-slate-500 truncate max-w-[240px]">
            {downloadName}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {isPdf && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-[#0F2A4A] text-xs font-semibold text-[#0F2A4A] transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open PDF</span>
              </a>
            )}
            <a
              href={blobUrl}
              download={downloadName}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0F2A4A] hover:bg-[#193D68] text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[#F5A623]" />
              <span>Download</span>
            </a>
          </div>
        </div>
      )}

      {/* Full-Screen Image Lightbox with Zoom */}
      <AnimatePresence>
        {lightboxOpen && isImage && blobUrl && (
          <div
            className="fixed inset-0 z-[70] flex flex-col bg-black/90 text-white"
            role="dialog"
            aria-modal="true"
            aria-label={`Full-screen preview of ${downloadName}`}
          >
            <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-black/50 border-b border-white/10">
              <p className="text-xs sm:text-sm font-semibold truncate">
                {downloadName}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) =>
                      Math.max(0.5, Math.round((z - 0.25) * 100) / 100)
                    )
                  }
                  aria-label="Zoom out"
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono tabular-nums cursor-pointer"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) =>
                      Math.min(3, Math.round((z + 0.25) * 100) / 100)
                    )
                  }
                  aria-label="Zoom in"
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <a
                  href={blobUrl}
                  download={downloadName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5A623] text-[#0F2A4A] text-xs font-bold hover:bg-[#E09212] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Close full-screen preview"
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxOpen(false)}
              className="flex-1 overflow-auto flex items-center justify-center p-4"
            >
              <img
                src={blobUrl}
                alt={downloadName}
                onClick={(e) => e.stopPropagation()}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
                className="max-w-full max-h-full rounded-lg transition-transform duration-150 select-none"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface FilePreviewModalProps {
  open: boolean;
  title: string;
  fileName?: string;
  fileType?: string;
  file?: File | Blob | null;
  filePath?: string;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  open,
  title,
  fileName,
  fileType,
  file,
  filePath,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="file-preview-modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0F2A4A]/55 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-[#0F2A4A] text-[#F5A623] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="file-preview-modal-title"
                    className="text-sm sm:text-base font-bold text-[#0F2A4A] truncate"
                  >
                    {title}
                  </h3>
                  {fileName && (
                    <p className="text-xs text-slate-500 truncate">{fileName}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close file preview"
                className="p-2 rounded-xl text-slate-500 hover:text-[#0F2A4A] hover:bg-slate-200/70 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto bg-slate-50">
              <FilePreview
                fileName={fileName}
                fileType={fileType}
                file={file}
                filePath={filePath}
                variant="modal"
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
