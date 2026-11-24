import React, { useState } from 'react';
import {
  Bell,
  ClipboardEdit,
  FileText,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Users,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { OverviewView } from './admin/OverviewView';
import { StudentsView } from './admin/StudentsView';
import { TestsView } from './admin/TestsView';
import { EnterMarksView } from './admin/EnterMarksView';
import { FeesView } from './admin/FeesView';
import { NoticesView } from './admin/NoticesView';
import { MessagesView } from './admin/MessagesView';
import { siteData } from '../siteData';

type AdminTab =
  | 'overview'
  | 'students'
  | 'tests'
  | 'marks'
  | 'fees'
  | 'notices'
  | 'messages';

interface AdminDashboardProps {
  onLogout: () => void;
}

const NAV_ITEMS: Array<{
  id: AdminTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    icon: LayoutDashboard,
  },
  { id: 'students', label: 'Students', shortLabel: 'Students', icon: Users },
  { id: 'tests', label: 'Tests', shortLabel: 'Tests', icon: FileText },
  {
    id: 'marks',
    label: 'Enter Marks',
    shortLabel: 'Marks',
    icon: ClipboardEdit,
  },
  {
    id: 'fees',
    label: 'Fees',
    shortLabel: 'Fees',
    icon: IndianRupee,
  },
  {
    id: 'notices',
    label: 'Notices',
    shortLabel: 'Notices',
    icon: Bell,
  },
  {
    id: 'messages',
    label: 'Messages',
    shortLabel: 'Messages',
    icon: MessageSquare,
  },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [selectedTestForMarks, setSelectedTestForMarks] = useState<
    string | null
  >(null);

  const handleNavigateToMarks = (testId: string) => {
    setSelectedTestForMarks(testId);
    setActiveTab('marks');
  };

  const currentTitle =
    NAV_ITEMS.find((item) => item.id === activeTab)?.label ?? 'Overview';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F2A4A] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F2A4A] text-white border-r border-white/10 z-30">
        <div className="px-5 py-5 border-b border-white/10">
          <BrandLogo variant="light" size="md" showSubtitle />
        </div>

        <nav
          aria-label="Admin navigation"
          className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#F5A623] text-[#0F2A4A]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[#0F2A4A]' : 'text-[#F5A623]'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-slate-300" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="lg:hidden">
                <BrandLogo variant="dark" size="sm" />
              </div>
              <div className="hidden lg:block">
                <h1 className="font-display text-xl font-bold text-[#0F2A4A] leading-tight">
                  {currentTitle}
                </h1>
                <p className="text-xs text-slate-500">
                  {siteData.instituteName} · Standard {siteData.standard} Teacher
                  Portal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onLogout}
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0F2A4A] text-white text-xs font-semibold min-h-[38px]"
              >
                <LogOut className="w-3.5 h-3.5 text-[#F5A623]" />
                <span>Logout</span>
              </button>
              <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
                <span>Academic Year {siteData.academicYear}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Page Title */}
        <div className="lg:hidden px-4 pt-5 pb-1">
          <h1 className="font-display text-xl font-bold text-[#0F2A4A]">
            {currentTitle}
          </h1>
        </div>

        {/* Active View */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="max-w-6xl mx-auto" key={activeTab}>
            {activeTab === 'overview' && (
              <OverviewView
                onNavigateToMarks={handleNavigateToMarks}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}
            {activeTab === 'students' && <StudentsView />}
            {activeTab === 'tests' && (
              <TestsView onNavigateToMarks={handleNavigateToMarks} />
            )}
            {activeTab === 'marks' && (
              <EnterMarksView initialTestId={selectedTestForMarks} />
            )}
            {activeTab === 'fees' && <FeesView />}
            {activeTab === 'notices' && <NoticesView />}
            {activeTab === 'messages' && <MessagesView />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile admin navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-7 h-16"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold transition-colors ${
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
              <span className="truncate max-w-full px-0.5">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
