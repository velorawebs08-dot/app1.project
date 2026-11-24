import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  MessageCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  addNotice,
  deleteNotice,
  extractFunctionErrorMessage,
  getNotices,
  Notice,
  parseWhatsAppInvokeResult,
} from '../../lib/dataService';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


export const NoticesView: React.FC = () => {
  const { showToast } = useToast();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  // New Notice modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendWhatsAppSwitch, setSendWhatsAppSwitch] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Confirm send WhatsApp for existing notice
  const [sendTarget, setSendTarget] = useState<Notice | null>(null);
  const [sendingNoticeId, setSendingNoticeId] = useState<string | null>(null);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<Notice | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getNotices();
      setNotices(list);
    } catch (err) {
      console.error('Failed to load notices from Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to load notices',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openNewModal = () => {
    setTitle('');
    setBody('');
    setSendWhatsAppSwitch(false);
    setFormErrors({});
    setModalOpen(true);
  };

  const triggerNoticeWhatsApp = async (
    noticeId: string,
    fromNewNotice: boolean
  ) => {
    setSendingNoticeId(noticeId);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'notice_alert', notice_id: noticeId },
      });

      const wa = await parseWhatsAppInvokeResult(data, error);

      if (!wa.ok) {
        showToast(
          fromNewNotice
            ? `Notice saved. WhatsApp failed: ${wa.errorMessage}`
            : wa.errorMessage || 'Failed to send notice on WhatsApp',
          'error',
          10000
        );
        return;
      }

      const baseMsg = `Sent: ${wa.sent}, failed: ${wa.failed}, already sent: ${wa.skipped}`;
      const fullMsg = wa.lastError
        ? `${baseMsg}\nReason: ${wa.lastError}`
        : baseMsg;

      showToast(
        fullMsg,
        wa.failed > 0 || wa.lastError ? 'info' : 'success',
        wa.lastError ? 10000 : 3600
      );
    } catch (err) {
      console.error('WhatsApp notice_alert error:', err);
      const errMsg = await extractFunctionErrorMessage(
        err,
        'Failed to send notice on WhatsApp'
      );
      showToast(
        fromNewNotice ? `Notice saved. WhatsApp failed: ${errMsg}` : errMsg,
        'error',
        10000
      );
    } finally {
      setSendingNoticeId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const errors: Record<string, string> = {};
    if (!title.trim()) {
      errors.title = 'Notice title is required';
    }
    if (!body.trim()) {
      errors.body = 'Notice message is required';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const shouldSendWhatsApp = sendWhatsAppSwitch;
    setSaving(true);
    let savedNotice: Notice;
    try {
      savedNotice = await addNotice({ title, body });
      await refresh();
      setModalOpen(false);
    } catch (err) {
      console.error('Error saving notice in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to save notice',
        'error'
      );
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }

    if (shouldSendWhatsApp) {
      await triggerNoticeWhatsApp(savedNotice.id, true);
    } else {
      showToast('Notice published successfully', 'success');
    }
  };

  const handleConfirmSendWhatsApp = async () => {
    if (!sendTarget) return;
    const target = sendTarget;
    setSendTarget(null);
    await triggerNoticeWhatsApp(target.id, false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteNotice(deleteTarget.id);
      await refresh();
      showToast(`Deleted "${deleteTarget.title}"`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting notice in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to delete notice',
        'error'
      );
    }
  };

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
            Parent Notices & Announcements
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Publish batch updates and broadcast them to parents on WhatsApp
          </p>
        </div>
        <button
          type="button"
          onClick={openNewModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[44px]"
        >
          <Plus className="w-4 h-4 text-[#F5A623]" />
          <span>New Notice</span>
        </button>
      </div>

      {/* Notices Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-200 p-5 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#0F2A4A]">
            No notices published yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Create a notice to share schedule updates or announcements with
            parents.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {notices.map((notice) => {
            const isSending = sendingNoticeId === notice.id;
            return (
              <div
                key={notice.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold text-[#0F2A4A]">
                      {notice.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {formatDate(notice.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={Boolean(sendingNoticeId)}
                      onClick={() => setSendTarget(notice)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-emerald-800 transition-colors cursor-pointer min-h-[38px]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>
                        {isSending ? 'Sending...' : 'Send on WhatsApp'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(notice)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-700 transition-colors cursor-pointer min-h-[38px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                  {notice.body}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* New Notice Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-modal-title"
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
              className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden my-auto"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3
                  id="notice-modal-title"
                  className="font-display text-lg font-bold text-[#0F2A4A]"
                >
                  New Notice
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

              <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="notice-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Title <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="notice-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Sunday Extra Revision Lecture"
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

                <div>
                  <label
                    htmlFor="notice-body"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Message <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="notice-body"
                    rows={4}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write the announcement details for parents..."
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                      formErrors.body
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.body && (
                    <p className="mt-1 text-xs text-red-600">
                      {formErrors.body}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-[#0F2A4A]">
                      Also send on WhatsApp
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Notify all active parents immediately after saving
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sendWhatsAppSwitch}
                    aria-label="Also send on WhatsApp"
                    onClick={() => setSendWhatsAppSwitch((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                      sendWhatsAppSwitch ? 'bg-[#0F2A4A]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        sendWhatsAppSwitch ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
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
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-50 text-white text-sm font-semibold transition-colors min-h-[42px] cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Notice'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Send Notice on WhatsApp */}
      <ConfirmDialog
        open={Boolean(sendTarget)}
        title="Send on WhatsApp?"
        description="Send this notice to all parents on WhatsApp?"
        confirmLabel="Send"
        variant="primary"
        onConfirm={handleConfirmSendWhatsApp}
        onCancel={() => setSendTarget(null)}
      />

      {/* Confirm Delete Notice */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this notice?"
        description={`Deleting "${deleteTarget?.title ?? ''}" will permanently remove it.`}
        confirmLabel="Delete Notice"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
};
