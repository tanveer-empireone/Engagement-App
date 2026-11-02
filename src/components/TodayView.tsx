import React, { useState, useEffect } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { SHIFTS_LIST } from '../utils/idGenerator';
import { DirectionMessage } from '../types';
import { canPersonSeeTask, isUniversalTask } from '../utils/access';
import {
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Send,
  Star,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Layers
} from 'lucide-react';

interface TodayViewProps {
  onNavigateToCapture: () => void;
  onNavigateToReports: () => void;
}

export const TodayView: React.FC<TodayViewProps> = ({ onNavigateToCapture, onNavigateToReports }) => {
  const {
    currentUser,
    directions,
    acknowledgeDirection,
    publishDirection,
    canPublish,
    uploads,
    shiftReports,
    getTopPickRoom,
    canUseCapture,
    setActiveShift
  } = useSignedInApp();

  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [selectedFocusId, setSelectedFocusId] = useState<string>('all');
  const [isFocusExpanded, setIsFocusExpanded] = useState<boolean>(true);

  const todayYmd = new Date().toISOString().slice(0, 10);
  const myTodayUploads = uploads.filter(
    (u) =>
      u.officer.toLowerCase() === currentUser.Email.toLowerCase() &&
      u.shiftDate === todayYmd
  );

  const myReshootUploads = uploads.filter(
    (u) =>
      u.officer.toLowerCase() === currentUser.Email.toLowerCase() &&
      u.reviewStatus === 'Reshoot'
  );

  const topPickRoom = getTopPickRoom(currentUser.Site, currentUser.Shift || 'Peak', 'Daily', '', todayYmd);

  const myShiftReport = shiftReports.find(
    (r) =>
      r.officer.toLowerCase() === currentUser.Email.toLowerCase() &&
      r.shiftDate === todayYmd
  );

  // Focus on directions restricted to this user's role and specific site
  const activeDirections = directions.filter((d) => canPersonSeeTask(currentUser, d));

  const publishedDirections = activeDirections.filter((d) => d.status === 'Published');
  const draftDirections = activeDirections.filter((d) => d.status === 'Draft');

  const isAcknowledged = (d: DirectionMessage) =>
    Boolean(d.acknowledged || d.acknowledgedBy?.includes(currentUser.Email));

  const unacknowledgedDirections = publishedDirections.filter((d) => !isAcknowledged(d));
  const unacknowledgedCount = unacknowledgedDirections.length;

  const [openTaskIds, setOpenTaskIds] = useState<Set<string>>(() => {
    return new Set(publishedDirections.map((d) => d.feedbackId));
  });

  // Keep all newly arrived tasks open by default
  useEffect(() => {
    setOpenTaskIds((prev) => {
      const next = new Set(prev);
      publishedDirections.forEach((d) => {
        if (!prev.has(d.feedbackId) && !isAcknowledged(d)) {
          next.add(d.feedbackId);
        }
      });
      return next;
    });
  }, [publishedDirections.length]);

  const toggleTaskOpen = (feedbackId: string) => {
    setOpenTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(feedbackId)) {
        next.delete(feedbackId);
      } else {
        next.add(feedbackId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setOpenTaskIds(new Set(publishedDirections.map((d) => d.feedbackId)));
  };

  const collapseAll = () => {
    setOpenTaskIds(new Set());
  };

  const handleAcknowledge = (feedbackId: string, customReply?: string) => {
    const textToSend = customReply !== undefined ? customReply : (activeReplyId === feedbackId ? replyText : undefined);
    acknowledgeDirection(feedbackId, textToSend);
    if (activeReplyId === feedbackId) {
      setActiveReplyId(null);
      setReplyText('');
    }
  };

  const handleAcknowledgeAll = () => {
    unacknowledgedDirections.forEach((d) => {
      acknowledgeDirection(d.feedbackId);
    });
  };

  const allExpanded = publishedDirections.length > 0 && publishedDirections.every((d) => openTaskIds.has(d.feedbackId));

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-xl mx-auto">
      {/* 1. Greeting & Rotating Shift Selector */}
      <div className="flex items-center justify-between pt-1 px-1">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Hi, {currentUser.Name.split(' ')[0]}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-slate-500 font-medium">{currentUser.Site} · </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shift:</span>
            <select
              value={currentUser.Shift || 'Peak'}
              onChange={(e) => setActiveShift(e.target.value)}
              aria-label="Select active rotating shift"
              className="text-xs font-semibold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200/60 rounded-lg px-2 py-0.5 cursor-pointer transition-colors"
              title="Click to switch your working shift for today"
            >
              {SHIFTS_LIST.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Shift Status */}
        <div className="flex items-center gap-2 text-xs">
          <div className="text-right">
            <span className="font-bold text-slate-900 tabular-nums">{myTodayUploads.length}</span>
            <span className="text-slate-400 text-[11px] block">uploaded</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div className="text-right">
            <span className="font-bold text-indigo-600 tabular-nums">{topPickRoom.left}</span>
            <span className="text-slate-400 text-[11px] block">stars left</span>
          </div>
        </div>
      </div>

      {/* Reshoot Feedback Attention Banner */}
      {myReshootUploads.length > 0 && (
        <div className="p-4 rounded-3xl bg-amber-50/90 border border-amber-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-amber-100 text-amber-700">
                <AlertCircle className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-amber-950">Action Required: Reshoot Requested</h3>
                <p className="text-[11px] text-amber-800">
                  {myReshootUploads.length} submission{myReshootUploads.length > 1 ? 's need' : ' needs'} attention based on reviewer feedback.
                </p>
              </div>
            </div>
            {canUseCapture && (
              <button
                type="button"
                onClick={onNavigateToCapture}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer transition-colors"
              >
                Reshoot
              </button>
            )}
          </div>

          <div className="space-y-2">
            {myReshootUploads.slice(0, 3).map((item) => (
              <div key={item.id} className="p-2.5 rounded-2xl bg-white/90 border border-amber-200/60 flex items-start gap-3">
                {item.mediaUrl ? (
                  <img
                    src={item.mediaUrl}
                    alt={item.id}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                      const fb = (e.target as HTMLElement).nextElementSibling;
                      if (fb) (fb as HTMLElement).style.display = 'flex';
                    }}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200"
                  />
                ) : null}
                <div
                  className={`w-12 h-12 rounded-xl bg-slate-900 text-white/80 shrink-0 border border-slate-200 items-center justify-center ${
                    item.mediaUrl ? 'hidden' : 'flex'
                  }`}
                >
                  <Camera className="w-5 h-5 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-900 truncate">{item.topic}</span>
                    <span className="text-[10px] text-slate-400">{item.spot}</span>
                  </div>
                  <p className="text-[11px] text-amber-900 font-medium mt-0.5 bg-amber-50/80 p-1.5 rounded-lg border border-amber-100">
                    &ldquo;{item.reviewNote || 'Please capture a clearer photo with better lighting or participants in frame.'}&rdquo;
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canUseCapture && (
      <button
        onClick={onNavigateToCapture}
        className="w-full glass-card hover:bg-white/90 active:scale-[0.99] p-5 rounded-3xl border border-white/80 shadow-sm flex items-center justify-between transition cursor-pointer group"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 group-hover:scale-105 transition">
            <Camera className="w-6 h-6" />
          </div>
          <div className="text-left">
            <h3 className="text-base font-bold text-slate-900">Upload Photos</h3>
            <p className="text-xs text-slate-500">Tap to snap or pick files from your shift</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition">
          <ArrowRight className="w-4 h-4" />
        </div>
      </button>
      )}

      {/* 3. Today's Focus: Complete List of All Tasks with Accordion Open & Close Dropdowns */}
      {publishedDirections.length === 0 ? (
        <div className="glass-card rounded-3xl p-5 border border-white/70 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-indigo-600 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Today&apos;s Focus
            </span>
            <span className="text-[11px] text-slate-400">Standard Shift</span>
          </div>
          <h4 className="text-sm font-bold text-slate-900">
            All caught up on directions
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            No specific daily focus tasks have been posted for {currentUser.Site} yet. Continue with standard site engagement routines and daily spot checks.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-3xl p-4 sm:p-5 border border-white/70 shadow-sm space-y-3.5">
          {/* Header with Title, Counts, and Expand/Collapse Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-slate-100">
            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 min-w-0">
              <span className="font-semibold text-indigo-600 uppercase tracking-wider text-[10px] flex items-center gap-1.5 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Today&apos;s Focus
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 shrink-0">
                {publishedDirections.length} task{publishedDirections.length > 1 ? 's' : ''}
              </span>
              {unacknowledgedCount > 0 ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 shrink-0">
                  {unacknowledgedCount} unacknowledged
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  All acknowledged
                </span>
              )}
            </div>

            {/* Quick Actions Header: Acknowledge All & Expand/Collapse Toggle */}
            <div className="flex items-center gap-2 justify-between sm:justify-end">
              {unacknowledgedCount > 1 && (
                <button
                  type="button"
                  onClick={handleAcknowledgeAll}
                  className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white cursor-pointer transition shadow-2xs flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Acknowledge all ({unacknowledgedCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={allExpanded ? collapseAll : expandAll}
                className="text-xs font-semibold px-2.5 py-1 rounded-xl border border-indigo-200/70 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-700 cursor-pointer transition flex items-center gap-1 shrink-0"
                title={allExpanded ? 'Collapse all tasks' : 'Open all tasks'}
              >
                <span>{allExpanded ? 'Collapse all' : 'Expand all'}</span>
                {allExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Full List of All Tasks with Dropdown Open/Close Accordion */}
          <div className="space-y-3">
            {publishedDirections.map((dir, idx) => {
              const acked = isAcknowledged(dir);
              const isOpen = openTaskIds.has(dir.feedbackId);
              const isReplying = activeReplyId === dir.feedbackId;

              return (
                <div
                  key={dir.feedbackId}
                  className={`rounded-2xl transition-all border overflow-hidden ${
                    !acked
                      ? 'bg-white border-indigo-200/90 shadow-xs ring-1 ring-indigo-500/10'
                      : 'bg-white/75 border-slate-200/75 hover:bg-white/90'
                  }`}
                >
                  {/* Clickable Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleTaskOpen(dir.feedbackId)}
                    aria-expanded={isOpen}
                    className="w-full p-3.5 text-left flex items-start justify-between gap-3 cursor-pointer select-none group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          #{idx + 1}
                        </span>
                        <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {dir.type}
                        </span>
                        {isUniversalTask(dir) ? (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            All Sites
                          </span>
                        ) : dir.toSite ? (
                          <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200/50 px-2 py-0.5 rounded-md">
                            Site: {dir.toSite}
                          </span>
                        ) : null}
                        {acked ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Acknowledged
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                            Pending Acknowledgment
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                        {dir.title}
                      </h4>

                      {!isOpen && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {dir.message}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 group-hover:text-indigo-600 shrink-0 pt-0.5">
                      <span className="text-[11px] font-medium hidden sm:inline">
                        {isOpen ? 'Close' : 'Open'}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {/* Dropdown Body Content (Shown when task is open) */}
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100/90 space-y-3">
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                        {dir.message}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>From: {dir.fromPerson ? dir.fromPerson.split('@')[0] : 'Management'}</span>
                        {dir.source && <span className="font-mono text-[10px] text-slate-400">{dir.source}</span>}
                      </div>

                      {/* Officer Reply Display if already submitted */}
                      {dir.reply && (
                        <div className="text-xs bg-indigo-50/50 border border-indigo-100 rounded-xl p-2.5 text-slate-700 flex items-start gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-900">Your note: </span>
                            <span>{dir.reply}</span>
                          </div>
                        </div>
                      )}

                      {/* Reply Input Box */}
                      {isReplying && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a note to management..."
                            aria-label={`Reply to ${dir.title}`}
                            className="glass-input w-full text-xs px-3 py-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden"
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveReplyId(null);
                                setReplyText('');
                              }}
                              className="text-xs text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAcknowledge(dir.feedbackId)}
                              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Send note &amp; Acknowledge</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action Bar */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div>
                          {!isReplying && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveReplyId(dir.feedbackId);
                                setReplyText(dir.reply || '');
                              }}
                              className="text-[11px] text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>{dir.reply ? 'Edit note' : 'Add note'}</span>
                            </button>
                          )}
                        </div>

                        {acked ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/60">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Acknowledged</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(dir.feedbackId)}
                            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Acknowledge</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. EOD Report Quick Status */}
      <button
        onClick={onNavigateToReports}
        className="w-full glass-card hover:bg-white/80 p-4 rounded-2xl border border-white/60 flex items-center justify-between text-xs cursor-pointer transition"
      >
        <span className="text-slate-600 font-medium">EOD Report Status</span>
        <div className="flex items-center gap-1 text-slate-900 font-semibold">
          <span>
            {myShiftReport?.signedOff
              ? '✓ Signed off'
              : myShiftReport?.submittedAt
              ? 'Submitted'
              : 'Not started'}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </button>


      {/* 5. Lead/Admin Drafts Alert (Quiet, unobtrusive) */}
      {canPublish && draftDirections.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-amber-900">
              {draftDirections.length} Meeting Note Draft to review
            </span>
          </div>
          <button
            onClick={() => publishDirection(draftDirections[0].feedbackId)}
            className="text-xs font-bold text-amber-900 bg-amber-200/70 hover:bg-amber-200 px-3 py-1 rounded-xl cursor-pointer"
          >
            Publish
          </button>
        </div>
      )}
    </div>
  );
};
