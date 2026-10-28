import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Code2,
  FileSpreadsheet,
  HardDrive,
  Layers,
  Key,
  LogOut,
  AlertCircle,
  Table
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { LiveDataInspectorModal } from './LiveDataInspectorModal';
import { TARGET_SPREADSHEET_ID } from '../services/googleSheetsService';
import { TARGET_DRIVE_ROOT_FOLDER_ID } from '../services/googleDriveService';
import { CLICKUP_ENGAGEMENT_SPACE_ID, CLICKUP_TEAM_ID } from '../services/clickupService';

export const ConnectionView: React.FC = () => {
  const {
    googleUser,
    isGoogleConnected,
    isSigningInGoogle,
    signInWithGoogle,
    signOutGoogle,
    isFetchingLiveSheets,
    isFetchingLiveDrive,
    liveSheetsMeta,
    liveDriveData,
    clickUpToken,
    setClickUpToken,
    isClickUpConnected,
    isFetchingClickUp,
    liveClickUpData,
    liveError,
    fetchLiveAllData,
    fetchLiveSheets,
    fetchLiveDrive,
    fetchLiveClickUp,
    testClickUpToken,
    syncHealth,
    syncLogs,
    uploads,
    directions,
    shiftReports,
    people,
    sites
  } = useApp();

  const [inputClickUpToken, setInputClickUpToken] = useState(clickUpToken);
  const [testingClickUp, setTestingClickUp] = useState(false);
  const [clickUpTestMsg, setClickUpTestMsg] = useState<{ success?: boolean; text?: string } | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const handleSaveAndTestClickUp = async () => {
    if (!inputClickUpToken.trim()) return;
    setTestingClickUp(true);
    setClickUpTestMsg(null);
    try {
      setClickUpToken(inputClickUpToken.trim());
      const res = await testClickUpToken(inputClickUpToken.trim());
      setClickUpTestMsg({ success: res.success, text: res.message });
      if (res.success) {
        await fetchLiveClickUp();
      }
    } finally {
      setTestingClickUp(false);
    }
  };

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-4xl mx-auto animate-in fade-in">
      {/* Live Data Inspector Modal */}
      <LiveDataInspectorModal
        isOpen={showInspector}
        onClose={() => setShowInspector(false)}
      />

      {/* Hero Banner: Live Connection Hub with Read-Only Safety Guarantee */}
      <div className="glass-card rounded-3xl p-5 border border-white/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Live Data Connectors
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Strictly Read-Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live read streaming from your Google Sheet, Google Drive, and ClickUp Engagement Space.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInspector(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/60 transition cursor-pointer"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Inspect Live Data</span>
            </button>

            <button
              onClick={() => fetchLiveAllData()}
              disabled={isFetchingLiveSheets || isFetchingLiveDrive || isFetchingClickUp}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isFetchingLiveSheets || isFetchingLiveDrive || isFetchingClickUp ? 'animate-spin' : ''
                }`}
              />
              <span>Fetch All Live</span>
            </button>
          </div>
        </div>

        {/* Read-Only Guarantee Box */}
        <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-start gap-2.5 text-xs text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            <strong>Read-Only Protection Enabled:</strong> Zero mutations, updates, or deletes are made to your Google Sheets, Google Drive, or ClickUp workspace. All data is fetched live via HTTP GET for real-time viewing and local workflow preview.
          </p>
        </div>

        {liveError && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px]">{liveError}</p>
          </div>
        )}
      </div>

      {/* 1. Google Sheets Live Connector */}
      <div className="glass-card rounded-3xl p-5 border border-white/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shadow-2xs">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Google Sheet Live Sync
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isGoogleConnected
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isGoogleConnected ? '● Live Connected' : 'Auth Required'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                ID: {TARGET_SPREADSHEET_ID}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl font-semibold text-slate-700 bg-white/80 hover:bg-white border border-slate-200/60 text-xs flex items-center gap-1 transition"
            >
              <span>Open Sheet</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            {isGoogleConnected && (
              <button
                onClick={() => fetchLiveSheets()}
                disabled={isFetchingLiveSheets}
                className="px-3 py-1.5 rounded-xl font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs flex items-center gap-1 transition cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingLiveSheets ? 'animate-spin' : ''}`} />
                <span>{isFetchingLiveSheets ? 'Fetching...' : 'Fetch Sheet'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Google Auth Status / Button */}
        <div className="p-4 rounded-2xl bg-white/70 border border-slate-100 space-y-3">
          {isGoogleConnected && googleUser ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {googleUser.photoURL ? (
                  <img
                    src={googleUser.photoURL}
                    alt={googleUser.displayName || 'Google User'}
                    className="w-8 h-8 rounded-full ring-2 ring-emerald-500/30"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                    {googleUser.email?.[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {googleUser.displayName || googleUser.email}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {googleUser.email} · Google Workspace Account
                  </div>
                </div>
              </div>

              <button
                onClick={signOutGoogle}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                Sign in with your Google Workspace account to fetch live rows from your sheet tabs (Uploads, Feedback, Reports, People, Sites):
              </p>
              <GoogleSignInButton
                onClick={signInWithGoogle}
                isLoading={isSigningInGoogle}
                text="Sign in with Google to Fetch Live Data"
              />
            </div>
          )}

          {/* Tab Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
            <div className="p-2.5 rounded-xl bg-slate-50 text-center">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Uploads</div>
              <div className="text-sm font-bold text-slate-800">{uploads.length}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 text-center">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Feedback</div>
              <div className="text-sm font-bold text-slate-800">{directions.length}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 text-center">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Reports</div>
              <div className="text-sm font-bold text-slate-800">{shiftReports.length}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 text-center">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Roster</div>
              <div className="text-sm font-bold text-slate-800">{people.length}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 text-center">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">Sites</div>
              <div className="text-sm font-bold text-slate-800">{sites.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Google Drive Live Connector */}
      <div className="glass-card rounded-3xl p-5 border border-white/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shadow-2xs">
              <HardDrive className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Google Drive Live Storage
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isGoogleConnected
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isGoogleConnected ? '● Live Connected' : 'Auth Required'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Root: <span className="font-semibold text-slate-700">E1CX Experience</span> ·{' '}
                <code className="font-mono text-[11px]">{TARGET_DRIVE_ROOT_FOLDER_ID}</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://drive.google.com/drive/folders/${TARGET_DRIVE_ROOT_FOLDER_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl font-semibold text-slate-700 bg-white/80 hover:bg-white border border-slate-200/60 text-xs flex items-center gap-1 transition"
            >
              <span>Drive Folder</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            {isGoogleConnected && (
              <button
                onClick={() => fetchLiveDrive()}
                disabled={isFetchingLiveDrive}
                className="px-3 py-1.5 rounded-xl font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs flex items-center gap-1 transition cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingLiveDrive ? 'animate-spin' : ''}`} />
                <span>{isFetchingLiveDrive ? 'Fetching...' : 'Fetch Files'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Drive Summary */}
        <div className="p-4 rounded-2xl bg-white/70 border border-slate-100 text-xs space-y-2">
          {liveDriveData ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-slate-700">
                Fetched <strong className="text-slate-900">{liveDriveData.items.length}</strong> items in root, including{' '}
                <strong className="text-slate-900">{liveDriveData.folders.length}</strong> site subfolders and{' '}
                <strong className="text-slate-900">{liveDriveData.recentMedia.length}</strong> recent media uploads.
              </div>
              <button
                onClick={() => setShowInspector(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>View Drive Files</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <p className="text-slate-500">
              {isGoogleConnected
                ? 'Click "Fetch Files" to list live folders and media from E1CX Experience.'
                : 'Sign in with Google above to explore live Drive folders and file attachments.'}
            </p>
          )}
        </div>
      </div>

      {/* 3. ClickUp Live Connector */}
      <div className="glass-card rounded-3xl p-5 border border-white/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm shadow-2xs">
              <Layers className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  ClickUp Space Sync
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isClickUpConnected
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isClickUpConnected ? '● Live Connected' : 'Token Required'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Engagement Space · <code className="font-mono text-[11px]">{CLICKUP_ENGAGEMENT_SPACE_ID}</code> · Team: {CLICKUP_TEAM_ID}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://app.clickup.com/${CLICKUP_TEAM_ID}/v/s/${CLICKUP_ENGAGEMENT_SPACE_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl font-semibold text-slate-700 bg-white/80 hover:bg-white border border-slate-200/60 text-xs flex items-center gap-1 transition"
            >
              <span>Space</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            {isClickUpConnected && (
              <button
                onClick={() => fetchLiveClickUp()}
                disabled={isFetchingClickUp}
                className="px-3 py-1.5 rounded-xl font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-xs flex items-center gap-1 transition cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingClickUp ? 'animate-spin' : ''}`} />
                <span>{isFetchingClickUp ? 'Fetching...' : 'Fetch Tasks'}</span>
              </button>
            )}
          </div>
        </div>

        {/* ClickUp Token Input */}
        <div className="p-4 rounded-2xl bg-white/70 border border-slate-100 space-y-3">
          <div className="text-xs text-slate-600">
            Enter your ClickUp Personal API Token (found in <em>ClickUp &gt; Settings &gt; Apps &gt; API Token</em>) to fetch live tasks from the Engagement space:
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="password"
                placeholder="pk_12345678_..."
                value={inputClickUpToken}
                onChange={(e) => setInputClickUpToken(e.target.value)}
                className="glass-input w-full pl-8 pr-3 py-2 rounded-xl text-xs text-slate-900 font-mono focus:outline-hidden"
              />
              <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <button
              onClick={handleSaveAndTestClickUp}
              disabled={testingClickUp || !inputClickUpToken.trim()}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition disabled:opacity-50"
            >
              {testingClickUp ? 'Connecting...' : 'Connect & Fetch Live'}
            </button>
          </div>

          {clickUpTestMsg && (
            <div
              className={`p-2.5 rounded-xl text-xs font-medium ${
                clickUpTestMsg.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {clickUpTestMsg.text}
            </div>
          )}

          {liveClickUpData && (
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
              <span>
                Live fetched: <strong className="text-slate-800">{liveClickUpData.tasks.length}</strong> tasks across{' '}
                <strong className="text-slate-800">{liveClickUpData.folders.length}</strong> folders.
              </span>
              <button
                onClick={() => setShowInspector(true)}
                className="text-purple-600 hover:text-purple-800 font-semibold cursor-pointer"
              >
                Inspect Tasks &rarr;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sync Ledger & History Audit Log */}
      <div className="glass-card rounded-3xl border border-white/80 shadow-xs overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full p-4 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-white/40 transition cursor-pointer"
        >
          <span>Sync Audit Ledger &amp; Live Activity Log ({syncLogs.length})</span>
          {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showLogs && (
          <div className="p-4 pt-0 space-y-2 border-t border-slate-100/60">
            {syncLogs.slice(0, 6).map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-white/60 text-xs flex items-start justify-between gap-2"
              >
                <div>
                  <span className="font-mono text-[10px] text-indigo-600 font-semibold block uppercase">
                    {log.stage}
                  </span>
                  <p className="text-slate-700 text-[11px]">{log.detail}</p>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  {new Date(log.time).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
