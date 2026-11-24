import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  TrendingUp,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  getAllMarks,
  getStudents,
  getTests,
  Mark,
  Student,
  Test,
} from '../../lib/dataService';
import { useToast } from '../ToastProvider';

interface OverviewViewProps {
  onNavigateToMarks: (testId: string) => void;
  onNavigateTab: (tab: 'students' | 'tests' | 'marks') => void;
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

export const OverviewView: React.FC<OverviewViewProps> = ({
  onNavigateToMarks,
  onNavigateTab,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    let active = true;
    const loadOverview = async () => {
      setLoading(true);
      try {
        const [stuList, testList, markList] = await Promise.all([
          getStudents(),
          getTests(),
          getAllMarks(),
        ]);
        if (!active) return;
        setStudents(stuList);
        setTests(testList);
        setMarks(markList);
      } catch (err) {
        console.error('Overview load error:', err);
        if (active) {
          showToast(
            err instanceof Error ? err.message : 'Failed to load overview data',
            'error'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    loadOverview();
    return () => {
      active = false;
    };
  }, [showToast]);

  const { stats, recentEntries } = useMemo(() => {
    const activeStudents = students.filter((s) => s.status === 'active');
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}`;

    const testsThisMonth = tests.filter((t) =>
      t.testDate.startsWith(currentMonthPrefix)
    ).length;

    const testMap = new Map(tests.map((t) => [t.id, t]));
    const percentages: number[] = [];
    for (const m of marks) {
      const test = testMap.get(m.testId);
      if (test && test.totalMarks > 0) {
        percentages.push((m.marksObtained / test.totalMarks) * 100);
      }
    }

    const avgPercentage =
      percentages.length > 0
        ? Math.round(
            (percentages.reduce((sum, val) => sum + val, 0) /
              percentages.length) *
              10
          ) / 10
        : 0;

    // Last 5 tests with marks counts
    const recent = tests
      .map((test) => {
        const count = marks.filter((m) => m.testId === test.id).length;
        return { test, studentsMarked: count };
      })
      .filter((entry) => entry.studentsMarked > 0)
      .slice(0, 5);

    return {
      stats: {
        activeStudents: activeStudents.length,
        totalTests: tests.length,
        testsThisMonth,
        avgPercentage,
      },
      recentEntries: recent,
    };
  }, [students, tests, marks]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-200 p-5 h-28 animate-pulse"
            >
              <div className="h-3.5 w-24 bg-slate-200 rounded" />
              <div className="h-7 w-16 bg-slate-200 rounded mt-4" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 h-64 animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6"
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Total Active Students
            </span>
            <div className="h-8 w-8 rounded-lg bg-[#0F2A4A]/5 text-[#0F2A4A] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#0F2A4A] tabular-nums">
            {stats.activeStudents}
          </p>
          <p className="mt-1 text-xs text-slate-500">Standard 10th batch</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Total Tests
            </span>
            <div className="h-8 w-8 rounded-lg bg-[#0F2A4A]/5 text-[#0F2A4A] flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#0F2A4A] tabular-nums">
            {stats.totalTests}
          </p>
          <p className="mt-1 text-xs text-slate-500">Across 6 subjects</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Tests This Month
            </span>
            <div className="h-8 w-8 rounded-lg bg-[#F5A623]/15 text-[#0F2A4A] flex items-center justify-center">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#0F2A4A] tabular-nums">
            {stats.testsThisMonth}
          </p>
          <p className="mt-1 text-xs text-slate-500">Current calendar month</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Average Class Percentage
            </span>
            <div className="h-8 w-8 rounded-lg bg-[#F5A623]/15 text-[#0F2A4A] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-3 font-display text-2xl sm:text-3xl font-bold text-[#0F2A4A] tabular-nums">
            {stats.avgPercentage}%
          </p>
          <p className="mt-1 text-xs text-slate-500">All graded entries</p>
        </div>
      </div>

      {/* Recent Marks Entries */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#0F2A4A]">
              Recent Marks Entries
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Last 5 graded tests with submission count
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('marks')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F2A4A] hover:bg-[#193D68] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Enter Marks</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#F5A623]" />
          </button>
        </div>

        {recentEntries.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
            <p className="text-sm font-semibold text-[#0F2A4A]">
              No marks entries recorded yet
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Create a test and enter marks for the class to see activity here.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('tests')}
              className="mt-4 px-4 py-2 rounded-xl bg-[#F5A623] text-[#0F2A4A] text-xs font-bold"
            >
              Go to Tests
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentEntries.map(({ test, studentsMarked }) => (
              <div
                key={test.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0F2A4A] truncate">
                    {test.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500">
                    <span>{test.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {formatDate(test.testDate)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      Total: {test.totalMarks} marks
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <span className="text-xs font-semibold text-[#0F2A4A] font-mono tabular-nums">
                    {studentsMarked}{' '}
                    {studentsMarked === 1 ? 'student' : 'students'} marked
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateToMarks(test.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-[#0F2A4A] text-xs font-semibold text-[#0F2A4A] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Edit Marks
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
};
