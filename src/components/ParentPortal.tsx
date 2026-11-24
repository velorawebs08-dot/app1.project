import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Home,
  IndianRupee,
  LogOut,
  Mail,
  Phone,
  Receipt,
  TrendingUp,
  User,
} from 'lucide-react';
import { motion } from 'motion/react';
import { BrandLogo } from './BrandLogo';
import { FilePreviewModal } from './FilePreview';
import {
  computeFeeStatus,
  downloadTestPaperBlob,
  FeePayment,
  FeeStatusRow,
  FeeStatusState,
  formatINR,
  getFeePayments,
  getFeeStatuses,
  getMarksForStudent,
  getStudents,
  getTestFile,
  getTodayIsoDate,
  Student,
  StudentMarkDetail,
} from '../lib/dataService';
import { siteData } from '../siteData';
import { useToast } from './ToastProvider';

type ParentTab = 'home' | 'tests' | 'fees' | 'profile';

interface ParentPortalProps {
  studentId: string;
  onLogout: () => void;
}

const PARENT_TABS: Array<{
  id: ParentTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'tests', label: 'Tests', icon: FileText },
  { id: 'fees', label: 'Fees', icon: IndianRupee },
  { id: 'profile', label: 'Profile', icon: User },
];

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

export const ParentPortal: React.FC<ParentPortalProps> = ({
  studentId,
  onLogout,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ParentTab>('home');
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [allMarks, setAllMarks] = useState<StudentMarkDetail[]>([]);
  const [fees, setFees] = useState<FeeStatusRow[]>([]);
  const [expandedFeeId, setExpandedFeeId] = useState<string | null>(null);
  const [paymentsByFee, setPaymentsByFee] = useState<
    Record<string, FeePayment[]>
  >({});
  const [loadingFeeId, setLoadingFeeId] = useState<string | null>(null);

  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [downloadingTestId, setDownloadingTestId] = useState<string | null>(
    null
  );
  const [fileModal, setFileModal] = useState<{
    open: boolean;
    title: string;
    fileName?: string;
    fileType?: string;
    filePath?: string;
  }>({ open: false, title: '' });

  useEffect(() => {
    let active = true;
    const loadParentData = async () => {
      setLoading(true);
      try {
        const [studentsList, marksList, feeList] = await Promise.all([
          getStudents(),
          getMarksForStudent(studentId),
          getFeeStatuses(studentId),
        ]);
        if (!active) return;
        setStudent(studentsList.find((s) => s.id === studentId) ?? null);
        setAllMarks(marksList);
        setFees(feeList);
      } catch (err) {
        console.error('Error loading parent portal data:', err);
        if (active) {
          showToast(
            err instanceof Error
              ? err.message
              : 'Failed to load student progress',
            'error'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    loadParentData();
    return () => {
      active = false;
    };
  }, [studentId, showToast]);

  const filteredMarks = useMemo(() => {
    const list =
      subjectFilter === 'ALL'
        ? allMarks
        : allMarks.filter((m) => m.test.subject === subjectFilter);
    return [...list].sort((a, b) =>
      b.test.testDate.localeCompare(a.test.testDate)
    );
  }, [allMarks, subjectFilter]);

  const chartSeries = useMemo(() => {
    const base =
      subjectFilter === 'ALL'
        ? allMarks
        : allMarks.filter((m) => m.test.subject === subjectFilter);
    return [...base]
      .sort((a, b) => a.test.testDate.localeCompare(b.test.testDate))
      .map((item) => {
        const pct =
          item.test.totalMarks > 0
            ? Math.round((item.marksObtained / item.test.totalMarks) * 1000) /
              10
            : 0;
        return {
          ...item,
          percentage: pct,
        };
      });
  }, [allMarks, subjectFilter]);

  const summary = useMemo(() => {
    if (allMarks.length === 0) {
      return { avgPct: 0, bestPct: 0, totalTests: 0, latestSubject: '—' };
    }
    const percentages = allMarks.map((m) =>
      m.test.totalMarks > 0 ? (m.marksObtained / m.test.totalMarks) * 100 : 0
    );
    const avgPct =
      Math.round(
        (percentages.reduce((sum, p) => sum + p, 0) / percentages.length) * 10
      ) / 10;
    const bestPct = Math.round(Math.max(...percentages) * 10) / 10;
    const latest = [...allMarks].sort((a, b) =>
      b.test.testDate.localeCompare(a.test.testDate)
    )[0];
    return {
      avgPct,
      bestPct,
      totalTests: allMarks.length,
      latestSubject: latest?.test.subject ?? '—',
    };
  }, [allMarks]);

  const today = getTodayIsoDate();

  const feeSummary = useMemo(() => {
    const unpaid = fees.filter((f) => f.balance > 0);
    const totalBalanceDue = unpaid.reduce((sum, f) => sum + f.balance, 0);
    const earliestDueDate =
      unpaid.length > 0
        ? unpaid
            .map((f) => f.dueDate)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))[0] ?? null
        : null;
    return {
      totalBalanceDue,
      earliestDueDate,
    };
  }, [fees]);

  const sortedFees = useMemo(
    () => [...fees].sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [fees]
  );

  const handleToggleFeeHistory = async (feeId: string) => {
    if (expandedFeeId === feeId) {
      setExpandedFeeId(null);
      return;
    }

    setExpandedFeeId(feeId);
    if (paymentsByFee[feeId]) return;

    setLoadingFeeId(feeId);
    try {
      const list = await getFeePayments(feeId);
      setPaymentsByFee((prev) => ({ ...prev, [feeId]: list }));
    } catch (err) {
      console.error('Error loading fee payment history:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to load payment history',
        'error'
      );
    } finally {
      setLoadingFeeId(null);
    }
  };

  const handleOpenPaper = (item: StudentMarkDetail) => {
    const file = getTestFile(item.test);
    if (!file) return;
    setFileModal({
      open: true,
      title: `${item.test.subject} — ${item.test.title}`,
      fileName: file.fileName,
      fileType: file.fileType,
      filePath: file.filePath,
    });
  };

  const handleDownloadPaper = async (item: StudentMarkDetail) => {
    const file = getTestFile(item.test);
    if (!file || downloadingTestId === item.test.id) return;

    setDownloadingTestId(item.test.id);
    try {
      const blob = await downloadTestPaperBlob(file.filePath, file.fileType);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Error downloading test paper from Supabase:', err);
      showToast(
        err instanceof Error ? err.message : 'Failed to download test paper',
        'error'
      );
    } finally {
      setDownloadingTestId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="h-36 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-slate-200 animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-base font-semibold text-[#0F2A4A]">
          Student record not found.
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-4 px-4 py-2.5 rounded-xl bg-[#0F2A4A] text-white text-sm font-semibold"
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F2A4A] pb-20 md:pb-16">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <BrandLogo variant="dark" size="md" />

          {/* Desktop Navigation Tabs */}
          <nav
            aria-label="Parent portal navigation"
            className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl"
          >
            {PARENT_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#0F2A4A] text-white shadow-sm'
                      : 'text-slate-600 hover:text-[#0F2A4A]'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      active ? 'text-[#F5A623]' : 'text-slate-500'
                    }`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold text-[#0F2A4A] leading-tight">
                {student.parentName}
              </p>
              <p className="text-xs text-slate-500">
                Parent · Std {student.standard}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-[#0F2A4A] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {activeTab === 'home' && (
          <>
            {/* Student Identity Banner */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="bg-[#0F2A4A] text-white rounded-2xl p-6 sm:p-7 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[#F5A623] tracking-wide">
                    Standard {student.standard} Progress Report ·{' '}
                    {siteData.academicYear}
                  </p>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1 tracking-tight">
                    {student.name}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-slate-300">
                    <span>Parent: {student.parentName}</span>
                    <span aria-hidden="true">·</span>
                    <span>Joined {formatDate(student.joiningDate)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Status: {student.status === 'active' ? 'Active' : 'Left'}
                    </span>
                  </div>
                </div>

                <div className="bg-white/10 rounded-xl px-5 py-3.5 shrink-0 border border-white/10">
                  <p className="text-xs text-slate-300">Overall Average</p>
                  <p className="font-display text-2xl sm:text-3xl font-bold text-[#F5A623] tabular-nums mt-0.5">
                    {allMarks.length > 0 ? `${summary.avgPct}%` : '—'}
                  </p>
                </div>
              </div>
            </motion.section>

            {/* Fees Due Card (shown only if balance > 0) */}
            {feeSummary.totalBalanceDue > 0 && (
              <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-[#F5A623] text-[#0F2A4A] flex items-center justify-center shrink-0">
                    <IndianRupee className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                      Fees due
                    </p>
                    <p className="font-display text-xl sm:text-2xl font-bold text-[#0F2A4A] tabular-nums mt-0.5">
                      {formatINR(feeSummary.totalBalanceDue)}
                    </p>
                    {feeSummary.earliestDueDate && (
                      <p className="text-xs text-amber-900 mt-0.5 tabular-nums">
                        Earliest due date:{' '}
                        <span className="font-semibold">
                          {formatDate(feeSummary.earliestDueDate)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('fees')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px]"
                >
                  <span>View Fees</span>
                  <ArrowRight className="w-4 h-4 text-[#F5A623]" />
                </button>
              </section>
            )}

            {/* Summary KPI Strip */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Tests Graded
                  </span>
                  <BookOpen className="w-4 h-4 text-[#0F2A4A]" />
                </div>
                <p className="mt-2 font-display text-2xl font-bold text-[#0F2A4A] tabular-nums">
                  {summary.totalTests}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Highest Score
                  </span>
                  <Award className="w-4 h-4 text-[#F5A623]" />
                </div>
                <p className="mt-2 font-display text-2xl font-bold text-[#0F2A4A] tabular-nums">
                  {allMarks.length > 0 ? `${summary.bestPct}%` : '—'}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Latest Subject
                  </span>
                  <Calendar className="w-4 h-4 text-[#0F2A4A]" />
                </div>
                <p className="mt-2 font-display text-xl font-bold text-[#0F2A4A] truncate">
                  {summary.latestSubject}
                </p>
              </div>
            </section>

            {/* Subject Filter Tabs */}
            <section className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSubjectFilter('ALL')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] ${
                  subjectFilter === 'ALL'
                    ? 'bg-[#0F2A4A] text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F2A4A]'
                }`}
              >
                All Subjects
              </button>
              {siteData.subjects.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  onClick={() => setSubjectFilter(subject)}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] ${
                    subjectFilter === subject
                      ? 'bg-[#0F2A4A] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F2A4A]'
                  }`}
                >
                  {subject}
                </button>
              ))}
            </section>

            {/* Performance Trend Chart */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2A4A] flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-[#F5A623]" />
                    <span>Performance Trend</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Percentage scored across chronological tests
                  </p>
                </div>
                {hoveredIdx !== null && chartSeries[hoveredIdx] && (
                  <div className="text-right text-xs">
                    <p className="font-semibold text-[#0F2A4A]">
                      {chartSeries[hoveredIdx].test.subject} ·{' '}
                      <span className="font-mono tabular-nums text-[#E09212]">
                        {chartSeries[hoveredIdx].percentage}%
                      </span>
                    </p>
                    <p className="text-slate-500">
                      {chartSeries[hoveredIdx].marksObtained}/
                      {chartSeries[hoveredIdx].test.totalMarks} marks
                    </p>
                  </div>
                )}
              </div>

              {chartSeries.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
                  No graded tests found for this selection yet.
                </div>
              ) : (
                <PerformanceSvgChart
                  data={chartSeries}
                  hoveredIdx={hoveredIdx}
                  onHover={setHoveredIdx}
                />
              )}
            </section>
          </>
        )}

        {activeTab === 'tests' && (
          <div className="space-y-6">
            {/* Subject Filter Tabs */}
            <section className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSubjectFilter('ALL')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] ${
                  subjectFilter === 'ALL'
                    ? 'bg-[#0F2A4A] text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F2A4A]'
                }`}
              >
                All Subjects
              </button>
              {siteData.subjects.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  onClick={() => setSubjectFilter(subject)}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] ${
                    subjectFilter === subject
                      ? 'bg-[#0F2A4A] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-[#0F2A4A]'
                  }`}
                >
                  {subject}
                </button>
              ))}
            </section>

            {/* Test Results List */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2A4A]">
                  Test Results & Question Papers
                </h2>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {filteredMarks.length}{' '}
                  {filteredMarks.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {filteredMarks.length === 0 ? (
                <div className="p-10 text-center">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
                  <p className="text-sm font-semibold text-[#0F2A4A]">
                    No test marks recorded yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Marks entered by the teacher will appear here automatically.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                          <th className="py-3 px-6">Test & Subject</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4 text-right">Marks</th>
                          <th className="py-3 px-4 text-right">Percentage</th>
                          <th className="py-3 px-4">Teacher Remark</th>
                          <th className="py-3 px-6 text-right">Paper</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredMarks.map((item) => {
                          const pct =
                            item.test.totalMarks > 0
                              ? Math.round(
                                  (item.marksObtained / item.test.totalMarks) *
                                    100
                                )
                              : 0;
                          const file = getTestFile(item.test);
                          const isDownloading =
                            downloadingTestId === item.test.id;
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              <td className="py-3.5 px-6">
                                <p className="font-semibold text-[#0F2A4A]">
                                  {item.test.title}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {item.test.subject}
                                </p>
                              </td>
                              <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                                {formatDate(item.test.testDate)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-[#0F2A4A]">
                                {item.marksObtained} / {item.test.totalMarks}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums">
                                <span
                                  className={
                                    pct >= 75
                                      ? 'text-emerald-700'
                                      : pct >= 50
                                        ? 'text-[#0F2A4A]'
                                        : 'text-amber-700'
                                  }
                                >
                                  {pct}%
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                                {item.remark || (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3.5 px-6 text-right">
                                {!file ? (
                                  <span className="text-xs text-slate-400">
                                    No paper
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPaper(item)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2A4A]/5 hover:bg-[#0F2A4A] text-[#0F2A4A] hover:text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      View Paper
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDownloading}
                                      onClick={() => handleDownloadPaper(item)}
                                      aria-label={`Download ${file.fileName}`}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#0F2A4A] disabled:opacity-50 text-xs font-semibold text-[#0F2A4A] transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>
                                        {isDownloading
                                          ? 'Downloading...'
                                          : 'Download'}
                                      </span>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {filteredMarks.map((item) => {
                      const pct =
                        item.test.totalMarks > 0
                          ? Math.round(
                              (item.marksObtained / item.test.totalMarks) * 100
                            )
                          : 0;
                      const file = getTestFile(item.test);
                      const isDownloading = downloadingTestId === item.test.id;
                      return (
                        <div key={item.id} className="p-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[#0F2A4A]">
                                {item.test.title}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {item.test.subject} ·{' '}
                                {formatDate(item.test.testDate)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono text-sm font-bold text-[#0F2A4A] tabular-nums">
                                {item.marksObtained}/{item.test.totalMarks}
                              </p>
                              <p className="font-mono text-xs font-semibold text-[#E09212] tabular-nums">
                                {pct}%
                              </p>
                            </div>
                          </div>
                          {item.remark && (
                            <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                              Remark: {item.remark}
                            </p>
                          )}
                          {file && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenPaper(item)}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-[#0F2A4A] text-[#0F2A4A] hover:text-white text-xs font-semibold transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                                View Paper
                              </button>
                              <button
                                type="button"
                                disabled={isDownloading}
                                onClick={() => handleDownloadPaper(item)}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:opacity-50 text-xs font-semibold text-[#0F2A4A] hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <Download className="w-4 h-4" />
                                {isDownloading ? 'Downloading...' : 'Download'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {activeTab === 'fees' && (
          <div className="space-y-5">
            {/* Summary Card */}
            <section className="bg-[#0F2A4A] text-white rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#F5A623] uppercase tracking-wide">
                  Total Balance Due
                </p>
                <p className="font-display text-2xl sm:text-3xl font-bold mt-1 tabular-nums">
                  {formatINR(feeSummary.totalBalanceDue)}
                </p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-3 border border-white/10 shrink-0">
                <p className="text-xs text-slate-300">Next Due Date</p>
                <p className="font-display text-base sm:text-lg font-bold text-white mt-0.5 tabular-nums">
                  {feeSummary.earliestDueDate
                    ? formatDate(feeSummary.earliestDueDate)
                    : 'No balance due'}
                </p>
              </div>
            </section>

            {/* Fees List */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2A4A]">
                  Fee Details
                </h2>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {sortedFees.length}{' '}
                  {sortedFees.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {sortedFees.length === 0 ? (
                <div className="p-10 text-center">
                  <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
                  <p className="text-sm font-semibold text-[#0F2A4A]">
                    No fees added yet.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedFees.map((fee) => {
                    const status = computeFeeStatus(fee, today);
                    const isExpanded = expandedFeeId === fee.id;
                    const history = paymentsByFee[fee.id] ?? [];
                    const isLoadingHistory = loadingFeeId === fee.id;

                    return (
                      <div key={fee.id} className="bg-white">
                        <button
                          type="button"
                          onClick={() => handleToggleFeeHistory(fee.id)}
                          aria-expanded={isExpanded}
                          className="w-full text-left p-4 sm:px-6 sm:py-4 hover:bg-slate-50/70 transition-colors cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm sm:text-base font-bold text-[#0F2A4A]">
                                  {fee.title}
                                </p>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-xs font-semibold ${getStatusBadgeClasses(
                                    status
                                  )}`}
                                >
                                  {status}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                                Due date: {formatDate(fee.dueDate)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-slate-400">
                              <span className="text-[11px] font-medium hidden sm:inline">
                                {isExpanded ? 'Hide history' : 'Payment history'}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                            <div>
                              <p className="text-slate-500">Amount</p>
                              <p className="font-mono font-semibold text-[#0F2A4A] tabular-nums mt-0.5">
                                {formatINR(fee.amount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500">Paid</p>
                              <p className="font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
                                {formatINR(fee.paid)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500">Balance</p>
                              <p className="font-mono font-bold text-[#0F2A4A] tabular-nums mt-0.5">
                                {formatINR(fee.balance)}
                              </p>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 sm:px-6 pb-4 pt-1">
                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                              <p className="text-xs font-bold text-[#0F2A4A]">
                                Payment History
                              </p>
                              {isLoadingHistory ? (
                                <p className="text-xs text-slate-500 py-2">
                                  Loading payments...
                                </p>
                              ) : history.length === 0 ? (
                                <p className="text-xs text-slate-500 py-1">
                                  No payments recorded for this fee yet.
                                </p>
                              ) : (
                                <div className="divide-y divide-slate-200/80">
                                  {history.map((p) => (
                                    <div
                                      key={p.id}
                                      className="py-2 flex items-center justify-between gap-3 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-[#0F2A4A] tabular-nums">
                                          {formatDate(p.paidOn)}
                                        </span>
                                        <span className="text-slate-400 mx-1.5">
                                          ·
                                        </span>
                                        <span className="text-slate-600">
                                          {p.mode}
                                        </span>
                                      </div>
                                      <span className="font-mono font-bold text-emerald-700 tabular-nums shrink-0">
                                        {formatINR(p.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Small View-Only Note */}
            <p className="text-center text-xs text-slate-500 pt-1">
              Pay at Patil Classes. Your fees update here once recorded.
            </p>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-5">
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-[#F5A623] uppercase tracking-wide">
                    Student Profile
                  </p>
                  <h2 className="font-display text-xl font-bold text-[#0F2A4A] mt-0.5">
                    {student.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Standard {student.standard} · Academic Year{' '}
                    {siteData.academicYear}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold self-start sm:self-auto ${
                    student.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {student.status === 'active' ? 'Active' : 'Left'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-xs text-slate-500">Parent Name</p>
                  <p className="font-semibold text-[#0F2A4A] mt-1">
                    {student.parentName}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-xs text-slate-500">Joining Date</p>
                  <p className="font-semibold text-[#0F2A4A] mt-1 tabular-nums">
                    {formatDate(student.joiningDate)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 flex items-start gap-3">
                  <Mail className="w-4 h-4 text-[#0F2A4A] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Parent Email</p>
                    <p className="font-semibold text-[#0F2A4A] mt-0.5 break-all">
                      {student.parentEmail}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 flex items-start gap-3">
                  <Phone className="w-4 h-4 text-[#0F2A4A] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      Phone / WhatsApp
                    </p>
                    <p className="font-mono font-semibold text-[#0F2A4A] mt-0.5 tabular-nums">
                      {student.parentPhone}
                      {student.parentWhatsapp &&
                      student.parentWhatsapp !== student.parentPhone
                        ? ` · WA: ${student.parentWhatsapp}`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Bottom Tab Bar (Mobile) */}
      <nav
        aria-label="Mobile parent navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-4 h-16"
      >
        {PARENT_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                active ? 'text-[#0F2A4A]' : 'text-slate-500'
              }`}
            >
              <div
                className={`p-1 rounded-lg ${
                  active ? 'bg-[#F5A623]/20 text-[#0F2A4A]' : ''
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="truncate max-w-full px-1">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <FilePreviewModal
        open={fileModal.open}
        title={fileModal.title}
        fileName={fileModal.fileName}
        fileType={fileModal.fileType}
        filePath={fileModal.filePath}
        onClose={() => setFileModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};

interface ChartPoint extends StudentMarkDetail {
  percentage: number;
}

const PerformanceSvgChart: React.FC<{
  data: ChartPoint[];
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
}> = ({ data, hoveredIdx, onHover }) => {
  const width = 760;
  const height = 220;
  const padLeft = 42;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const coords = data.map((d, i) => {
    const x =
      data.length === 1
        ? padLeft + plotW / 2
        : padLeft + (i / (data.length - 1)) * plotW;
    const y =
      padTop +
      plotH -
      (Math.min(100, Math.max(0, d.percentage)) / 100) * plotH;
    return { x, y, d };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
    .join(' ');

  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x} ${padTop + plotH} L ${coords[0].x} ${padTop + plotH} Z`
      : '';

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[460px] h-52 select-none"
        role="img"
        aria-label="Student percentage trend graph"
      >
        <defs>
          <linearGradient id="patilAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F5A623" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#F5A623" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padTop + plotH - (tick / 100) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray={tick === 0 ? undefined : '4 4'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px] font-mono"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        {coords.length > 1 && <path d={areaPath} fill="url(#patilAreaGrad)" />}

        {coords.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="#0F2A4A"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {coords.map(({ x, y, d }, i) => {
          const isHovered = hoveredIdx === i;
          return (
            <g
              key={d.id}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onHover(i)}
              className="cursor-pointer"
            >
              <circle cx={x} cy={y} r={16} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={isHovered ? 7 : 5}
                fill="#F5A623"
                stroke="#0F2A4A"
                strokeWidth="2.5"
              />
              <text
                x={x}
                y={y - 11}
                textAnchor="middle"
                className="fill-[#0F2A4A] text-[10px] font-mono font-semibold"
              >
                {d.percentage}%
              </text>
              <text
                x={x}
                y={height - 12}
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {d.test.subject.slice(0, 6)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
