import React, { useState } from 'react';
import { useSignedInApp } from '../context/AppContext';
import {
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Send,
  Star,
  ChevronRight,
  ArrowRight
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
    getTopPickRoom
  } = useSignedInApp();

  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');

  const todayYmd = new Date().toISOString().slice(0, 10);
  const myTodayUploads = uploads.filter(
    (u) =>
      u.officer.toLowerCase() === currentUser.Email.toLowerCase() &&
      u.shiftDate === todayYmd
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

  const primaryDirection = activeDirections.find(
    (d) => d.status === 'Published' && !d.acknowledged && !d.acknowledgedBy?.includes(currentUser.Email)
  ) || activeDirections[0];

  const draftDirections = activeDirections.filter((d) => d.status === 'Draft');

  const handleGotIt = (feedbackId: string) => {
    acknowledgeDirection(feedbackId, replyText);
    setActiveReplyId(null);
    setReplyText('');
  };

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-xl mx-auto">
      {/* 1. Lazy Brain Greeting: Minimalist, human, single visual anchor */}
      <div className="flex items-center justify-between pt-1 px-1">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Hi, {currentUser.Name.split(' ')[0]}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {currentUser.Site} · {currentUser.Shift || 'Peak'} Shift
          </p>
        </div>

        {/* Quick Shift Status: 1 effortless glance */}
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

      {/* 2. Primary Focal Anchor: Giant tactile "Snap Shift Moments" Button */}
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

      {/* 3. Single Daily Direction Focus Card (One thing to do, no wall of text) */}
      {primaryDirection && (
        <div className="glass-card rounded-3xl p-5 border border-white/70 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-indigo-600 uppercase tracking-wider text-[10px]">
              Today&apos;s Focus
            </span>
            <span>{primaryDirection.type}</span>
          </div>

          <div>
            <h4 className="text-base font-bold text-slate-900">
              {primaryDirection.title}
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed mt-1">
              {primaryDirection.message}
            </p>
          </div>

          {/* Effortless 1-Tap "Got it" */}
          <div className="pt-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              From {primaryDirection.fromPerson.split('@')[0]}
            </span>

            {primaryDirection.acknowledged || primaryDirection.acknowledgedBy?.includes(currentUser.Email) ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
                <span>Read &amp; Acknowledged</span>
              </div>
            ) : (
              <button
                onClick={() => handleGotIt(primaryDirection.feedbackId)}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Got it</span>
              </button>
            )}
          </div>
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
