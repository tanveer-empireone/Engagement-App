import React, { useState, useMemo } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { UserActivity, ActivityCategory, ReviewStatus } from '../types';
import {
  ClipboardList,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Trash2,
  Edit2,
  Send,
  Star,
  Camera,
  ChevronRight,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  Users,
  User
} from 'lucide-react';

const CATEGORIES: { label: string; value: ActivityCategory; color: string }[] = [
  { label: 'Floor Engagement', value: 'Floor Engagement', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { label: 'Huddle & Brief', value: 'Huddle & Briefing', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { label: 'Recognition', value: 'Employee Recognition', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Morale & Games', value: 'Wellness & Morale', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { label: 'Spot Check', value: 'Spot Check', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { label: 'Event Prep', value: 'Event Prep', color: 'bg-pink-50 text-pink-700 border-pink-200' },
  { label: 'Administrative', value: 'Administrative', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { label: 'Other', value: 'Other', color: 'bg-slate-50 text-slate-600 border-slate-200' }
];

const DURATIONS = ['15 mins', '30 mins', '45 mins', '1 hour', '1.5 hours', '2 hours', '3+ hours'];

interface MyActivitiesViewProps {
  onNavigateToCapture: () => void;
  onNavigateToEOD: () => void;
}

export const MyActivitiesView: React.FC<MyActivitiesViewProps> = ({ onNavigateToCapture, onNavigateToEOD }) => {
  const {
    currentUser,
    activities,
    addActivity,
    updateActivity,
    deleteActivity,
    uploads,
    directions,
    canReview,
    reviewUpload,
    isAdmin,
    isDirector
  } = useSignedInApp();

  const todayYmd = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayYmd);

  // Admin or Director can view all team members' submissions and activities
  const canViewAllTeam = Boolean(
    isAdmin || isDirector || currentUser.Role === 'Admin' || currentUser.Role === 'Director'
  );
  // Default to 'all' for Admin/Director so they immediately see team activity, or can toggle to 'mine'
  const [adminScope, setAdminScope] = useState<'all' | 'mine'>('all');
  const isViewingAll = canViewAllTeam && adminScope === 'all';

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('Floor Engagement');
  const [duration, setDuration] = useState('30 mins');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'reshoot' | 'approved'>('all');

  // Filter activities: Admin/Director can see all users, regular users only see their own
  const scopedActivities = useMemo(() => {
    return activities.filter((a) => {
      const isOwner = a.officerEmail?.toLowerCase() === currentUser.Email.toLowerCase();
      const isDate = a.date === selectedDate;
      if (isViewingAll) {
        return isDate;
      }
      return isOwner && isDate;
    });
  }, [activities, currentUser.Email, selectedDate, isViewingAll]);

  // Media uploads for the selected date
  const scopedUploadsToday = useMemo(() => {
    return uploads.filter((u) => {
      const isDate = u.shiftDate === selectedDate;
      if (isViewingAll) {
        return isDate;
      }
      return u.officer.toLowerCase() === currentUser.Email.toLowerCase() && isDate;
    });
  }, [uploads, currentUser.Email, selectedDate, isViewingAll]);

  // All uploads for this scope (across shifts)
  const scopedAllUploads = useMemo(() => {
    if (isViewingAll) {
      return uploads;
    }
    return uploads.filter((u) => u.officer.toLowerCase() === currentUser.Email.toLowerCase());
  }, [uploads, currentUser.Email, isViewingAll]);

  // Uploads requiring reshoot / revisions
  const scopedReshootItems = useMemo(() => {
    if (isViewingAll) {
      return uploads.filter((u) => u.reviewStatus === 'Reshoot');
    }
    return uploads.filter(
      (u) =>
        u.officer.toLowerCase() === currentUser.Email.toLowerCase() &&
        u.reviewStatus === 'Reshoot'
    );
  }, [uploads, currentUser.Email, isViewingAll]);

  // Uploads approved / top picks
  const scopedApprovedItems = useMemo(() => {
    if (isViewingAll) {
      return uploads.filter((u) => u.reviewStatus === 'Accepted' || u.topPick);
    }
    return uploads.filter(
      (u) =>
        u.officer.toLowerCase() === currentUser.Email.toLowerCase() &&
        (u.reviewStatus === 'Accepted' || u.topPick)
    );
  }, [uploads, currentUser.Email, isViewingAll]);

  // Acknowledged directions
  const scopedAcknowledgedTasks = useMemo(() => {
    if (isViewingAll) {
      return directions.filter((d) => d.acknowledged || (d.acknowledgedBy && d.acknowledgedBy.length > 0));
    }
    return directions.filter((d) => d.acknowledged || d.acknowledgedBy?.includes(currentUser.Email));
  }, [directions, currentUser.Email, isViewingAll]);

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateActivity(editingId, {
          title: title.trim(),
          category,
          duration,
          notes: notes.trim()
        });
      } else {
        await addActivity({
          title: title.trim(),
          category,
          duration,
          status: 'Completed',
          notes: notes.trim(),
          date: selectedDate
        });
      }

      // Reset
      setTitle('');
      setNotes('');
      setCategory('Floor Engagement');
      setDuration('30 mins');
      setEditingId(null);
      setIsFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (act: UserActivity) => {
    setTitle(act.title);
    setCategory(act.category);
    setDuration(act.duration || '30 mins');
    setNotes(act.notes || '');
    setEditingId(act.id);
    setIsFormOpen(true);
  };

  const toggleActivityStatus = async (act: UserActivity) => {
    const nextStatus = act.status === 'Completed' ? 'In Progress' : 'Completed';
    await updateActivity(act.id, { status: nextStatus });
  };

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-4xl mx-auto">
      {/* 1. Header with Title & Date Switcher */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-white/70 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-indigo-600 text-white shadow-xs">
              <ClipboardList className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                My Activities
              </h2>
              <p className="text-xs text-slate-500">
                Log daily tasks, track feedback &amp; revisions, and accumulate directly for EOD
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {canViewAllTeam && (
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/60 text-xs">
              <button
                type="button"
                onClick={() => setAdminScope('all')}
                className={`px-3 py-1 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  adminScope === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All Team</span>
              </button>
              <button
                type="button"
                onClick={() => setAdminScope('mine')}
                className={`px-3 py-1 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  adminScope === 'mine'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>My Own</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
            />
          </div>
          {selectedDate !== todayYmd && (
            <button
              type="button"
              onClick={() => setSelectedDate(todayYmd)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* 2. EOD Accumulator Card (Automatically compiles everything for EOD) */}
      <div className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 max-w-lg">
            <div className="flex items-center gap-1.5 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Accumulated for End of Day (EOD) {isViewingAll ? '· All Team Overview' : '· My Personal Overview'}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold">
              {scopedActivities.length} Activities · {scopedUploadsToday.length} Photos · {scopedAcknowledgedTasks.length} Tasks
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isViewingAll
                ? 'Showing operational activity and uploads across all team members for End of Day compilation.'
                : 'All logged activities, photo uploads, and acknowledged tasks are pre-populated into your EOD Report. No external spreadsheet or tool needed.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateToEOD}
            className="px-4 py-2.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 active:scale-[0.98] text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 cursor-pointer self-start md:self-auto shrink-0"
          >
            <span>Review &amp; Submit EOD Report</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* 4-Stat Metric Pill Strip */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
          <div className="bg-white/10 rounded-xl p-2">
            <span className="text-[10px] text-slate-300 block">Activities Logged</span>
            <span className="text-base font-bold tabular-nums">{scopedActivities.length}</span>
          </div>
          <div className="bg-white/10 rounded-xl p-2">
            <span className="text-[10px] text-slate-300 block">Photos / Media</span>
            <span className="text-base font-bold tabular-nums">{scopedUploadsToday.length}</span>
          </div>
          <div className="bg-white/10 rounded-xl p-2">
            <span className="text-[10px] text-slate-300 block">Top Picks</span>
            <span className="text-base font-bold tabular-nums text-amber-300">
              {scopedUploadsToday.filter((u) => u.topPick).length}
            </span>
          </div>
          <div className="bg-white/10 rounded-xl p-2">
            <span className="text-[10px] text-slate-300 block">Revisions Addressed</span>
            <span className="text-base font-bold tabular-nums text-emerald-300">
              {scopedReshootItems.length === 0 ? '✓ None pending' : `${scopedReshootItems.length} active`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Review & Revisions Feed ("Where Review should come to") */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-white/70 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Review &amp; Revisions Queue
            </h3>
            {isViewingAll && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                All Team
              </span>
            )}
            {scopedReshootItems.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                {scopedReshootItems.length} Revision{scopedReshootItems.length > 1 ? 's' : ''} Needed
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-xl font-semibold transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({scopedAllUploads.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('reshoot')}
              className={`px-2.5 py-1 rounded-xl font-semibold transition cursor-pointer ${
                statusFilter === 'reshoot'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Revisions ({scopedReshootItems.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('approved')}
              className={`px-2.5 py-1 rounded-xl font-semibold transition cursor-pointer ${
                statusFilter === 'approved'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Approved ({scopedApprovedItems.length})
            </button>
          </div>
        </div>

        {/* Filtered Review Items */}
        {(() => {
          const displayed =
            statusFilter === 'reshoot'
              ? scopedReshootItems
              : statusFilter === 'approved'
              ? scopedApprovedItems
              : scopedAllUploads;

          if (displayed.length === 0) {
            return (
              <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-slate-50/50 border border-dashed border-slate-200">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="font-semibold text-slate-700 text-sm">
                  {statusFilter === 'reshoot'
                    ? 'No revisions needed'
                    : statusFilter === 'approved'
                    ? 'No approved items in this filter'
                    : 'No uploads in the queue yet'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                  {isViewingAll
                    ? 'When team members submit photos or videos, their uploads and review feedback will appear here.'
                    : 'When you take photos or submit media, your uploads and review feedback will appear right here.'}
                </p>
              </div>
            );
          }

          return (
            <div className="grid sm:grid-cols-2 gap-3">
              {displayed.slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition-all flex items-start gap-3 ${
                    item.reviewStatus === 'Reshoot'
                      ? 'bg-amber-50/90 border-amber-200 ring-1 ring-amber-400/40'
                      : item.reviewStatus === 'Accepted' || item.topPick
                      ? 'bg-white/90 border-emerald-200'
                      : 'bg-white/80 border-slate-200/70'
                  }`}
                >
                  {item.mediaUrl ? (
                    <img
                      src={item.mediaUrl}
                      alt={item.topic}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                        const fb = (e.target as HTMLElement).nextElementSibling;
                        if (fb) (fb as HTMLElement).style.display = 'flex';
                      }}
                      className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-200"
                    />
                  ) : null}
                  <div
                    className={`w-14 h-14 rounded-xl bg-slate-900 text-white/80 shrink-0 border border-slate-200 items-center justify-center ${
                      item.mediaUrl ? 'hidden' : 'flex'
                    }`}
                  >
                    <Camera className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-slate-900 truncate">{item.topic}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.reviewStatus === 'Reshoot'
                            ? 'bg-amber-200 text-amber-900'
                            : item.reviewStatus === 'Accepted'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.reviewStatus}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-400 truncate">
                      {isViewingAll && (
                        <span className="font-semibold text-slate-600 mr-1">
                          {item.officerName || item.officer} ·
                        </span>
                      )}
                      {item.shiftDate} · {item.spot || item.site}
                    </div>

                    {item.reviewNote && (
                      <p className="text-[11px] text-slate-700 mt-1.5 bg-white/70 p-1.5 rounded-lg border border-slate-200/60 leading-snug">
                        <span className="font-semibold text-slate-900">Reviewer: </span>
                        &ldquo;{item.reviewNote}&rdquo;
                      </p>
                    )}

                    {item.reviewStatus === 'Reshoot' && (
                      <div className="mt-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={onNavigateToCapture}
                          className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer transition shadow-2xs flex items-center gap-1"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Reshoot Photo</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* 4. Daily Activities Logger */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-white/70 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Daily Activity Log ({scopedActivities.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              {isViewingAll
                ? 'Team activities logged across shifts and sites. Feeds automatically into EOD.'
                : 'Log engagements throughout your shift. Feeds automatically into your EOD.'}
            </p>
          </div>

          {!isFormOpen && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setTitle('');
                setNotes('');
                setIsFormOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Activity</span>
            </button>
          )}
        </div>

        {/* Quick Add / Edit Activity Form */}
        {isFormOpen && (
          <form
            onSubmit={handleSaveActivity}
            className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900">
                {editingId ? 'Edit Activity' : 'Add New Daily Activity'}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingId(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-2">
              <input
                required
                type="text"
                placeholder="Activity title (e.g., Morning Floor Walk, CSAT Celebration Huddle)..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="glass-input w-full text-xs px-3 py-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden"
                autoFocus
              />

              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Category:
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ActivityCategory)}
                    className="glass-input w-full text-xs px-2.5 py-1.5 rounded-xl text-slate-800 cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Duration:
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="glass-input w-full text-xs px-2.5 py-1.5 rounded-xl text-slate-800 cursor-pointer"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                rows={2}
                placeholder="Key outcomes, participant count, or notes (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="glass-input w-full text-xs px-3 py-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingId(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs cursor-pointer transition"
              >
                {isSubmitting ? 'Saving...' : editingId ? 'Update Activity' : 'Save to Log'}
              </button>
            </div>
          </form>
        )}

        {/* List of Logged Activities */}
        {scopedActivities.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 rounded-2xl bg-slate-50/50 border border-dashed border-slate-200">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
            <p className="font-semibold text-slate-700 text-sm">
              No activities logged for {selectedDate === todayYmd ? 'today' : selectedDate}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
              {isViewingAll
                ? 'No activities have been recorded yet for this date. Click "+ Log Activity" above to add one.'
                : 'Click "+ Log Activity" above to add morning briefings, floor games, or engagement checks.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {scopedActivities.map((act) => {
              const catMeta = CATEGORIES.find((c) => c.value === act.category) || CATEGORIES[0];
              const isDone = act.status === 'Completed';
              const canEditThis = canViewAllTeam || act.officerEmail?.toLowerCase() === currentUser.Email.toLowerCase();

              return (
                <div
                  key={act.id}
                  className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                    isDone ? 'bg-white/80 border-slate-200/70' : 'bg-white border-amber-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleActivityStatus(act)}
                      title={isDone ? 'Mark in progress' : 'Mark completed'}
                      className="mt-0.5 shrink-0 text-slate-400 hover:text-indigo-600 cursor-pointer transition-colors"
                    >
                      <CheckCircle2
                        className={`w-4 h-4 ${isDone ? 'text-emerald-600 fill-emerald-50' : 'text-slate-300'}`}
                      />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catMeta.color}`}
                        >
                          {catMeta.label}
                        </span>
                        {act.duration && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            {act.duration}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-semibold ${
                            isDone ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {act.status}
                        </span>
                        {isViewingAll && (
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {act.officerName || act.officerEmail} {act.site ? `(${act.site})` : ''}
                          </span>
                        )}
                      </div>

                      <h4
                        className={`text-xs font-bold text-slate-900 leading-snug ${
                          isDone ? 'line-through text-slate-500' : ''
                        }`}
                      >
                        {act.title}
                      </h4>

                      {act.notes && (
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">
                          {act.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {canEditThis && (
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleEditClick(act)}
                        aria-label="Edit activity"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteActivity(act.id)}
                        aria-label="Delete activity"
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
