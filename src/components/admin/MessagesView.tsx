import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { getMessageLogs, MessageLogEntry } from '../../lib/dataService';
import { useToast } from '../ToastProvider';

function formatMessageDate(dateStr: string): string {
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

function formatMessageType(type: string): string {
  const normalized = type.trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'welcome') return 'Welcome';
  if (normalized === 'new_test') return 'New test';
  if (normalized === 'fee_reminder') return 'Fee reminder';
  if (normalized === 'notice') return 'Notice';
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Notice';
}

export const MessagesView: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<MessageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getMessageLogs();
      setLogs(list);
    } catch (err) {
      console.error('Failed to load message_log:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to load messages',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-5"
    >
      {/* Top Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2A4A]">
            WhatsApp Message Log
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated parent notifications · Newest first
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-[#0F2A4A] disabled:opacity-50 text-xs font-semibold text-[#0F2A4A] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Messages Table / Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 bg-slate-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#0F2A4A]">
              No WhatsApp messages logged yet
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Welcome alerts and test result notifications will appear here once
              sent.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-4">Parent name</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {logs.map((row) => {
                    const isSent = row.status === 'sent';
                    const failedTooltip =
                      !isSent && row.error ? row.error : undefined;

                    return (
                      <tr
                        key={row.id}
                        title={failedTooltip}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3.5 px-6 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                          {formatMessageDate(row.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#0F2A4A]">
                          {row.parentName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#0F2A4A]/8 text-[#0F2A4A] text-xs font-semibold whitespace-nowrap">
                            {formatMessageType(row.type)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {row.phone}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <div className="relative inline-block group">
                            <span
                              title={failedTooltip}
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs font-semibold capitalize ${
                                isSent
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-700 border-red-200 cursor-help'
                              }`}
                            >
                              {row.status}
                            </span>
                            {failedTooltip && (
                              <span
                                role="tooltip"
                                className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 bottom-full mb-1.5 px-3 py-1.5 rounded-lg bg-[#0F2A4A] text-white text-xs max-w-xs w-max text-left shadow-lg z-20"
                              >
                                {failedTooltip}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {logs.map((row) => {
                const isSent = row.status === 'sent';
                return (
                  <div
                    key={row.id}
                    title={!isSent && row.error ? row.error : undefined}
                    className="p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0F2A4A] truncate">
                          {row.parentName}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          {formatMessageDate(row.createdAt)}
                        </p>
                      </div>
                      <span
                        title={!isSent && row.error ? row.error : undefined}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs font-semibold capitalize shrink-0 ${
                          isSent
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#0F2A4A]/8 text-[#0F2A4A] font-semibold">
                        {formatMessageType(row.type)}
                      </span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        {row.phone}
                      </span>
                    </div>

                    {!isSent && row.error && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                        {row.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};
