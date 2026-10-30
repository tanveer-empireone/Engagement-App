import React, { useState } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { SHIFTS_LIST } from '../utils/idGenerator';
import { DirectionMessage } from '../types';
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

  // Focus on current published directions
  const activeDirections = directions.filter((d) => {
    if (canPublish) return true;
    const isTargeted =
      d.toAll ||
      d.toSite === currentUser.Site ||
      d.toPerson?.toLowerCase() === currentUser.Email.toLowerCase();
    return d.status === 'Published' && isTargeted;
  });

  const publishedDirections = activeDirections.filter((d) => d.status === 'Published');
  const draftDirections = activeDirections.filter((d) => d.status === 'Draft');

  const isAcknowledged = (d: DirectionMessage) =>
    Boolean(d.acknowledged || d.acknowledgedBy?.includes(currentUser.Email));

  const unacknowledgedDirections = publishedDirections.filter((d) => !isAcknowledged(d));
  const unacknowledgedCount = unacknowledgedDirections.length;

  const handleGotIt = (feedbackId: string, customReply?: string) => {
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

  const displayedDirections = selectedFocusId === 'all'
    ? publishedDirections
    : publishedDirections.filter((d) => d.feedbackId === selectedFocusId);

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
                <img
                  src={item.mediaUrl}
                  alt={item.id}
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-900 truncate">{item.topic}</span>
                    <span className="text-[10px] text-slate-400">{item.spot}</span>
                  </div>
                  <p className="text-[11px] text-amber-900 font-medium mt-0.5 bg-amber-50/80 p-1.5 rounded-lg border border-amber-100">
                    "{item.reviewNote || 'Please capture a clearer photo with better lighting or participants in frame.'}"
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

      {/* 3. Today's Focus Card with Dropdown & View All Support */}
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
            No specific daily focus broadcasts have been posted for your site yet. Continue with standard site engagement routines and daily spot checks.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-3xl p-4 sm:p-5 border border-white/70 shadow-sm space-y-3.5 overflow-hidden">
          {/* Header with Title, Counts, and Dropdown Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2.5 border-b border-slate-100">
            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 min-w-0">
              <span className="font-semibold text-indigo-600 uppercase tracking-wider text-[10px] flex items-center gap-1.5 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Today&apos;s Focus
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 shrink-0">
                {publishedDirections.length} message{publishedDirections.length > 1 ? 's' : ''}
              </span>
              {unacknowledgedCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 shrink-0">
                  {unacknowledgedCount} unread
                </span>
              )}
            </div>

            {/* Dropdown to switch or view all at once, safely framed without overflow */}
            <div className="flex items-center gap-2 w-full sm:w-auto min-w-0 justify-between sm:justify-end">
              <div className="relative min-w-0 flex-1 sm:w-48 md:w-56">
                <label htmlFor="focus-message-dropdown" className="sr-only">
                  Select focus message
                </label>
                <select
                  id="focus-message-dropdown"
                  value={selectedFocusId}
                  onChange={(e) => {
                    setSelectedFocusId(e.target.value);
                    setIsFocusExpanded(true);
                  }}
                  className="w-full text-xs font-semibold text-slate-800 bg-white/95 hover:bg-white border border-slate-200/90 rounded-xl pl-2.5 pr-7 py-1.5 cursor-pointer transition shadow-2xs appearance-none focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 truncate"
                  title="Choose a specific message or show all at once"
                >
                  <option value="all">
                    Show all ({publishedDirections.length}) at once
                  </option>
                  {publishedDirections.map((d, index) => {
                    const acked = isAcknowledged(d);
                    const truncated = d.title.length > 22 ? d.title.slice(0, 22) + '…' : d.title;
                    return (
                      <option key={d.feedbackId} value={d.feedbackId}>
                        {index + 1}. {truncated} {!acked ? '• (New)' : ''}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* View all toggle button */}
              <button
                type="button"
                onClick={() => {
                  if (selectedFocusId !== 'all') {
                    setSelectedFocusId('all');
                    setIsFocusExpanded(true);
                  } else {
                    setIsFocusExpanded(!isFocusExpanded);
                  }
                }}
                className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-indigo-200/70 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-700 cursor-pointer transition flex items-center gap-1 whitespace-nowrap"
                title={selectedFocusId === 'all' && isFocusExpanded ? 'Collapse list' : 'View all messages together'}
              >
                {selectedFocusId === 'all' && isFocusExpanded ? (
                  <>
                    <span>Collapse</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>View all</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Messages Container */}
          {!isFocusExpanded && selectedFocusId === 'all' ? (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span className="font-medium text-slate-700">
                  {publishedDirections.length} focus messages available for today.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsFocusExpanded(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                Expand all ▾
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedDirections.map((dir, idx) => {
                const acked = isAcknowledged(dir);
                const isReplying = activeReplyId === dir.feedbackId;

                return (
                  <div
                    key={dir.feedbackId}
                    className={`p-4 rounded-2xl transition border ${
                      !acked
                        ? 'bg-white/95 border-indigo-200/80 shadow-xs'
                        : 'bg-white/70 border-slate-200/70'
                    }`}
                  >
                    {/* Item header badges */}
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {publishedDirections.length > 1 && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                            #{idx + 1}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {dir.type}
                        </span>
                        {dir.toAll ? (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            All Sites
                          </span>
                        ) : dir.toSite ? (
                          <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            Site: {dir.toSite}
                          </span>
                        ) : null}
                      </div>

                      <span className="text-[10px] text-slate-400">
                        From {dir.fromPerson ? dir.fromPerson.split('@')[0] : 'Management'}
                      </span>
                    </div>

                    {/* Title & Body */}
                    <h4 className="text-sm md:text-base font-bold text-slate-900 leading-snug">
                      {dir.title}
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1 whitespace-pre-line">
                      {dir.message}
                    </p>

                    {/* Officer Reply Display if already submitted */}
                    {dir.reply && (
                      <div className="mt-2 text-xs bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-slate-700 flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-slate-900">Your note: </span>
                          <span>{dir.reply}</span>
                        </div>
                      </div>
                    )}

                    {/* Reply Input Box */}
                    {isReplying && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
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
                            onClick={() => handleGotIt(dir.feedbackId)}
                            className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Send note &amp; acknowledge</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="pt-2.5 mt-2 border-t border-slate-100/80 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {!isReplying && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveReplyId(dir.feedbackId);
                              setReplyText('');
                            }}
                            className="text-[11px] text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>{dir.reply ? 'Update note' : 'Add note'}</span>
                          </button>
                        )}
                      </div>

                      {acked ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/50">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Read &amp; Acknowledged</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleGotIt(dir.feedbackId)}
                          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Got it</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Quick helper when viewing single item */}
              {selectedFocusId !== 'all' && publishedDirections.length > 1 && (
                <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Viewing 1 of {publishedDirections.length} focus messages</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFocusId('all');
                      setIsFocusExpanded(true);
                    }}
                    className="font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    View all {publishedDirections.length} at once →
                  </button>
                </div>
              )}

              {/* Bulk acknowledge option if multiple unacknowledged messages */}
              {selectedFocusId === 'all' && unacknowledgedCount > 1 && (
                <div className="pt-2 flex items-center justify-between px-1">
                  <span className="text-[11px] text-slate-400">
                    {unacknowledgedCount} unacknowledged messages remaining
                  </span>
                  <button
                    type="button"
                    onClick={handleAcknowledgeAll}
                    className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 px-3 py-1.5 rounded-xl cursor-pointer transition flex items-center gap-1.5 shadow-2xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Got it for all ({unacknowledgedCount})</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Shift Report Quick Status (Simple 1-line check) */}
      <button
        onClick={onNavigateToReports}
        className="w-full glass-card hover:bg-white/80 p-4 rounded-2xl border border-white/60 flex items-center justify-between text-xs cursor-pointer transition"
      >
        <span className="text-slate-600 font-medium">Shift Report Status</span>
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
