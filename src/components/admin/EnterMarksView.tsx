import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ClipboardList, Users } from 'lucide-react';
import { motion } from 'motion/react';
import {
  extractFunctionErrorMessage,
  getMarksForTest,
  getStudents,
  getTests,
  parseWhatsAppInvokeResult,
  saveMarks,
  SaveMarkRow,
  Student,
  Test,
} from '../../lib/dataService';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ToastProvider';

interface EnterMarksViewProps {
  initialTestId?: string | null;
}

interface RowInputState {
  marks: string;
  remark: string;
}

export const EnterMarksView: React.FC<EnterMarksViewProps> = ({
  initialTestId,
}) => {
  const { showToast } = useToast();
  const [tests, setTests] = useState<Test[]>([]);
  const [activeStudents, setActiveStudents] = useState<Student[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedTestId, setSelectedTestId] = useState<string>('');
  const [rows, setRows] = useState<Record<string, RowInputState>>({});

  useEffect(() => {
    let active = true;
    const loadInitial = async () => {
      setLoadingInit(true);
      try {
        const [testList, studentList] = await Promise.all([
          getTests(),
          getStudents(),
        ]);
        if (!active) return;
        setTests(testList);
        setActiveStudents(studentList.filter((s) => s.status === 'active'));
        if (initialTestId && testList.some((t) => t.id === initialTestId)) {
          setSelectedTestId(initialTestId);
        } else {
          setSelectedTestId(testList[0]?.id ?? '');
        }
      } catch (err) {
        console.error('Error loading tests/students for marks:', err);
        if (active) {
          showToast(
            err instanceof Error ? err.message : 'Failed to load tests and students',
            'error'
          );
        }
      } finally {
        if (active) {
          setLoadingInit(false);
        }
      }
    };
    loadInitial();
    return () => {
      active = false;
    };
  }, [initialTestId, showToast]);

  const selectedTest = useMemo(
    () => tests.find((t) => t.id === selectedTestId) ?? null,
    [tests, selectedTestId]
  );

  // Pre-fill existing marks whenever selected test changes
  useEffect(() => {
    if (!selectedTestId) {
      setRows({});
      return;
    }

    let active = true;
    const loadTestMarks = async () => {
      setLoadingMarks(true);
      try {
        const existing = await getMarksForTest(selectedTestId);
        if (!active) return;
        const byStudent = new Map(existing.map((m) => [m.studentId, m]));
        const nextState: Record<string, RowInputState> = {};

        for (const student of activeStudents) {
          const prev = byStudent.get(student.id);
          nextState[student.id] = {
            marks: prev !== undefined ? String(prev.marksObtained) : '',
            remark: prev?.remark ?? '',
          };
        }
        setRows(nextState);
      } catch (err) {
        console.error('Error loading marks for test:', err);
        if (active) {
          showToast(
            err instanceof Error ? err.message : 'Failed to load existing marks',
            'error'
          );
        }
      } finally {
        if (active) {
          setLoadingMarks(false);
        }
      }
    };
    loadTestMarks();
    return () => {
      active = false;
    };
  }, [selectedTestId, activeStudents, showToast]);

  const validation = useMemo(() => {
    const invalidIds = new Set<string>();
    let enteredCount = 0;

    if (!selectedTest) {
      return { invalidIds, enteredCount, hasErrors: false };
    }

    for (const student of activeStudents) {
      const val = (rows[student.id]?.marks ?? '').trim();
      if (val === '') continue;
      enteredCount += 1;
      const num = Number(val);
      if (
        Number.isNaN(num) ||
        !Number.isFinite(num) ||
        num < 0 ||
        num > selectedTest.totalMarks
      ) {
        invalidIds.add(student.id);
      }
    }

    return {
      invalidIds,
      enteredCount,
      hasErrors: invalidIds.size > 0,
    };
  }, [activeStudents, rows, selectedTest]);

  const updateRow = (
    studentId: string,
    field: 'marks' | 'remark',
    value: string
  ) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: {
        marks: prev[studentId]?.marks ?? '',
        remark: prev[studentId]?.remark ?? '',
        [field]: value,
      },
    }));
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTest || saving) return;

    if (validation.hasErrors) {
      showToast(
        `Please fix invalid marks (must be between 0 and ${selectedTest.totalMarks})`,
        'error'
      );
      return;
    }

    const payload: SaveMarkRow[] = [];
    for (const student of activeStudents) {
      const rawMarks = (rows[student.id]?.marks ?? '').trim();
      if (rawMarks === '') continue;
      payload.push({
        studentId: student.id,
        marksObtained: Number(rawMarks),
        remark: rows[student.id]?.remark?.trim() || undefined,
      });
    }

    setSaving(true);
    try {
      await saveMarks(selectedTest.id, payload);
    } catch (err) {
      console.error('Error saving marks in Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Unable to save marks',
        'error'
      );
      setSaving(false);
      return;
    }

    // Marks saved — trigger WhatsApp alert separately so marks saving never fails because of WhatsApp
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'new_test', test_id: selectedTest.id },
      });

      const wa = await parseWhatsAppInvokeResult(data, error);

      if (!wa.ok) {
        showToast(
          `Marks saved. WhatsApp failed: ${wa.errorMessage}`,
          'error',
          10000
        );
        return;
      }

      const baseMsg =
        wa.failed > 0
          ? `Marks saved. WhatsApp failed for ${wa.failed} parents.`
          : `Marks saved. WhatsApp sent to ${wa.sent} parents.`;

      const fullMsg = wa.lastError
        ? `${baseMsg}\nReason: ${wa.lastError}`
        : baseMsg;

      showToast(
        fullMsg,
        wa.failed > 0 || wa.lastError ? 'info' : 'success',
        wa.lastError ? 10000 : 3600
      );
    } catch (waErr) {
      console.error('WhatsApp new_test error:', waErr);
      const errMsg = await extractFunctionErrorMessage(waErr);
      showToast(`Marks saved. WhatsApp failed: ${errMsg}`, 'error', 10000);
    } finally {
      setSaving(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 h-24 animate-pulse" />
        <div className="bg-white rounded-2xl border border-slate-200 p-6 h-64 animate-pulse" />
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#0F2A4A]">
          No tests available for marks entry
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Create a test in the Tests tab first, then return here to grade the
          class.
        </p>
      </div>
    );
  }

  return (
    <motion.form
      onSubmit={handleSaveAll}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-5"
    >
      {/* Test Selector & Live Counter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex-1 max-w-xl">
          <label
            htmlFor="marks-test-select"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Select Test
          </label>
          <select
            id="marks-test-select"
            value={selectedTestId}
            onChange={(e) => setSelectedTestId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-[#0F2A4A] focus:outline-none focus:ring-2 focus:ring-[#F5A623] min-h-[44px]"
          >
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.subject} — {t.title} ({t.testDate}) · Max {t.totalMarks}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 shrink-0">
          <div className="text-left lg:text-right">
            <p className="text-xs text-slate-500">Progress</p>
            <p className="text-sm font-bold text-[#0F2A4A] font-mono tabular-nums">
              {validation.enteredCount} of {activeStudents.length} entered
            </p>
          </div>

          <button
            type="submit"
            disabled={
              activeStudents.length === 0 ||
              validation.hasErrors ||
              loadingMarks ||
              saving
            }
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer min-h-[44px]"
          >
            <Check className="w-4 h-4 text-[#F5A623]" />
            <span>{saving ? 'Saving...' : 'Save All'}</span>
          </button>
        </div>
      </div>

      {/* Validation Banner */}
      {validation.hasErrors && selectedTest && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm font-medium text-red-800"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>
            Some marks are invalid. Enter a number between 0 and{' '}
            {selectedTest.totalMarks} before saving.
          </span>
        </div>
      )}

      {/* Active Students Marks Sheet */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loadingMarks ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 bg-slate-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : activeStudents.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#0F2A4A]">
              No active students found
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Add or reactivate students in the Students tab to enter marks.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-6">Student Name</th>
                    <th className="py-3.5 px-4 w-52">
                      Marks (out of {selectedTest?.totalMarks ?? 0})
                    </th>
                    <th className="py-3.5 px-6">Optional Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {activeStudents.map((student) => {
                    const row = rows[student.id] ?? { marks: '', remark: '' };
                    const isInvalid = validation.invalidIds.has(student.id);
                    return (
                      <tr
                        key={student.id}
                        className={
                          isInvalid ? 'bg-red-50/40' : 'hover:bg-slate-50/60'
                        }
                      >
                        <td className="py-3 px-6">
                          <p className="font-semibold text-[#0F2A4A]">
                            {student.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {student.parentName}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              aria-label={`Marks for ${student.name}`}
                              aria-invalid={isInvalid}
                              value={row.marks}
                              onChange={(e) =>
                                updateRow(student.id, 'marks', e.target.value)
                              }
                              placeholder={`0–${selectedTest?.totalMarks ?? 100}`}
                              className={`w-full rounded-xl border px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 ${
                                isInvalid
                                  ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-400'
                                  : 'border-slate-300 bg-white text-[#0F2A4A] focus:ring-[#F5A623]'
                              }`}
                            />
                            {isInvalid && (
                              <p className="mt-1 text-[11px] font-medium text-red-600">
                                0 to {selectedTest?.totalMarks} only
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-6">
                          <input
                            type="text"
                            aria-label={`Remark for ${student.name}`}
                            value={row.remark}
                            onChange={(e) =>
                              updateRow(student.id, 'remark', e.target.value)
                            }
                            placeholder="Optional teacher note..."
                            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-[#0F2A4A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards with Large Numeric Inputs */}
            <div className="md:hidden divide-y divide-slate-100">
              {activeStudents.map((student) => {
                const row = rows[student.id] ?? { marks: '', remark: '' };
                const isInvalid = validation.invalidIds.has(student.id);
                return (
                  <div
                    key={student.id}
                    className={`p-4 space-y-3 ${isInvalid ? 'bg-red-50/40' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#0F2A4A]">
                          {student.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {student.parentName}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        Max: {selectedTest?.totalMarks}
                      </span>
                    </div>

                    <div>
                      <label
                        htmlFor={`mobile-marks-${student.id}`}
                        className="block text-xs font-semibold text-slate-600 mb-1"
                      >
                        Marks Obtained
                      </label>
                      <input
                        id={`mobile-marks-${student.id}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        aria-invalid={isInvalid}
                        value={row.marks}
                        onChange={(e) =>
                          updateRow(student.id, 'marks', e.target.value)
                        }
                        placeholder={`0 to ${selectedTest?.totalMarks ?? 100}`}
                        className={`w-full rounded-xl border px-4 py-3 text-lg font-mono font-bold tabular-nums min-h-[52px] focus:outline-none focus:ring-2 ${
                          isInvalid
                            ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-400'
                            : 'border-slate-300 bg-white text-[#0F2A4A] focus:ring-[#F5A623]'
                        }`}
                      />
                      {isInvalid && (
                        <p className="mt-1 text-xs font-medium text-red-600">
                          Must be between 0 and {selectedTest?.totalMarks}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor={`mobile-remark-${student.id}`}
                        className="block text-xs font-semibold text-slate-600 mb-1"
                      >
                        Remark (optional)
                      </label>
                      <input
                        id={`mobile-remark-${student.id}`}
                        type="text"
                        value={row.remark}
                        onChange={(e) =>
                          updateRow(student.id, 'remark', e.target.value)
                        }
                        placeholder="Optional teacher note..."
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-[#0F2A4A] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </motion.form>
  );
};
