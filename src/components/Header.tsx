import React, { useEffect, useRef, useState } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { AdminPanel } from './AdminPanel';
import {
  Calendar,
  Camera,
  Grid,
  FileText,
  CheckSquare,
  RefreshCw,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Settings,
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const { currentUser, uploads, canReview, isAdmin, canUseCapture, canSeeIntegrations, signOutGoogle } = useSignedInApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (desktopMenuRef.current?.contains(target) || mobileMenuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, [menuOpen]);

  const openAdmin = () => {
    if (!isAdmin) return;
    setAdminOpen(true);
    setMenuOpen(false);
  };

  const signOut = () => {
    setMenuOpen(false);
    void signOutGoogle();
  };

  // Persistent expandable/collapsible state for desktop/tablet sidebar
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('e1_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('e1_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage exceptions
      }
      return next;
    });
  };

  const pendingReviewCount = uploads.filter((u) => u.reviewStatus === 'Pending').length;

  return (
    <>
      {/* ========================================================
          LEFT-SIDE VERTICAL NAVBAR (Desktop & Tablet: md+)
          Expandable & Collapsible with smooth transition
          ======================================================== */}
      <aside
        aria-label="Left Vertical Navigation"
        className={`hidden md:flex flex-col shrink-0 h-screen sticky top-0 glass-nav border-r border-slate-200/80 z-30 justify-between select-none transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20 px-2 py-4 items-center' : 'w-60 lg:w-64 p-4'
        }`}
      >
        {/* Top Header & Navigation */}
        <div className="w-full">
          {/* Brand & Toggle Header Row */}
          {!isCollapsed ? (
            <div>
              <div className="flex items-center justify-between pt-1 pb-3 px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => setActiveTab('today')}
                    className="w-9 h-9 rounded-2xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-md shadow-indigo-500/25 cursor-pointer hover:bg-indigo-700 transition shrink-0"
                    title="EmpireOne CX"
                  >
                    E1
                  </button>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      EmpireOne CX
                    </span>
                    <span
                      onClick={() => setActiveTab('today')}
                      className="font-bold text-slate-900 text-sm tracking-tight truncate cursor-pointer hover:text-indigo-600 transition mt-0.5"
                    >
                      Engagement Capture
                    </span>
                  </div>
                </div>

                {/* Collapse Toggle Button */}
                <button
                  onClick={toggleSidebar}
                  data-testid="collapse-sidebar-btn"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar to icon rail"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 rounded-lg transition cursor-pointer shrink-0 ml-1"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Collapsed Brand & Toggle Column */
            <div className="flex flex-col items-center gap-2 pb-2">
              <button
                onClick={() => setActiveTab('today')}
                className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-md shadow-indigo-500/25 cursor-pointer hover:bg-indigo-700 transition"
                title="EmpireOne CX"
              >
                E1
              </button>
              <button
                onClick={toggleSidebar}
                data-testid="expand-sidebar-btn"
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Primary Navigation Menu */}
          <nav aria-label="Sidebar Primary Navigation" className={`mt-5 space-y-1.5 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
            {!isCollapsed && (
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Workspace
              </div>
            )}

            {/* Today */}
            <button
              data-tab="nav-today"
              onClick={() => setActiveTab('today')}
              title="Today's Focus"
              aria-label="Today's Focus"
              className={
                isCollapsed
                  ? `w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      activeTab === 'today'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`
                  : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                      activeTab === 'today'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                    }`
              }
            >
              <Calendar className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="flex-1 text-left">Today's Focus</span>}
            </button>

            {canUseCapture && (
            <button
              data-tab="nav-capture"
              onClick={() => setActiveTab('capture')}
              title="Capture Media"
              aria-label="Capture Media"
              className={
                isCollapsed
                  ? `w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer relative ${
                      activeTab === 'capture'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-indigo-700 hover:bg-indigo-50/80 bg-indigo-50/50'
                    }`
                  : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                      activeTab === 'capture'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-indigo-700 hover:bg-indigo-50/80 bg-indigo-50/50 font-semibold'
                    }`
              }
            >
              <Camera className="w-4 h-4 shrink-0" />
              {!isCollapsed ? (
                <>
                  <span className="flex-1 text-left">Capture Media</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                      activeTab === 'capture'
                        ? 'bg-white/20 text-white'
                        : 'bg-indigo-100 text-indigo-700 font-bold'
                    }`}
                  >
                    Snap
                  </span>
                </>
              ) : (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 ring-1 ring-white" />
              )}
            </button>
            )}

            {/* Library */}
            <button
              data-tab="nav-library"
              onClick={() => setActiveTab('library')}
              title="Media Library"
              aria-label="Media Library"
              className={
                isCollapsed
                  ? `w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      activeTab === 'library'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`
                  : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                      activeTab === 'library'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                    }`
              }
            >
              <Grid className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="flex-1 text-left">Media Library</span>}
            </button>

            {/* Shift Reports */}
            <button
              data-tab="nav-reports"
              onClick={() => setActiveTab('reports')}
              title="Shift Reports"
              aria-label="Shift Reports"
              className={
                isCollapsed
                  ? `w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      activeTab === 'reports'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`
                  : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                      activeTab === 'reports'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                    }`
              }
            >
              <FileText className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="flex-1 text-left">Shift Reports</span>}
            </button>

            {/* Review Queue (for Site Leads & Executives) */}
            {canReview && (
              <button
                data-tab="nav-review"
                onClick={() => setActiveTab('review')}
                title={`Review Queue (${pendingReviewCount} pending)`}
                aria-label={`Review Queue, ${pendingReviewCount} items pending`}
                className={
                  isCollapsed
                    ? `w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer relative ${
                        activeTab === 'review'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                      }`
                    : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition cursor-pointer ${
                        activeTab === 'review'
                          ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                      }`
                }
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                {!isCollapsed ? (
                  <>
                    <span className="flex-1 text-left">Review Queue</span>
                    {pendingReviewCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white leading-none">
                        {pendingReviewCount}
                      </span>
                    )}
                  </>
                ) : (
                  pendingReviewCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 text-[9px] font-bold rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs ring-2 ring-white">
                      {pendingReviewCount}
                    </span>
                  )
                )}
              </button>
            )}

            {!isCollapsed ? (
              <div className="pt-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {canSeeIntegrations ? 'Integrations' : 'Help'}
              </div>
            ) : (
              <div className="w-8 my-2 border-t border-slate-200/70 mx-auto" />
            )}

            {canSeeIntegrations && (
            <button
              data-tab="nav-connection"
              onClick={() => setActiveTab('connection')}
              title="Integrations"
              aria-label="Integrations"
              className={
                isCollapsed
                  ? `w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      activeTab === 'connection'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`
                  : `w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                      activeTab === 'connection'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                    }`
              }
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="flex-1 text-left">Integrations</span>}
            </button>
            )}

            {/* User Manual */}
            <button
              data-tab="nav-manual"
              onClick={() => setActiveTab('manual')}
              title="User Manual"
              aria-label="User Manual"
              className={
                isCollapsed
                  ? `w-11 h-11 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      activeTab === 'manual'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`
                  : `w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                      activeTab === 'manual'
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-medium'
                    }`
              }
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="flex-1 text-left">User Manual</span>}
            </button>
          </nav>
        </div>

        <div className="pt-3 border-t border-slate-200/80 w-full" ref={desktopMenuRef}>
          <ProfileMenu
            open={menuOpen}
            collapsed={isCollapsed}
            isAdmin={isAdmin}
            name={currentUser.Name}
            role={currentUser.Role}
            site={currentUser.Site}
            avatar={currentUser.Avatar}
            onToggle={() => setMenuOpen((open) => !open)}
            onAdmin={openAdmin}
            onSignOut={signOut}
          />
        </div>
      </aside>

      {/* ========================================================
          MOBILE TOP HEADER (Hidden on Desktop & Tablet: md:hidden)
          ======================================================== */}
      <header className="md:hidden sticky top-0 z-30 glass-nav border-b border-white/60">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('today')}
              className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs cursor-pointer"
            >
              E1
            </button>
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 text-xs sm:text-sm tracking-tight leading-none">
                Engagement Capture
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5 font-medium">
                EmpireOne CX
              </span>
            </div>
          </div>

          {/* User Profile (Mobile) */}
          <div ref={mobileMenuRef}>
            <ProfileMenu
              open={menuOpen}
              compact
              isAdmin={isAdmin}
              name={currentUser.Name}
              role={currentUser.Role}
              site={currentUser.Site}
              avatar={currentUser.Avatar}
              onToggle={() => setMenuOpen((open) => !open)}
              onAdmin={openAdmin}
              onSignOut={signOut}
            />
          </div>
        </div>
      </header>

      {/* ========================================================
          MOBILE BOTTOM THUMB BAR (Hidden on Desktop & Tablet: md:hidden)
          ======================================================== */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-40 glass-nav border-t border-white/80 shadow-lg md:hidden"
      >
        <div className={`grid items-center h-16 max-w-md mx-auto px-2 ${canUseCapture ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {/* Tab 1: Today */}
          <button
            data-tab="mobile-today"
            onClick={() => setActiveTab('today')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer transition ${
              activeTab === 'today' ? 'text-indigo-600 font-semibold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] mt-1">Today</span>
          </button>

          {canUseCapture && (
          <button
            data-tab="mobile-capture"
            onClick={() => setActiveTab('capture')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer transition ${
              activeTab === 'capture' ? 'text-indigo-600 font-semibold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center transition shadow-xs ${
                activeTab === 'capture'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-600'
              }`}
            >
              <Camera className="w-4 h-4" />
            </div>
            <span className="text-[10px] mt-0.5">Capture</span>
          </button>
          )}

          {/* Tab 3: Library */}
          <button
            data-tab="mobile-library"
            onClick={() => setActiveTab('library')}
            className={`flex flex-col items-center justify-center h-full cursor-pointer transition ${
              activeTab === 'library' ? 'text-indigo-600 font-semibold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Grid className="w-5 h-5" />
            <span className="text-[10px] mt-1">Library</span>
          </button>

          {/* Tab 4: Review Queue (for Leads/Admins) or Reports (for Officers) */}
          {canReview ? (
            <button
              data-tab="mobile-review"
              onClick={() => setActiveTab('review')}
              className={`flex flex-col items-center justify-center h-full cursor-pointer transition relative ${
                activeTab === 'review' ? 'text-indigo-600 font-semibold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <CheckSquare className="w-5 h-5" />
              {pendingReviewCount > 0 && (
                <span className="absolute top-2.5 right-6 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
              )}
              <span className="text-[10px] mt-1">Review</span>
            </button>
          ) : (
            <button
              data-tab="mobile-reports"
              onClick={() => setActiveTab('reports')}
              className={`flex flex-col items-center justify-center h-full cursor-pointer transition ${
                activeTab === 'reports' ? 'text-indigo-600 font-semibold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span className="text-[10px] mt-1">Report</span>
            </button>
          )}
        </div>
      </nav>
      {isAdmin && adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </>
  );
};

const ProfileMenu: React.FC<{
  open: boolean;
  collapsed?: boolean;
  compact?: boolean;
  isAdmin: boolean;
  name: string;
  role: string;
  site: string;
  avatar?: string;
  onToggle: () => void;
  onAdmin: () => void;
  onSignOut: () => void;
}> = ({ open, collapsed, compact, isAdmin, name, role, site, avatar, onToggle, onAdmin, onSignOut }) => {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  const portrait = avatar ? (
    <img src={avatar} alt={name} className="w-full h-full rounded-full object-cover" />
  ) : (
    <span className="text-[11px] font-bold text-indigo-700">{letter}</span>
  );

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="profile-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        title={`${name} (${role} · ${site})`}
        className={
          compact
            ? 'flex items-center gap-1.5 bg-white/80 px-2.5 py-1.5 rounded-2xl border border-white/80 shadow-xs text-xs cursor-pointer'
            : collapsed
              ? 'w-10 h-10 mx-auto rounded-full ring-2 ring-indigo-500/20 flex items-center justify-center bg-white shadow-2xs cursor-pointer'
              : 'w-full flex items-center gap-2.5 p-2 rounded-2xl bg-white/70 border border-slate-200/60 shadow-2xs text-left cursor-pointer'
        }
      >
        <span
          className={
            compact
              ? 'w-5 h-5 rounded-full overflow-hidden ring-1 ring-indigo-500/30 bg-indigo-50 flex items-center justify-center'
              : 'w-8 h-8 rounded-full overflow-hidden ring-2 ring-indigo-500/20 bg-indigo-50 flex items-center justify-center shrink-0'
          }
        >
          {portrait}
        </span>
        {!collapsed && (
          <span className="min-w-0 text-left">
            {compact ? (
              <span className="font-semibold text-slate-800 text-xs">{name.split(' ')[0]}</span>
            ) : (
              <>
                <span className="block text-xs font-semibold text-slate-900 truncate">{name}</span>
                <span className="block text-[10px] text-slate-500 truncate">
                  {role} · {site}
                </span>
              </>
            )}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 min-w-44 rounded-2xl border border-slate-200 bg-white shadow-lg p-1 ${
            compact ? 'right-0 top-full mt-2' : 'left-0 right-0 bottom-full mb-2'
          }`}
        >
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              data-testid="open-admin-panel"
              onClick={onAdmin}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              Admin panel
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};
