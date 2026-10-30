import React, { useState } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { UploadItem, ReviewStatus } from '../types';
import {
  CheckCircle2,
  Star,
  RefreshCw,
  AlertCircle,
  Clock,
  MapPin,
  Check,
  X,
  Sparkles
} from 'lucide-react';

export const ReviewQueueView: React.FC = () => {
  const { uploads, reviewUpload, approveFinalCreative, currentUser, canReview, canApproveCreative } = useSignedInApp();

  const [reshootModalItem, setReshootModalItem] = useState<UploadItem | null>(null);
  const [reshootNote, setReshootNote] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'pending' | 'all' | 'creative'>('pending');
  const [notification, setNotification] = useState<string | null>(null);

  const isSiteRestricted = currentUser.Role === 'Site Manager';
  const queueItems = uploads.filter((u) => {
    if (isSiteRestricted && u.site !== currentUser.Site) return false;
    if (filterMode === 'pending') {
      return u.reviewStatus === 'Pending';
    }
    if (filterMode === 'creative') {
      return Boolean(u.isCreativeWork);
    }
    return true;
  });

  const handleDecision = async (id: string, status: ReviewStatus, note?: string) => {
    await reviewUpload(id, status, note);
    setNotification(`Marked ${id} as ${status} (saved to server).`);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleFinalApproval = (id: string) => {
    approveFinalCreative(id);
    setNotification(`Granted Director Final Creative Approval for ${id} (saved to server).`);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleOpenReshootModal = (item: UploadItem) => {
    setReshootModalItem(item);
    setReshootNote('');
  };

  const submitReshoot = async () => {
    if (!reshootModalItem) return;
    if (!reshootNote.trim()) {
      alert('Please explain what needs to be fixed in the reshoot feedback note.');
      return;
    }
    await handleDecision(reshootModalItem.id, 'Reshoot', reshootNote.trim());
    setReshootModalItem(null);
  };

  if (!canReview) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center text-xs text-slate-500 max-w-lg mx-auto">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h3 className="font-bold text-slate-900 text-sm">Reviewer Access Required</h3>
        <p className="text-slate-400 mt-1">
          Review is available to Directors, Site Managers, Creative Designers, and Technical Admins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-white/70 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            Review Queue
          </h2>
          <p className="text-xs text-slate-500">
            {isSiteRestricted ? `${currentUser.Site} shift queue` : 'Site-wide curation & QA'}
          </p>
        </div>

        {/* Filter Toggle */}
        <div className="flex bg-slate-100/80 p-1 rounded-xl text-xs font-medium self-start sm:self-auto border border-slate-200/50">
          <button
            onClick={() => setFilterMode('pending')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              filterMode === 'pending'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Pending ({uploads.filter((u) => u.reviewStatus === 'Pending').length})
          </button>
          <button
            onClick={() => setFilterMode('creative')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
              filterMode === 'creative'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3 h-3 text-indigo-500" />
            <span>Creative ({uploads.filter((u) => u.isCreativeWork).length})</span>
          </button>
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
              filterMode === 'all'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All ({uploads.length})
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 text-xs font-medium rounded-2xl flex items-center justify-between">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="text-emerald-700 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Queue Cards */}
      {queueItems.length === 0 ? (
        <div className="glass-card rounded-3xl p-10 text-center text-xs text-slate-400">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">All caught up!</p>
          <p className="text-[11px] text-slate-400 mt-0.5">No uploads awaiting review right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queueItems.map((item) => (
            <article
              key={item.id}
              className="glass-card glass-card-hover rounded-3xl p-4 sm:p-5 border border-white/70 shadow-xs flex flex-col sm:flex-row gap-4"
            >
              {/* Media Preview */}
              <div className="w-full sm:w-44 h-36 rounded-2xl overflow-hidden bg-slate-900 shrink-0 relative">
                <img
                  src={item.mediaUrl}
                  alt={item.id}
                  className="w-full h-full object-cover"
                />
                {item.topPick && (
                  <div className="absolute top-2 right-2 bg-amber-400 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                    <Star className="w-3 h-3 fill-slate-950" />
                    Top Pick
                  </div>
                )}
              </div>

              {/* Details & Actions */}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="font-mono font-medium">{item.id}</span>
                    <span>{item.site} · {item.shift} Shift</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h4 className="text-sm font-bold text-slate-900">
                      {item.topic} <span className="font-normal text-slate-400">· {item.spot}</span>
                    </h4>
                    {item.isCreativeWork && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        Creative Work
                      </span>
                    )}
                    {item.usedInFinal && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                        Director Approved
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {item.note || 'No note recorded'}
                  </p>

                  <div className="mt-2 text-[11px] text-slate-400">
                    Officer: <span className="text-slate-600 font-medium">{item.officerName || item.officer}</span>
                  </div>
                </div>

                {/* Decision Actions Bar */}
                <div className="mt-4 pt-3 border-t border-slate-100/60 flex flex-wrap items-center justify-end gap-2">
                  {canApproveCreative && (
                    <button
                      type="button"
                      onClick={() => handleFinalApproval(item.id)}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer ${
                        item.usedInFinal
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                          : 'bg-white hover:bg-emerald-50 text-indigo-700 border border-indigo-200'
                      }`}
                      title="Director final approval for publishing"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{item.usedInFinal ? 'Final Approved ✓' : 'Director Sign-off'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDecision(item.id, 'Accepted')}
                    className="flex items-center gap-1 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Accept
                  </button>

                  <button
                    onClick={() => handleDecision(item.id, 'Top pick')}
                    className="flex items-center gap-1 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    <Star className="w-3.5 h-3.5 fill-indigo-600 text-indigo-600" />
                    Top Pick
                  </button>

                  <button
                    onClick={() => handleOpenReshootModal(item)}
                    className="flex items-center gap-1 bg-white hover:bg-slate-50 text-rose-700 border border-rose-200 text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reshoot
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Reshoot Feedback Modal */}
      {reshootModalItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="glass-card rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-2xl border border-white/80 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">Reshoot: {reshootModalItem.id}</h3>
              <button
                onClick={() => setReshootModalItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Provide feedback for officer <strong>{reshootModalItem.officerName || reshootModalItem.officer}</strong>. This feedback alerts the officer directly on their daily dashboard and saves to the server.
            </p>

            <textarea
              rows={3}
              value={reshootNote}
              onChange={(e) => setReshootNote(e.target.value)}
              placeholder="e.g. Screen privacy: monitors in background show customer queue data."
              className="glass-input w-full text-xs p-3 rounded-xl text-slate-900 focus:outline-hidden"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReshootModalItem(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submitReshoot}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition shadow-sm cursor-pointer"
              >
                Submit Reshoot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
