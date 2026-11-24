import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  History,
  IndianRupee,
  MessageCircle,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  addFees,
  computeFeeStatus,
  deleteFee,
  extractFunctionErrorMessage,
  FEE_PAYMENT_MODES,
  FeePayment,
  FeePaymentMode,
  FeeStatusRow,
  FeeStatusState,
  formatINR,
  getFeePayments,
  getFeeStatuses,
  getStudents,
  getTodayIsoDate,
  parseWhatsAppInvokeResult,
  recordFeePayment,
  Student,
  updateFee,
} from '../../lib/dataService';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

type FilterChip = 'All' | 'Pending' | 'Overdue' | 'Paid';

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusBadgeClasses(status: FeeStatusState): string {
  if (status === 'Paid') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status === 'Overdue') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-amber-50 text-amber-800 border-amber-200';
}


export const FeesView: React.FC = () => {
  const { showToast } = useToast();
  const [fees, setFees] = useState<FeeStatusRow[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<FilterChip>('All');
  const [search, setSearch] = useState('');

  // WhatsApp reminder sending states
  const [sendingFeeId, setSendingFeeId] = useState<string | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);
  const [confirmRemindAll, setConfirmRemindAll] = useState(false);

  // Add Fee modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDueDate, setAddDueDate] = useState('');
  const [addScope, setAddScope] = useState<'single' | 'all'>('single');
  const [addStudentId, setAddStudentId] = useState('');
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  // Edit Fee modal
  const [editingFee, setEditingFee] = useState<FeeStatusRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Record Payment modal
  const [paymentTarget, setPaymentTarget] = useState<FeeStatusRow | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayIsoDate());
  const [paymentMode, setPaymentMode] = useState<FeePaymentMode>('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>(
    {}
  );

  // History modal
  const [historyTarget, setHistoryTarget] = useState<FeeStatusRow | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<FeePayment[]>([]);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FeeStatusRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [feeList, paymentList, studentList] = await Promise.all([
        getFeeStatuses(),
        getFeePayments(),
        getStudents(),
      ]);
      setFees(feeList);
      setPayments(paymentList);
      setStudents(studentList);
    } catch (err) {
      console.error('Failed to load fees from Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to load fees',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const activeStudents = useMemo(
    () => students.filter((s) => s.status === 'active'),
    [students]
  );

  const today = getTodayIsoDate();

  const summary = useMemo(() => {
    const currentMonthPrefix = today.slice(0, 7);
    let totalPending = 0;
    let overdueCount = 0;

    for (const f of fees) {
      if (f.balance > 0) {
        totalPending += f.balance;
      }
      if (computeFeeStatus(f, today) === 'Overdue') {
        overdueCount += 1;
      }
    }

    let collectedThisMonth = 0;
    for (const p of payments) {
      if (p.paidOn.startsWith(currentMonthPrefix)) {
        collectedThisMonth += p.amount;
      }
    }

    return {
      totalPending,
      collectedThisMonth,
      overdueCount,
    };
  }, [fees, payments, today]);

  const overdueFees = useMemo(
    () => fees.filter((f) => computeFeeStatus(f, today) === 'Overdue'),
    [fees, today]
  );

  const overdueParentCount = useMemo(() => {
    const uniqueParents = new Set<string>();
    for (const f of overdueFees) {
      const stu = studentMap.get(f.studentId);
      uniqueParents.add(stu?.parentId || f.studentId);
    }
    return uniqueParents.size;
  }, [overdueFees, studentMap]);

  const enrichedFees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fees
      .map((fee) => {
        const stu = studentMap.get(fee.studentId);
        const studentName = stu?.name ?? 'Unknown Student';
        const status = computeFeeStatus(fee, today);
        return { ...fee, studentName, status };
      })
      .filter((item) => {
        if (filter !== 'All' && item.status !== filter) return false;
        if (q && !item.studentName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [fees, studentMap, today, filter, search]);

  // WhatsApp reminder handlers
  const handleSendRowReminder = async (fee: FeeStatusRow) => {
    if (fee.balance <= 0 || sendingFeeId || remindingAll) return;

    setSendingFeeId(fee.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'fee_reminder', fee_id: fee.id },
      });

      const wa = await parseWhatsAppInvokeResult(data, error);

      if (!wa.ok) {
        showToast(
          wa.errorMessage || 'Failed to send WhatsApp reminder',
          'error',
          10000
        );
        return;
      }

      const baseMsg = `Reminders sent: ${wa.sent}, failed: ${wa.failed}, already reminded today: ${wa.skipped}`;
      const fullMsg = wa.lastError
        ? `${baseMsg}\nReason: ${wa.lastError}`
        : baseMsg;

      showToast(
        fullMsg,
        wa.failed > 0 || wa.lastError ? 'info' : 'success',
        wa.lastError ? 10000 : 3600
      );
    } catch (err) {
      console.error('WhatsApp fee_reminder error:', err);
      const errMsg = await extractFunctionErrorMessage(
        err,
        'Failed to send WhatsApp reminder'
      );
      showToast(errMsg, 'error', 10000);
    } finally {
      setSendingFeeId(null);
    }
  };

  const handleConfirmRemindAll = async () => {
    setConfirmRemindAll(false);
    if (overdueFees.length === 0 || remindingAll || sendingFeeId) return;

    setRemindingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          type: 'fee_reminder',
          fee_ids: overdueFees.map((f) => f.id),
        },
      });

      const wa = await parseWhatsAppInvokeResult(data, error);

      if (!wa.ok) {
        showToast(
          wa.errorMessage || 'Failed to send WhatsApp reminders',
          'error',
          10000
        );
        return;
      }

      const baseMsg = `Reminders sent: ${wa.sent}, failed: ${wa.failed}, already reminded today: ${wa.skipped}`;
      const fullMsg = wa.lastError
        ? `${baseMsg}\nReason: ${wa.lastError}`
        : baseMsg;

      showToast(
        fullMsg,
        wa.failed > 0 || wa.lastError ? 'info' : 'success',
        wa.lastError ? 10000 : 3600
      );
    } catch (err) {
      console.error('WhatsApp bulk fee_reminder error:', err);
      const errMsg = await extractFunctionErrorMessage(
        err,
        'Failed to send WhatsApp reminders'
      );
      showToast(errMsg, 'error', 10000);
    } finally {
      setRemindingAll(false);
    }
  };

  // Add Fee handlers
  const openAddModal = () => {
    setAddTitle('');
    setAddAmount('');
    setAddDueDate('');
    setAddScope('single');
    setAddStudentId(activeStudents[0]?.id ?? '');
    setAddErrors({});
    setAddModalOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addSaving) return;

    const errors: Record<string, string> = {};
    if (!addTitle.trim()) {
      errors.title = 'Fee title is required';
    }
    const amt = Number(addAmount);
    if (!addAmount || Number.isNaN(amt) || amt <= 0) {
      errors.amount = 'Amount must be greater than 0';
    }
    if (!addDueDate) {
      errors.dueDate = 'Due date is required';
    }
    if (addScope === 'single') {
      if (!addStudentId) {
        errors.studentId = 'Select an active student';
      }
    } else if (activeStudents.length === 0) {
      errors.scope = 'No active students found to assign this fee';
    }

    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const targetIds =
      addScope === 'all'
        ? activeStudents.map((s) => s.id)
        : [addStudentId];

    setAddSaving(true);
    try {
      await addFees({
        title: addTitle.trim(),
        amount: amt,
        dueDate: addDueDate,
        studentIds: targetIds,
      });
      await refresh();
      showToast(
        addScope === 'all'
          ? `Fee added for ${targetIds.length} active ${
              targetIds.length === 1 ? 'student' : 'students'
            }`
          : 'Fee added successfully',
        'success'
      );
      setAddModalOpen(false);
    } catch (err) {
      console.error('Error adding fee in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to add fee',
        'error'
      );
    } finally {
      setAddSaving(false);
    }
  };

  // Edit Fee handlers
  const openEditModal = (fee: FeeStatusRow) => {
    setEditingFee(fee);
    setEditTitle(fee.title);
    setEditAmount(String(fee.amount));
    setEditDueDate(fee.dueDate);
    setEditErrors({});
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFee || editSaving) return;

    const errors: Record<string, string> = {};
    if (!editTitle.trim()) {
      errors.title = 'Fee title is required';
    }
    const amt = Number(editAmount);
    if (!editAmount || Number.isNaN(amt) || amt <= 0) {
      errors.amount = 'Amount must be greater than 0';
    }
    if (!editDueDate) {
      errors.dueDate = 'Due date is required';
    }
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setEditSaving(true);
    try {
      await updateFee(editingFee.id, {
        title: editTitle.trim(),
        amount: amt,
        dueDate: editDueDate,
      });
      await refresh();
      showToast('Fee updated successfully', 'success');
      setEditingFee(null);
    } catch (err) {
      console.error('Error updating fee in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to update fee',
        'error'
      );
    } finally {
      setEditSaving(false);
    }
  };

  // Record Payment handlers
  const openPaymentModal = (fee: FeeStatusRow) => {
    setPaymentTarget(fee);
    setPaymentAmount(fee.balance > 0 ? String(fee.balance) : '');
    setPaymentDate(getTodayIsoDate());
    setPaymentMode('Cash');
    setPaymentNote('');
    setPaymentErrors({});
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget || paymentSaving) return;

    const errors: Record<string, string> = {};
    const amt = Number(paymentAmount);
    if (!paymentAmount || Number.isNaN(amt) || amt <= 0) {
      errors.amount = 'Payment amount must be greater than 0';
    } else if (amt > paymentTarget.balance) {
      errors.amount = `Amount cannot exceed remaining balance (${formatINR(
        paymentTarget.balance
      )})`;
    }
    if (!paymentDate) {
      errors.paidOn = 'Payment date is required';
    }

    setPaymentErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPaymentSaving(true);
    try {
      await recordFeePayment({
        feeId: paymentTarget.id,
        amount: amt,
        paidOn: paymentDate,
        mode: paymentMode,
        note: paymentNote,
      });
      await refresh();
      showToast(
        `Recorded ${formatINR(amt)} payment via ${paymentMode}`,
        'success'
      );
      setPaymentTarget(null);
    } catch (err) {
      console.error('Error recording fee payment in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to record payment',
        'error'
      );
    } finally {
      setPaymentSaving(false);
    }
  };

  // History modal handler
  const openHistoryModal = async (fee: FeeStatusRow) => {
    setHistoryTarget(fee);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const rows = await getFeePayments(fee.id);
      setHistoryRows(rows);
    } catch (err) {
      console.error('Error loading fee payment history:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to load payment history',
        'error'
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  // Delete fee handler
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFee(deleteTarget.id);
      await refresh();
      showToast(`Deleted "${deleteTarget.title}"`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting fee in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to delete fee',
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
      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Total Pending
            </span>
            <div className="h-8 w-8 rounded-lg bg-[#F5A623]/15 text-[#0F2A4A] flex items-center justify-center">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#0F2A4A] tabular-nums">
            {formatINR(summary.totalPending)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Outstanding fee balance</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Collected This Month
            </span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-emerald-700 tabular-nums">
            {formatINR(summary.collectedThisMonth)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Current calendar month</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Overdue Count
            </span>
            <div className="h-8 w-8 rounded-lg bg-red-50 text-red-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#0F2A4A] tabular-nums">
            {summary.overdueCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Past due date with balance
          </p>
        </div>
      </div>

      {/* Toolbar: Search, Filter Chips, Remind All Overdue, Add Fee */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student name..."
              aria-label="Search fees by student name"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-[#0F2A4A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-[#0F2A4A] min-h-[42px]"
            />
          </div>

          <div
            className="inline-flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter fees by status"
          >
            {(['All', 'Pending', 'Overdue', 'Paid'] as const).map((chip) => {
              const active = filter === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setFilter(chip)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[38px] ${
                    active
                      ? 'bg-[#0F2A4A] text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-[#0F2A4A] hover:bg-slate-200/70'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={
              overdueFees.length === 0 || remindingAll || Boolean(sendingFeeId)
            }
            onClick={() => setConfirmRemindAll(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-800 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer min-h-[44px]"
          >
            <MessageCircle className="w-4 h-4" />
            <span>
              {remindingAll ? 'Sending...' : 'Remind all overdue'}
            </span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4 text-[#F5A623]" />
            <span>Add Fee</span>
          </button>
        </div>
      </div>

      {/* Fees Table (Desktop) & Cards (Phones/Tablets) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 bg-slate-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : enrichedFees.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#0F2A4A]">
              {fees.length === 0
                ? 'No fees added yet'
                : 'No matching fee entries found'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {fees.length === 0
                ? 'Use "Add Fee" to create a fee for a student or all active students.'
                : 'Try adjusting the status filter or student search.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-5">Student & Fee</th>
                    <th className="py-3.5 px-4 text-right">Amount</th>
                    <th className="py-3.5 px-4 text-right">Paid</th>
                    <th className="py-3.5 px-4 text-right">Balance</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {enrichedFees.map((item) => {
                    const isPaid = item.balance <= 0;
                    const isSendingThis = sendingFeeId === item.id;
                    const reminderDisabled =
                      isPaid ||
                      isSendingThis ||
                      Boolean(sendingFeeId) ||
                      remindingAll;
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3.5 px-5">
                          <p className="font-semibold text-[#0F2A4A]">
                            {item.studentName}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {item.title}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-medium tabular-nums text-slate-700 whitespace-nowrap">
                          {formatINR(item.amount)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-medium tabular-nums text-emerald-700 whitespace-nowrap">
                          {formatINR(item.paid)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-[#0F2A4A] whitespace-nowrap">
                          {formatINR(item.balance)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                          {formatDate(item.dueDate)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs font-semibold ${getStatusBadgeClasses(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              disabled={isPaid}
                              onClick={() => openPaymentModal(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F5A623]/20 hover:bg-[#F5A623]/30 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-bold text-[#0F2A4A] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <IndianRupee className="w-3.5 h-3.5" />
                              <span>Record Payment</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openHistoryModal(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#0F2A4A] text-xs font-semibold text-[#0F2A4A] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>History</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              aria-label={`Edit ${item.title}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#0F2A4A] text-xs font-semibold text-[#0F2A4A] transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              aria-label={`Delete ${item.title}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-700 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>

                            <button
                              type="button"
                              disabled={reminderDisabled}
                              onClick={() => handleSendRowReminder(item)}
                              title={isPaid ? 'Fee is already paid' : undefined}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed text-xs font-semibold text-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>
                                {isSendingThis
                                  ? 'Sending...'
                                  : 'Send WhatsApp reminder'}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Cards */}
            <div className="lg:hidden divide-y divide-slate-100">
              {enrichedFees.map((item) => {
                const isPaid = item.balance <= 0;
                const isSendingThis = sendingFeeId === item.id;
                const reminderDisabled =
                  isPaid ||
                  isSendingThis ||
                  Boolean(sendingFeeId) ||
                  remindingAll;
                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0F2A4A] truncate">
                          {item.studentName}
                        </p>
                        <p className="text-xs font-medium text-slate-600 mt-0.5">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          Due: {formatDate(item.dueDate)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs font-semibold shrink-0 ${getStatusBadgeClasses(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                      <div>
                        <p className="text-slate-500">Amount</p>
                        <p className="font-mono font-semibold text-[#0F2A4A] tabular-nums mt-0.5">
                          {formatINR(item.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Paid</p>
                        <p className="font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
                          {formatINR(item.paid)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Balance</p>
                        <p className="font-mono font-bold text-[#0F2A4A] tabular-nums mt-0.5">
                          {formatINR(item.balance)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isPaid}
                        onClick={() => openPaymentModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F5A623]/20 hover:bg-[#F5A623]/30 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-bold text-[#0F2A4A] min-h-[38px]"
                      >
                        <IndianRupee className="w-3.5 h-3.5" />
                        <span>Record Payment</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openHistoryModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#0F2A4A] min-h-[38px]"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>History</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#0F2A4A] min-h-[38px]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-xs font-semibold text-red-700 min-h-[38px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>

                      <button
                        type="button"
                        disabled={reminderDisabled}
                        onClick={() => handleSendRowReminder(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed text-xs font-semibold text-emerald-800 min-h-[38px]"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>
                          {isSendingThis
                            ? 'Sending...'
                            : 'Send WhatsApp reminder'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add Fee Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-fee-modal-title"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !addSaving && setAddModalOpen(false)}
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
                  id="add-fee-modal-title"
                  className="font-display text-lg font-bold text-[#0F2A4A]"
                >
                  Add Fee
                </h3>
                <button
                  type="button"
                  disabled={addSaving}
                  onClick={() => setAddModalOpen(false)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F2A4A] hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleAddSubmit}
                className="p-6 space-y-4"
                noValidate
              >
                <div>
                  <label
                    htmlFor="fee-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Fee Title <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="fee-title"
                    type="text"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder="e.g. November 2026 fee"
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                      addErrors.title
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-300'
                    }`}
                  />
                  {addErrors.title && (
                    <p className="mt-1 text-xs text-red-600">
                      {addErrors.title}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="fee-amount"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Amount (₹) <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="fee-amount"
                      type="number"
                      min={1}
                      step="1"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      placeholder="2500"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        addErrors.amount
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {addErrors.amount && (
                      <p className="mt-1 text-xs text-red-600">
                        {addErrors.amount}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="fee-due-date"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Due Date <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="fee-due-date"
                      type="date"
                      value={addDueDate}
                      onChange={(e) => setAddDueDate(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        addErrors.dueDate
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {addErrors.dueDate && (
                      <p className="mt-1 text-xs text-red-600">
                        {addErrors.dueDate}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Assign To <span className="text-red-600">*</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label
                      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold cursor-pointer transition-colors ${
                        addScope === 'single'
                          ? 'border-[#0F2A4A] bg-[#0F2A4A]/5 text-[#0F2A4A]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fee-scope"
                        checked={addScope === 'single'}
                        onChange={() => setAddScope('single')}
                        className="text-[#0F2A4A] focus:ring-[#F5A623]"
                      />
                      <span>One student</span>
                    </label>

                    <label
                      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold cursor-pointer transition-colors ${
                        addScope === 'all'
                          ? 'border-[#0F2A4A] bg-[#0F2A4A]/5 text-[#0F2A4A]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="fee-scope"
                        checked={addScope === 'all'}
                        onChange={() => setAddScope('all')}
                        className="text-[#0F2A4A] focus:ring-[#F5A623]"
                      />
                      <span>
                        All active students ({activeStudents.length})
                      </span>
                    </label>
                  </div>
                  {addErrors.scope && (
                    <p className="mt-1 text-xs text-red-600">
                      {addErrors.scope}
                    </p>
                  )}
                </div>

                {addScope === 'single' && (
                  <div>
                    <label
                      htmlFor="fee-student-select"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Select Student <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="fee-student-select"
                      value={addStudentId}
                      onChange={(e) => setAddStudentId(e.target.value)}
                      className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-[#0F2A4A] focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        addErrors.studentId
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    >
                      {activeStudents.length === 0 ? (
                        <option value="">No active students available</option>
                      ) : (
                        activeStudents.map((stu) => (
                          <option key={stu.id} value={stu.id}>
                            {stu.name} ({stu.parentName})
                          </option>
                        ))
                      )}
                    </select>
                    {addErrors.studentId && (
                      <p className="mt-1 text-xs text-red-600">
                        {addErrors.studentId}
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={addSaving}
                    onClick={() => setAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 transition-colors min-h-[42px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addSaving}
                    className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-50 text-white text-sm font-semibold transition-colors min-h-[42px] cursor-pointer"
                  >
                    {addSaving ? 'Saving...' : 'Add Fee'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Fee Modal */}
      <AnimatePresence>
        {editingFee && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-fee-modal-title"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !editSaving && setEditingFee(null)}
              className="fixed inset-0 bg-[#0F2A4A]/45 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.16 }}
              className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden my-auto"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3
                    id="edit-fee-modal-title"
                    className="font-display text-lg font-bold text-[#0F2A4A]"
                  >
                    Edit Fee
                  </h3>
                  <p className="text-xs text-slate-500">
                    {studentMap.get(editingFee.studentId)?.name ?? 'Student'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => setEditingFee(null)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F2A4A] hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleEditSubmit}
                className="p-6 space-y-4"
                noValidate
              >
                <div>
                  <label
                    htmlFor="edit-fee-title"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Fee Title <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="edit-fee-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                      editErrors.title
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-300'
                    }`}
                  />
                  {editErrors.title && (
                    <p className="mt-1 text-xs text-red-600">
                      {editErrors.title}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="edit-fee-amount"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Amount (₹) <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="edit-fee-amount"
                      type="number"
                      min={1}
                      step="1"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        editErrors.amount
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {editErrors.amount && (
                      <p className="mt-1 text-xs text-red-600">
                        {editErrors.amount}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="edit-fee-due-date"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Due Date <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="edit-fee-due-date"
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        editErrors.dueDate
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {editErrors.dueDate && (
                      <p className="mt-1 text-xs text-red-600">
                        {editErrors.dueDate}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={editSaving}
                    onClick={() => setEditingFee(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 transition-colors min-h-[42px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-50 text-white text-sm font-semibold transition-colors min-h-[42px] cursor-pointer"
                  >
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Record Payment Modal */}
      <AnimatePresence>
        {paymentTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-modal-title"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !paymentSaving && setPaymentTarget(null)}
              className="fixed inset-0 bg-[#0F2A4A]/45 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.16 }}
              className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden my-auto"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="min-w-0">
                  <h3
                    id="record-payment-modal-title"
                    className="font-display text-lg font-bold text-[#0F2A4A]"
                  >
                    Record Payment
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {studentMap.get(paymentTarget.studentId)?.name ?? 'Student'}{' '}
                    · {paymentTarget.title}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={paymentSaving}
                  onClick={() => setPaymentTarget(null)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F2A4A] hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handlePaymentSubmit}
                className="p-6 space-y-4"
                noValidate
              >
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">
                    Remaining Balance
                  </span>
                  <span className="font-mono font-bold text-[#0F2A4A] tabular-nums text-sm">
                    {formatINR(paymentTarget.balance)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="payment-amount"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Amount (₹) <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="payment-amount"
                      type="number"
                      min={1}
                      max={paymentTarget.balance}
                      step="1"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        paymentErrors.amount
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {paymentErrors.amount && (
                      <p className="mt-1 text-xs text-red-600">
                        {paymentErrors.amount}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="payment-date"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Paid On <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        paymentErrors.paidOn
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {paymentErrors.paidOn && (
                      <p className="mt-1 text-xs text-red-600">
                        {paymentErrors.paidOn}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="payment-mode"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Payment Mode <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="payment-mode"
                    value={paymentMode}
                    onChange={(e) =>
                      setPaymentMode(e.target.value as FeePaymentMode)
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#0F2A4A] focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                  >
                    {FEE_PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="payment-note"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Note (optional)
                  </label>
                  <input
                    id="payment-note"
                    type="text"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="e.g. Receipt #104 / GPay ref"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={paymentSaving}
                    onClick={() => setPaymentTarget(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 transition-colors min-h-[42px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={paymentSaving}
                    className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-50 text-white text-sm font-semibold transition-colors min-h-[42px] cursor-pointer"
                  >
                    {paymentSaving ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment History Modal */}
      <AnimatePresence>
        {historyTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryTarget(null)}
              className="fixed inset-0 bg-[#0F2A4A]/45 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.16 }}
              className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden my-auto max-h-[88vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="min-w-0">
                  <h3
                    id="history-modal-title"
                    className="font-display text-lg font-bold text-[#0F2A4A]"
                  >
                    Payment History
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {studentMap.get(historyTarget.studentId)?.name ?? 'Student'}{' '}
                    · {historyTarget.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryTarget(null)}
                  aria-label="Close modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F2A4A] hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-3">
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
                  <div>
                    <p className="text-slate-500">Total Fee</p>
                    <p className="font-mono font-semibold text-[#0F2A4A] tabular-nums mt-0.5">
                      {formatINR(historyTarget.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Total Paid</p>
                    <p className="font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
                      {formatINR(historyTarget.paid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Balance</p>
                    <p className="font-mono font-bold text-[#0F2A4A] tabular-nums mt-0.5">
                      {formatINR(historyTarget.balance)}
                    </p>
                  </div>
                </div>

                {historyLoading ? (
                  <div className="space-y-2 pt-2">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded-xl bg-slate-100 animate-pulse"
                      />
                    ))}
                  </div>
                ) : historyRows.length === 0 ? (
                  <div className="py-8 text-center">
                    <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-[#0F2A4A]">
                      No payments recorded yet
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {historyRows.map((p) => (
                      <div
                        key={p.id}
                        className="px-4 py-3 flex items-start justify-between gap-3 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#0F2A4A] tabular-nums">
                            {formatDate(p.paidOn)}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Mode: {p.mode}
                            {p.note ? ` · ${p.note}` : ''}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums shrink-0">
                          {formatINR(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Remind All Overdue */}
      <ConfirmDialog
        open={confirmRemindAll}
        title="Remind all overdue?"
        description={`Send WhatsApp reminders to ${overdueParentCount} parents?`}
        confirmLabel="Send Reminders"
        variant="primary"
        onConfirm={handleConfirmRemindAll}
        onCancel={() => setConfirmRemindAll(false)}
      />

      {/* Delete Fee Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this fee?"
        description={`Deleting "${deleteTarget?.title ?? ''}" will permanently remove this fee entry and its payment records.`}
        confirmLabel="Delete Fee"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
};
