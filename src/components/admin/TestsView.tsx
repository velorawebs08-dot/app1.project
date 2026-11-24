import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardEdit,
  Eye,
  FileText,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  addTest,
  deleteTest,
  getAllMarks,
  getStudents,
  getTestFile,
  getTests,
  Mark,
  Test,
  updateTest,
} from '../../lib/dataService';
import { siteData } from '../../siteData';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  FilePreview,
  FilePreviewModal,
  StorageFileThumbnail,
} from '../FilePreview';
import { useToast } from '../ToastProvider';

interface TestsViewProps {
  onNavigateToMarks: (testId: string) => void;
}

interface TestFormState {
  title: string;
  subject: string;
  testDate: string;
  totalMarks: string;
  file?: File | null;
  fileName?: string;
  fileType?: string;
  filePath?: string;
  removeFile?: boolean;
}

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function detectFileType(file: File): string | null {
  if (ACCEPTED_TYPES.has(file.type)) {
    return file.type;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

async function compressImageToJpegFile(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxWidth = 1600;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetWidth = Math.round(img.width * scale);
        const targetHeight = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Could not initialize image compressor'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'test-paper';
            resolve(
              new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
            );
          },
          'image/jpeg',
          0.8
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load selected image'));
    };
    img.src = objectUrl;
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const TestsView: React.FC<TestsViewProps> = ({ onNavigateToMarks }) => {
  const { showToast } = useToast();
  const [tests, setTests] = useState<Test[]>([]);
  const [activeStudentIds, setActiveStudentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [allMarks, setAllMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [form, setForm] = useState<TestFormState>({
    title: '',
    subject: siteData.subjects[0],
    testDate: new Date().toISOString().slice(0, 10),
    totalMarks: '40',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [processingFile, setProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<Test | null>(null);

  // File preview modal
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    title: string;
    fileName?: string;
    fileType?: string;
    filePath?: string;
  }>({ open: false, title: '' });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [testList, stuList, markList] = await Promise.all([
        getTests(),
        getStudents(),
        getAllMarks(),
      ]);
      setTests(testList);
      setActiveStudentIds(
        new Set(stuList.filter((s) => s.status === 'active').map((s) => s.id))
      );
      setAllMarks(markList);
    } catch (err) {
      console.error('Failed to load tests from Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to load tests',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const marksCountByTest = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of allMarks) {
      if (activeStudentIds.has(m.studentId)) {
        map.set(m.testId, (map.get(m.testId) ?? 0) + 1);
      }
    }
    return map;
  }, [allMarks, activeStudentIds]);

  const openCreateModal = () => {
    setEditingTest(null);
    setForm({
      title: '',
      subject: siteData.subjects[0],
      testDate: new Date().toISOString().slice(0, 10),
      totalMarks: '40',
      file: null,
      fileName: undefined,
      fileType: undefined,
      filePath: undefined,
      removeFile: false,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (test: Test) => {
    setEditingTest(test);
    const file = getTestFile(test);
    setForm({
      title: test.title,
      subject: test.subject,
      testDate: test.testDate,
      totalMarks: String(test.totalMarks),
      file: null,
      fileName: file?.fileName,
      fileType: file?.fileType,
      filePath: file?.filePath,
      removeFile: false,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const detectedType = detectFileType(file);
    if (!detectedType) {
      setFormErrors((prev) => ({
        ...prev,
        file: 'Unsupported file format. Upload a PDF, JPG, PNG, or WEBP file.',
      }));
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setFormErrors((prev) => ({
        ...prev,
        file: `File is too large (${(file.size / (1024 * 1024)).toFixed(
          1
        )} MB). Maximum allowed size is 3 MB.`,
      }));
      e.target.value = '';
      return;
    }

    setProcessingFile(true);
    setFormErrors((prev) => ({ ...prev, file: '' }));

    try {
      if (detectedType.startsWith('image/')) {
        const compressedFile = await compressImageToJpegFile(file);
        setForm((f) => ({
          ...f,
          file: compressedFile,
          fileName: compressedFile.name,
          fileType: 'image/jpeg',
          filePath: undefined,
          removeFile: false,
        }));
      } else {
        setForm((f) => ({
          ...f,
          file,
          fileName: file.name,
          fileType: 'application/pdf',
          filePath: undefined,
          removeFile: false,
        }));
      }
    } catch (err) {
      setFormErrors((prev) => ({
        ...prev,
        file:
          err instanceof Error
            ? err.message
            : 'Unable to process the selected file.',
      }));
    } finally {
      setProcessingFile(false);
      e.target.value = '';
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) {
      errors.title = 'Test title is required';
    }
    if (!form.subject) {
      errors.subject = 'Subject is required';
    }
    if (!form.testDate) {
      errors.testDate = 'Test date is required';
    }
    const marksNum = Number(form.totalMarks);
    if (!form.totalMarks || Number.isNaN(marksNum) || marksNum <= 0) {
      errors.totalMarks = 'Total marks must be greater than 0';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || processingFile || saving) return;

    setSaving(true);
    try {
      if (editingTest) {
        await updateTest(editingTest.id, {
          title: form.title.trim(),
          subject: form.subject,
          testDate: form.testDate,
          totalMarks: Number(form.totalMarks),
          file: form.file,
          fileName: form.fileName,
          fileType: form.fileType,
          filePath: editingTest.filePath,
          removeFile: form.removeFile,
        });
        await refresh();
        showToast('Test updated successfully', 'success');
      } else {
        await addTest({
          title: form.title.trim(),
          subject: form.subject,
          testDate: form.testDate,
          totalMarks: Number(form.totalMarks),
          file: form.file,
          fileName: form.fileName,
          fileType: form.fileType,
        });
        await refresh();
        showToast('Test created successfully', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Error saving test in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Unable to save test',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleViewFile = (test: Test) => {
    const file = getTestFile(test);
    if (!file) return;
    setPreviewModal({
      open: true,
      title: `${test.subject} — ${test.title}`,
      fileName: file.fileName,
      fileType: file.fileType,
      filePath: file.filePath,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTest(deleteTarget.id);
      await refresh();
      showToast(`Deleted "${deleteTarget.title}"`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting test in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to delete test',
        'error'
      );
    }
  };

  const totalActiveCount = activeStudentIds.size;
  const hasSelectedOrExistingFile = Boolean(
    (form.file || form.filePath) && !form.removeFile
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-5"
    >
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2A4A]">
            Published Unit & Term Tests
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sorted newest first · Attach PDF, JPG, PNG, or WEBP up to 3 MB
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[44px]"
        >
          <Plus className="w-4 h-4 text-[#F5A623]" />
          <span>Create Test</span>
        </button>
      </div>

      {/* Tests List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-200 p-5 h-28 animate-pulse"
            />
          ))}
        </div>
      ) : tests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#0F2A4A]">
            No tests created yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Create your first test to attach a paper and start entering marks.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {tests.map((test) => {
            const enteredCount = marksCountByTest.get(test.id) ?? 0;
            const file = getTestFile(test);
            const isImage = file?.fileType.startsWith('image/');

            return (
              <div
                key={test.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {file && (
                    <button
                      type="button"
                      onClick={() => handleViewFile(test)}
                      title={`View ${file.fileName}`}
                      className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 hover:border-[#0F2A4A] transition-colors cursor-pointer"
                    >
                      <StorageFileThumbnail
                        filePath={file.filePath}
                        fileType={file.fileType}
                        fileName={file.fileName}
                      />
                    </button>
                  )}

                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#0F2A4A]/8 text-[#0F2A4A] text-xs font-semibold">
                        {test.subject}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {formatDate(test.testDate)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-xs font-mono font-semibold text-[#0F2A4A] tabular-nums">
                        Total: {test.totalMarks} marks
                      </span>
                    </div>

                    <h3 className="font-display text-base font-bold text-[#0F2A4A] truncate">
                      {test.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="font-mono tabular-nums">
                        Marks entered: {enteredCount} / {totalActiveCount}{' '}
                        students
                      </span>
                      {file && (
                        <span className="inline-flex items-center gap-1 text-[#0F2A4A] font-medium">
                          {isImage ? (
                            <ImageIcon className="w-3.5 h-3.5 text-[#F5A623]" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-[#F5A623]" />
                          )}
                          <span className="truncate max-w-[220px]">
                            {file.fileName}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onNavigateToMarks(test.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F5A623]/15 hover:bg-[#F5A623]/25 text-[#0F2A4A] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
                  >
                    <ClipboardEdit className="w-3.5 h-3.5" />
                    <span>Enter Marks</span>
                  </button>

                  {file && (
                    <button
                      type="button"
                      onClick={() => handleViewFile(test)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-[#0F2A4A] text-xs font-semibold text-[#0F2A4A] transition-colors cursor-pointer min-h-[40px]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditModal(test)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-[#0F2A4A] text-xs font-semibold text-[#0F2A4A] transition-colors cursor-pointer min-h-[40px]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(test)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-700 transition-colors cursor-pointer min-h-[40px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Test Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="test-modal-title"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !saving && setModalOpen(false)}
              className="fixed inset-0 bg-[#0F2A4A]/45 backdrop-blur-[2px]"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.16 }}
              className="relative z-10 w-full max-w-xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                <h3
                  id="test-modal-title"
                  className="font-display text-lg font-bold text-[#0F2A4A]"
                >
                  {editingTest ? 'Edit Test' : 'Create New Test'}
                </h3>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F2A4A] hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleSubmit}
                className="p-6 space-y-4 overflow-y-auto"
                noValidate
              >
                <div>
                  <label
                    htmlFor="test-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Test Title <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="test-title"
                    type="text"
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="e.g. Trigonometry & Heights Unit Test"
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                      formErrors.title
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.title && (
                    <p className="mt-1 text-xs text-red-600">
                      {formErrors.title}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="test-subject"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Subject <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="test-subject"
                      value={form.subject}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, subject: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#0F2A4A] focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                    >
                      {siteData.subjects.map((subj) => (
                        <option key={subj} value={subj}>
                          {subj}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="test-date"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Test Date <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="test-date"
                      type="date"
                      value={form.testDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, testDate: e.target.value }))
                      }
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        formErrors.testDate
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {formErrors.testDate && (
                      <p className="mt-1 text-xs text-red-600">
                        {formErrors.testDate}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="test-total-marks"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Total Marks <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="test-total-marks"
                    type="number"
                    min={1}
                    step="1"
                    value={form.totalMarks}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, totalMarks: e.target.value }))
                    }
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                      formErrors.totalMarks
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.totalMarks && (
                    <p className="mt-1 text-xs text-red-600">
                      {formErrors.totalMarks}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Test Paper (PDF, JPG, PNG, WEBP · max 3 MB)
                    </label>
                    {hasSelectedOrExistingFile && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs font-semibold text-[#0F2A4A] hover:underline cursor-pointer"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              file: null,
                              fileName: undefined,
                              fileType: undefined,
                              filePath: undefined,
                              removeFile: true,
                            }))
                          }
                          className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {processingFile ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-medium text-slate-600">
                      Preparing file preview...
                    </div>
                  ) : hasSelectedOrExistingFile ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <FilePreview
                        fileName={form.fileName}
                        fileType={form.fileType}
                        file={form.file}
                        filePath={form.filePath}
                        variant="inline"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 hover:border-[#0F2A4A] bg-slate-50/70 hover:bg-slate-50 px-4 py-4 text-xs font-semibold text-[#0F2A4A] transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-[#F5A623]" />
                      <span>Upload PDF, JPG, PNG, or WEBP (max 3 MB)</span>
                    </button>
                  )}

                  {formErrors.file && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">
                      {formErrors.file}
                    </p>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 transition-colors min-h-[42px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={processingFile || saving}
                    className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-50 text-white text-sm font-semibold transition-colors min-h-[42px] cursor-pointer"
                  >
                    {saving
                      ? 'Saving...'
                      : editingTest
                        ? 'Save Changes'
                        : 'Create Test'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Delete Test */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this test?"
        description={`Deleting "${deleteTarget?.title ?? ''}" will permanently remove this test and all marks entered for it.`}
        confirmLabel="Delete Test"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Reusable File Preview Modal */}
      <FilePreviewModal
        open={previewModal.open}
        title={previewModal.title}
        fileName={previewModal.fileName}
        fileType={previewModal.fileType}
        filePath={previewModal.filePath}
        onClose={() => setPreviewModal((prev) => ({ ...prev, open: false }))}
      />
    </motion.div>
  );
};
