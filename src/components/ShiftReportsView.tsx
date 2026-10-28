import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ShiftReport } from '../types';
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Check
} from 'lucide-react';
import { SHIFTS_LIST, SPOTS_LIST } from '../utils/idGenerator';

export const ShiftReportsView: React.FC = () => {
  const { shiftReports, addShiftReport, signOffReport, currentUser, sites, canReview } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [site, setSite] = useState(currentUser.Site || sites[0].SiteName);
  const [shift, setShift] = useState(currentUser.Shift || 'Peak');
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [engagementDone, setEngagementDone] = useState('');
  const [photosCount, setPhotosCount] = useState(5);
  const [videosCount, setVideosCount] = useState(0);
  const [hoursWorked, setHoursWorked] = useState(8);
  const [spotChecks, setSpotChecks] = useState<string[]>([SPOTS_LIST[0], SPOTS_LIST[1]]);
  const [notes, setNotes] = useState('');

  const toggleSpotCheck = (spot: string) => {
    if (spotChecks.includes(spot)) {
      setSpotChecks(spotChecks.filter((s) => s !== spot));
    } else {
      setSpotChecks([...spotChecks, spot]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!engagementDone.trim()) {
      alert('Please summarize engagement completed during the shift.');
      return;
    }

    addShiftReport({
      officer: currentUser.Email,
      officerName: currentUser.Name,
      site,
      shift,
      shiftDate,
      submittedAt: new Date().toISOString(),
      engagementDone: engagementDone.trim(),
      photosCount: Number(photosCount),
      videosCount: Number(videosCount),
      hoursWorked: Number(hoursWorked),
      spotChecks,
      notes: notes.trim(),
      verified: true,
      signedOff: false
    });

    setIsModalOpen(false);
    setEngagementDone('');
    setNotes('');
  };

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="glass-card rounded-3xl p-4 sm:p-5 border border-white/70 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            Shift Reports
          </h2>
          <p className="text-xs text-slate-500">
            Shift summaries &amp; adherence verification
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-semibold px-4 py-2 rounded-2xl shadow-xs transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Report</span>
        </button>
      </div>

      {/* Reports Feed (Mobile-First Cards) */}
      {shiftReports.length === 0 ? (
        <div className="glass-card rounded-3xl p-10 text-center text-xs text-slate-400">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No shift reports filed yet</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Click &ldquo;New Report&rdquo; to submit your shift summary.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shiftReports.map((report) => (
          <article
            key={report.reportId}
            className="glass-card glass-card-hover rounded-3xl p-4 sm:p-5 border border-white/70 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5 font-medium text-slate-600">
                <span className="font-mono text-slate-900 font-bold">{report.reportId}</span>
                <span aria-hidden="true">·</span>
                <span>{report.site}</span>
                <span aria-hidden="true">·</span>
                <span>{report.shift}</span>
              </div>
              <span className="font-mono text-[11px]">{report.shiftDate}</span>
            </div>

            <div>
              <p className="text-xs text-slate-700 leading-relaxed font-sans">
                {report.engagementDone}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  {report.officerName} · {report.photosCount} photos
                </span>
                {report.isLate && (
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    Late &gt; 36h
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600">
                  {report.signedOff
                    ? '✓ Signed off'
                    : report.verified
                    ? 'Verified'
                    : report.submittedAt
                    ? 'Submitted'
                    : 'In progress'}
                </span>

                {canReview && !report.signedOff && (
                  <button
                    onClick={() => signOffReport(report.reportId)}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-xl transition cursor-pointer"
                  >
                    Sign Off
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      )}

      {/* New Report Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="glass-card rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5 shadow-2xl border border-white/80 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">Submit Shift Report</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Site</label>
                  <select
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    className="glass-input w-full p-2 rounded-xl text-slate-900"
                  >
                    {sites.map((s) => (
                      <option key={s.Code} value={s.SiteName}>
                        {s.SiteName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Shift</label>
                  <select
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                    className="glass-input w-full p-2 rounded-xl text-slate-900"
                  >
                    {SHIFTS_LIST.map((sh) => (
                      <option key={sh} value={sh}>
                        {sh} Shift
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">
                  Engagement Completed <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={engagementDone}
                  onChange={(e) => setEngagementDone(e.target.value)}
                  placeholder="Summary of recognitions, huddle games, and floor engagement..."
                  className="glass-input w-full p-2.5 rounded-xl text-slate-900 focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Photos</label>
                  <input
                    type="number"
                    min="0"
                    value={photosCount}
                    onChange={(e) => setPhotosCount(Number(e.target.value))}
                    className="glass-input w-full p-2 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Videos</label>
                  <input
                    type="number"
                    min="0"
                    value={videosCount}
                    onChange={(e) => setVideosCount(Number(e.target.value))}
                    className="glass-input w-full p-2 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Hours</label>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={hoursWorked}
                    onChange={(e) => setHoursWorked(Number(e.target.value))}
                    className="glass-input w-full p-2 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
