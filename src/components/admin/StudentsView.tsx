import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pencil,
  Plus,
  Search,
  Smartphone,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  addStudent,
  getStudents,
  setStudentStatus,
  Student,
  updateStudent,
} from '../../lib/dataService';
import { siteData } from '../../siteData';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../ToastProvider';

interface StudentFormState {
  parentName: string;
  name: string;
  joiningDate: string;
  parentPhone: string;
  parentWhatsapp: string;
  sameAsPhone: boolean;
  parentEmail: string;
}

const EMPTY_FORM: StudentFormState = {
  parentName: '',
  name: '',
  joiningDate: new Date().toISOString().slice(0, 10),
  parentPhone: '',
  parentWhatsapp: '',
  sameAsPhone: true,
  parentEmail: '',
};

export const StudentsView: React.FC = () => {
  const { showToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'left'>(
    'all'
  );

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Confirm Deactivate / Reactivate
  const [confirmTarget, setConfirmTarget] = useState<Student | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getStudents();
      setStudents(list);
    } catch (err) {
      console.error('Failed to load students from Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to load students',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.parentName.toLowerCase().includes(q) ||
        s.parentPhone.includes(q) ||
        s.parentEmail.toLowerCase().includes(q)
      );
    });
  }, [students, search, statusFilter]);

  const openAddModal = () => {
    setEditingStudent(null);
    setForm({
      ...EMPTY_FORM,
      joiningDate: new Date().toISOString().slice(0, 10),
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    const matchesPhone =
      Boolean(student.parentWhatsapp) &&
      student.parentWhatsapp === student.parentPhone;
    setForm({
      parentName: student.parentName,
      name: student.name,
      joiningDate: student.joiningDate,
      parentPhone: student.parentPhone,
      parentWhatsapp: student.parentWhatsapp ?? '',
      sameAsPhone: matchesPhone,
      parentEmail: student.parentEmail,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.parentName.trim()) {
      errors.parentName = 'Parent name is required';
    }
    if (!form.name.trim()) {
      errors.name = 'Student name is required';
    }
    if (!form.joiningDate) {
      errors.joiningDate = 'Joining date is required';
    }
    const phoneDigits = form.parentPhone.trim();
    if (!/^\d{10}$/.test(phoneDigits)) {
      errors.parentPhone = 'Enter a valid 10-digit phone number';
    }
    const whatsappValue = form.sameAsPhone
      ? phoneDigits
      : form.parentWhatsapp.trim();
    if (whatsappValue && !/^\d{10}$/.test(whatsappValue)) {
      errors.parentWhatsapp = 'Enter a valid 10-digit WhatsApp number';
    }
    const email = form.parentEmail.trim();
    if (!email) {
      errors.parentEmail = 'Parent email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.parentEmail = 'Enter a valid email address';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || saving) return;

    const payload = {
      parentName: form.parentName.trim(),
      name: form.name.trim(),
      standard: '10th' as const,
      joiningDate: form.joiningDate,
      parentPhone: form.parentPhone.trim(),
      parentWhatsapp: form.sameAsPhone
        ? form.parentPhone.trim()
        : form.parentWhatsapp.trim(),
      parentEmail: form.parentEmail.trim(),
    };

    setSaving(true);
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, {
          ...payload,
          parentId: editingStudent.parentId,
        });
        await refresh();
        showToast(`${payload.name} updated successfully`, 'success');
      } else {
        await addStudent(payload);
        await refresh();
        showToast(`${payload.name} added to Standard 10th`, 'success');
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Error saving student in Supabase:', err);
      const msg =
        err instanceof Error ? err.message : 'Could not save student';
      if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('unique')) {
        setFormErrors((prev) => ({ ...prev, parentEmail: msg }));
      }
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmStatusToggle = async () => {
    if (!confirmTarget) return;
    const nextStatus = confirmTarget.status === 'active' ? 'left' : 'active';
    try {
      await setStudentStatus(confirmTarget.id, nextStatus);
      await refresh();
      showToast(
        nextStatus === 'left'
          ? `${confirmTarget.name} marked as Left`
          : `${confirmTarget.name} reactivated`,
        'success'
      );
      setConfirmTarget(null);
    } catch (err) {
      console.error('Error updating student status:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to update student status',
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
      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, parent, phone, or email..."
              aria-label="Search students"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-[#0F2A4A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F5A623] focus:border-[#0F2A4A] min-h-[42px]"
            />
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 self-start sm:self-auto">
            {(['all', 'active', 'left'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-white text-[#0F2A4A] shadow-sm'
                    : 'text-slate-600 hover:text-[#0F2A4A]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[44px]"
        >
          <Plus className="w-4 h-4 text-[#F5A623]" />
          <span>Add Student</span>
        </button>
      </div>

      {/* Students Table / Cards */}
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
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#0F2A4A]">
              No matching students found
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {students.length === 0
                ? 'Add your first Standard 10th student to get started.'
                : 'Try adjusting your search query or status filter.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-6">Student</th>
                    <th className="py-3.5 px-4">Parent</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredStudents.map((student) => {
                    const isActive = student.status === 'active';
                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3.5 px-6">
                          <p className="font-semibold text-[#0F2A4A]">
                            {student.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Std {student.standard} · Joined {student.joiningDate}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-slate-800">
                            {student.parentName}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {student.parentEmail}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums">
                          {student.parentPhone}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-semibold ${
                              isActive ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {isActive ? 'Active' : 'Left'}
                          </span>
                        </td>
                        <td className="py-3.5 px-6">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(student)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#0F2A4A] text-xs font-semibold text-[#0F2A4A] transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmTarget(student)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                                isActive
                                  ? 'border-red-200 text-red-700 hover:bg-red-50'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <UserMinus className="w-3.5 h-3.5" />
                                  <span>Deactivate</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Reactivate</span>
                                </>
                              )}
                            </button>

                            <div className="relative group">
                              <button
                                type="button"
                                disabled
                                title="Available after login is set up"
                                aria-label="Log out device (Available after login is set up)"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-400 bg-slate-50 cursor-not-allowed"
                              >
                                <Smartphone className="w-3.5 h-3.5" />
                                <span>Log out device</span>
                              </button>
                              <span
                                role="tooltip"
                                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity absolute right-0 bottom-full mb-1.5 px-2.5 py-1 rounded-lg bg-[#0F2A4A] text-white text-[11px] whitespace-nowrap shadow-md z-10"
                              >
                                Available after login is set up
                              </span>
                            </div>
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
              {filteredStudents.map((student) => {
                const isActive = student.status === 'active';
                return (
                  <div key={student.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0F2A4A]">
                          {student.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Parent: {student.parentName}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {student.parentPhone} · {student.parentEmail}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          isActive ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {isActive ? 'Active' : 'Left'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(student)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#0F2A4A] min-h-[40px]"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTarget(student)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold min-h-[40px] ${
                          isActive
                            ? 'border-red-200 text-red-700'
                            : 'border-emerald-200 text-emerald-700'
                        }`}
                      >
                        {isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Available after login is set up"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-400 bg-slate-50 cursor-not-allowed min-h-[40px]"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Log out device</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Student Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-modal-title"
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
                  id="student-modal-title"
                  className="font-display text-lg font-bold text-[#0F2A4A]"
                >
                  {editingStudent ? 'Edit Student' : 'Add New Student'}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="student-parent-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Parent Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="student-parent-name"
                      type="text"
                      value={form.parentName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, parentName: e.target.value }))
                      }
                      placeholder="e.g. Rajesh Sharma"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        formErrors.parentName
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {formErrors.parentName && (
                      <p className="mt-1 text-xs text-red-600">
                        {formErrors.parentName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="student-name"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Student Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="student-name"
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="e.g. Aarav Sharma"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        formErrors.name
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {formErrors.name && (
                      <p className="mt-1 text-xs text-red-600">
                        {formErrors.name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="student-standard"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Standard
                    </label>
                    <input
                      id="student-standard"
                      type="text"
                      value={siteData.standard}
                      readOnly
                      className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600 font-semibold cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="student-joining-date"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Joining Date <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="student-joining-date"
                      type="date"
                      value={form.joiningDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, joiningDate: e.target.value }))
                      }
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        formErrors.joiningDate
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {formErrors.joiningDate && (
                      <p className="mt-1 text-xs text-red-600">
                        {formErrors.joiningDate}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="student-phone"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Parent Phone (10 digits){' '}
                      <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="student-phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={form.parentPhone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setForm((f) => ({
                          ...f,
                          parentPhone: digits,
                          parentWhatsapp: f.sameAsPhone
                            ? digits
                            : f.parentWhatsapp,
                        }));
                      }}
                      placeholder="9876543210"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                        formErrors.parentPhone
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {formErrors.parentPhone && (
                      <p className="mt-1 text-xs text-red-600">
                        {formErrors.parentPhone}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="student-whatsapp"
                        className="text-xs font-semibold text-slate-700"
                      >
                        WhatsApp Number
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.sameAsPhone}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm((f) => ({
                              ...f,
                              sameAsPhone: checked,
                              parentWhatsapp: checked
                                ? f.parentPhone
                                : f.parentWhatsapp,
                            }));
                          }}
                          className="rounded border-slate-300 text-[#0F2A4A] focus:ring-[#F5A623]"
                        />
                        <span>Same as phone</span>
                      </label>
                    </div>
                    <input
                      id="student-whatsapp"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      disabled={form.sameAsPhone}
                      value={
                        form.sameAsPhone ? form.parentPhone : form.parentWhatsapp
                      }
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setForm((f) => ({ ...f, parentWhatsapp: digits }));
                      }}
                      placeholder="Optional 10 digits"
                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F5A623] disabled:bg-slate-100 disabled:text-slate-500 ${
                        formErrors.parentWhatsapp
                          ? 'border-red-500 bg-red-50'
                          : 'border-slate-300'
                      }`}
                    />
                    {formErrors.parentWhatsapp && (
                      <p className="mt-1 text-xs text-red-600">
                        {formErrors.parentWhatsapp}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="student-email"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Parent Email <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="student-email"
                    type="email"
                    value={form.parentEmail}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, parentEmail: e.target.value }));
                      if (formErrors.parentEmail) {
                        setFormErrors((err) => ({ ...err, parentEmail: '' }));
                      }
                    }}
                    placeholder="parent@example.com"
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5A623] ${
                      formErrors.parentEmail
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-300'
                    }`}
                  />
                  {formErrors.parentEmail && (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      {formErrors.parentEmail}
                    </p>
                  )}
                  {!editingStudent && (
                    <p className="mt-2 text-xs text-slate-500">
                      Parent will get a WhatsApp message after their first login.
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
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-60 text-white text-sm font-semibold transition-colors min-h-[42px] cursor-pointer"
                  >
                    {saving
                      ? 'Saving...'
                      : editingStudent
                        ? 'Save Changes'
                        : 'Add Student'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deactivate / Reactivate Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={
          confirmTarget?.status === 'active'
            ? 'Deactivate student?'
            : 'Reactivate student?'
        }
        description={
          confirmTarget?.status === 'active'
            ? `${confirmTarget.name} will be marked as Left and removed from new marks entry sheets. Historical test marks remain preserved.`
            : `${confirmTarget?.name} will be restored to Active status and included in marks entry sheets.`
        }
        confirmLabel={
          confirmTarget?.status === 'active' ? 'Deactivate' : 'Reactivate'
        }
        variant={confirmTarget?.status === 'active' ? 'danger' : 'primary'}
        onConfirm={handleConfirmStatusToggle}
        onCancel={() => setConfirmTarget(null)}
      />
    </motion.div>
  );
};
