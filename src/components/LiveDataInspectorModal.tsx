import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  HardDrive,
  CheckCircle2,
  ExternalLink,
  Table,
  Eye,
  RefreshCw,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface LiveDataInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveDataInspectorModal: React.FC<LiveDataInspectorModalProps> = ({ isOpen, onClose }) => {
  const {
    googleUser,
    isGoogleConnected,
    isClickUpConnected,
    liveSheetsMeta,
    liveDriveData,
    liveClickUpData,
    uploads,
    directions,
    shiftReports,
    people,
    sites,
    fetchLiveAllData,
    isFetchingLiveSheets
  } = useApp();

  const [activeTab, setActiveTab] = useState<'sheets' | 'drive' | 'clickup'>('sheets');
  const [selectedSheetTab, setSelectedSheetTab] = useState<'uploads' | 'feedback' | 'reports' | 'people' | 'sites'>('uploads');

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
      <div className="glass-card bg-white/95 border border-white/80 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Table className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Live Data Inspector
                </h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <ShieldCheck className="w-3 h-3" />
                  Read-Only Mode
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Live inspect raw data fetched from Google Sheet, Drive &amp; ClickUp without any write mutations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLiveAllData()}
              disabled={isFetchingLiveSheets}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
              title="Refresh live data"
            >
              <RefreshCw className={`w-4 h-4 ${isFetchingLiveSheets ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close inspector modal"
              data-testid="close-inspector"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Primary Tabs: Sheets vs Drive vs ClickUp */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('sheets')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
              activeTab === 'sheets'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Google Sheet (1Ts2VF...)</span>
            {liveSheetsMeta?.availableTabs && (
              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-600">
                {liveSheetsMeta.availableTabs.length} tabs
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('drive')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
              activeTab === 'drive'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HardDrive className="w-4 h-4 text-blue-600" />
            <span>Google Drive (1U-cZod...)</span>
            {liveDriveData && (
              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-600">
                {liveDriveData.items.length} items
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('clickup')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition border-b-2 cursor-pointer ${
              activeTab === 'clickup'
                ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4 text-purple-600" />
            <span>ClickUp Space (130038...)</span>
            {liveClickUpData && (
              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-600">
                {liveClickUpData.tasks.length} tasks
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {activeTab === 'sheets' && (
            <div className="space-y-4">
              {/* Sheet Sub-Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/70 rounded-2xl max-w-fit">
                {(['uploads', 'feedback', 'reports', 'people', 'sites'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSelectedSheetTab(tab)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
                      selectedSheetTab === tab
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab}
                    <span className="ml-1.5 text-[10px] opacity-70">
                      {tab === 'uploads' && `(${uploads.length})`}
                      {tab === 'feedback' && `(${directions.length})`}
                      {tab === 'reports' && `(${shiftReports.length})`}
                      {tab === 'people' && `(${people.length})`}
                      {tab === 'sites' && `(${sites.length})`}
                    </span>
                  </button>
                ))}
              </div>

              {/* Table Data View */}
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto max-h-[50vh]">
                  {selectedSheetTab === 'uploads' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/90 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="py-2.5 px-3">Upload ID</th>
                          <th className="py-2.5 px-3">File Name</th>
                          <th className="py-2.5 px-3">Officer</th>
                          <th className="py-2.5 px-3">Site / Shift</th>
                          <th className="py-2.5 px-3">Topic / Spot</th>
                          <th className="py-2.5 px-3">Review</th>
                          <th className="py-2.5 px-3">Top Pick</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {uploads.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50/60 transition">
                            <td className="py-2 px-3 font-bold text-indigo-700">{u.id}</td>
                            <td className="py-2 px-3 text-slate-800">{u.fileName}</td>
                            <td className="py-2 px-3 text-slate-600">{u.officer}</td>
                            <td className="py-2 px-3 text-slate-600">{u.site} ({u.shift})</td>
                            <td className="py-2 px-3 text-slate-600">{u.topic} · {u.spot}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                u.reviewStatus === 'Accepted' ? 'bg-emerald-50 text-emerald-700' :
                                u.reviewStatus === 'Top pick' ? 'bg-amber-50 text-amber-700 font-bold' :
                                u.reviewStatus === 'Reshoot' ? 'bg-rose-50 text-rose-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {u.reviewStatus}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              {u.topPick ? (
                                <span className="text-amber-500 font-bold">★ Yes</span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {selectedSheetTab === 'feedback' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/90 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="py-2.5 px-3">Feedback ID</th>
                          <th className="py-2.5 px-3">Target Site</th>
                          <th className="py-2.5 px-3">Title</th>
                          <th className="py-2.5 px-3">Direction Message</th>
                          <th className="py-2.5 px-3">Author</th>
                          <th className="py-2.5 px-3">Acknowledged</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {directions.map((d) => (
                          <tr key={d.feedbackId} className="hover:bg-slate-50/60 transition">
                            <td className="py-2 px-3 font-bold text-indigo-700">{d.feedbackId}</td>
                            <td className="py-2 px-3 text-slate-700">{d.toSite || 'All Sites'}</td>
                            <td className="py-2 px-3 text-slate-600 font-sans font-semibold">{d.title}</td>
                            <td className="py-2 px-3 text-slate-800 font-sans max-w-xs">{d.message}</td>
                            <td className="py-2 px-3 text-slate-600 font-sans">{d.fromPerson}</td>
                            <td className="py-2 px-3">
                              {d.acknowledged ? (
                                <span className="text-emerald-600 font-bold">✓ Yes</span>
                              ) : (
                                <span className="text-amber-600 font-medium">Pending</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {selectedSheetTab === 'reports' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/90 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="py-2.5 px-3">Report ID</th>
                          <th className="py-2.5 px-3">Site / Date</th>
                          <th className="py-2.5 px-3">Officer</th>
                          <th className="py-2.5 px-3">Photos / Hours</th>
                          <th className="py-2.5 px-3">Verified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {shiftReports.map((r) => (
                          <tr key={r.reportId} className="hover:bg-slate-50/60 transition">
                            <td className="py-2 px-3 font-bold text-indigo-700">{r.reportId}</td>
                            <td className="py-2 px-3 text-slate-700">{r.site} ({r.shiftDate})</td>
                            <td className="py-2 px-3 text-slate-600">{r.officerName || r.officer}</td>
                            <td className="py-2 px-3 text-slate-700">{r.photosCount} photos / {r.hoursWorked}h</td>
                            <td className="py-2 px-3">
                              {r.verified ? (
                                <span className="text-emerald-600 font-bold">✓ Verified</span>
                              ) : (
                                <span className="text-slate-400">Unverified</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {selectedSheetTab === 'people' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/90 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="py-2.5 px-3">Email</th>
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3">Role</th>
                          <th className="py-2.5 px-3">Site</th>
                          <th className="py-2.5 px-3">Shift</th>
                          <th className="py-2.5 px-3">Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {people.map((p) => (
                          <tr key={p.Email} className="hover:bg-slate-50/60 transition">
                            <td className="py-2 px-3 font-mono text-indigo-700">{p.Email}</td>
                            <td className="py-2 px-3 font-bold text-slate-800">{p.Name}</td>
                            <td className="py-2 px-3 text-slate-600">{p.Role}</td>
                            <td className="py-2 px-3 text-slate-600">{p.Site}</td>
                            <td className="py-2 px-3 text-slate-600">{p.Shift || 'Peak'}</td>
                            <td className="py-2 px-3">
                              {p.Active ? (
                                <span className="text-emerald-600 font-bold">✓ Active</span>
                              ) : (
                                <span className="text-slate-400 font-medium">Inactive</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {selectedSheetTab === 'sites' && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50/90 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="py-2.5 px-3">Site Name</th>
                          <th className="py-2.5 px-3">Code</th>
                          <th className="py-2.5 px-3">Folder Name</th>
                          <th className="py-2.5 px-3">Timezone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {sites.map((s) => (
                          <tr key={s.Code} className="hover:bg-slate-50/60 transition">
                            <td className="py-2 px-3 font-bold text-slate-800">{s.SiteName}</td>
                            <td className="py-2 px-3 font-mono text-indigo-700">{s.Code}</td>
                            <td className="py-2 px-3 text-slate-600">{s.FolderName}</td>
                            <td className="py-2 px-3 font-mono text-slate-500">{s.Timezone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'drive' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 text-xs text-blue-900 flex items-center justify-between">
                <div>
                  <span className="font-bold">Root Folder:</span>{' '}
                  <code>1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN</code> (E1CX Experience)
                </div>
                <a
                  href="https://drive.google.com/drive/folders/1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                >
                  <span>Open in Drive</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {liveDriveData && liveDriveData.items.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {liveDriveData.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl border border-slate-200/80 bg-white shadow-2xs hover:border-indigo-300 transition flex items-start gap-3"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        {item.thumbnailLink ? (
                          <img src={item.thumbnailLink} alt={item.name} className="w-10 h-10 rounded-xl object-cover" />
                        ) : (
                          <HardDrive className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          ID: {item.id}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                          <span>{item.isFolder ? 'Folder' : `${((item.size || 0) / 1024 / 1024).toFixed(1)} MB`}</span>
                          {item.webViewLink && (
                            <a
                              href={item.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:underline flex items-center gap-0.5"
                            >
                              <span>View</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">
                  {isGoogleConnected
                    ? 'No files found in root folder or folder is empty.'
                    : 'Sign in with Google to fetch live drive files.'}
                </div>
              )}
            </div>
          )}

          {activeTab === 'clickup' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-purple-50/50 border border-purple-100 text-xs text-purple-900 flex items-center justify-between">
                <div>
                  <span className="font-bold">Engagement Space:</span>{' '}
                  <code>1300380000003391</code> · Team: <code>90161592694</code>
                </div>
                <a
                  href="https://app.clickup.com/90161592694/v/s/1300380000003391"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-semibold text-purple-700 hover:underline"
                >
                  <span>Open Space</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {liveClickUpData && liveClickUpData.tasks.length > 0 ? (
                <div className="space-y-2">
                  {liveClickUpData.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-purple-700 font-bold">
                            #{task.id}
                          </span>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase"
                            style={{
                              backgroundColor: `${task.status.color}20`,
                              color: task.status.color
                            }}
                          >
                            {task.status.status}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 mt-1 truncate">
                          {task.name}
                        </h4>
                        {task.list && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            List: {task.list.name}
                          </p>
                        )}
                      </div>

                      {task.url && (
                        <a
                          href={task.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shrink-0 flex items-center gap-1"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">
                  {isClickUpConnected
                    ? 'No tasks found in Engagement Space.'
                    : 'Connect ClickUp with your Personal API Token to fetch live tasks.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
