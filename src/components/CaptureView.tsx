import React, { useState, useEffect, useRef } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { SHIFTS_LIST } from '../utils/idGenerator';
import {
  Upload,
  Star,
  X,
  CheckCircle2,
  Camera,
  ChevronDown,
  Sparkles
} from 'lucide-react';

interface StagedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  top: boolean;
  done: boolean;
}

const QUICK_TOPICS = [
  { label: 'Recognition', value: 'Employee Recognition' },
  { label: 'Huddle', value: 'Team Huddle & Brief' },
  { label: 'Games & Morale', value: 'Floor Engagement & Games' },
  { label: 'Culture & Event', value: 'Town Hall & Culture' }
];

export const CaptureView: React.FC<{ onNavigateToLibrary: () => void }> = ({ onNavigateToLibrary }) => {
  const { currentUser, sites, topics, addBatchUploads, getTopPickRoom } = useSignedInApp();

  // Smart defaults with rotating shift support!
  const [site] = useState<string>(currentUser.Site || sites[0].SiteName);
  const [shift, setShift] = useState<string>(currentUser.Shift || 'Peak');
  const [isCreativeSubmission, setIsCreativeSubmission] = useState<boolean>(currentUser.Role === 'Creative Designer');
  const [topic, setTopic] = useState<string>(QUICK_TOPICS[0].value);
  const [note, setNote] = useState<string>('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [eventName, setEventName] = useState<string>('');
  const [isEventMode, setIsEventMode] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const room = getTopPickRoom(site, shift, isEventMode ? 'Event' : 'Daily', eventName);
  const starredCount = stagedFiles.filter((f) => f.top && !f.done).length;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newItems: StagedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 35 * 1024 * 1024) {
        alert('File is larger than 35 MB.');
        continue;
      }
      newItems.push({
        id: Math.random().toString(36).substring(2, 9),
        name: f.name,
        size: f.size,
        type: f.type,
        url: URL.createObjectURL(f),
        top: false,
        done: false
      });
    }
    setStagedFiles((prev) => [...prev, ...newItems]);
    setUploadSuccess(false);
  };

  const toggleStar = (id: string) => {
    setStagedFiles((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          if (!f.top && starredCount >= room.left) {
            alert(`You reached your top-pick limit (${room.limit} max).`);
            return f;
          }
          return { ...f, top: !f.top };
        }
        return f;
      })
    );
  };

  const handleUpload = async () => {
    const pending = stagedFiles.filter((f) => !f.done);
    if (pending.length === 0) return;

    setIsUploading(true);
    try {
      const todayYmd = new Date().toISOString().slice(0, 10);
      await addBatchUploads(
        pending.map((f) => ({
          site,
          shift,
          mode: isEventMode ? 'Event' : 'Daily',
          eventName: isEventMode ? eventName : '',
          shiftDate: todayYmd,
          topic,
          spot: 'Production floor',
          mediaType: f.type.startsWith('video/') ? 'Video' : 'Photo',
          mediaUrl: f.url,
          fileSizeBytes: f.size,
          capturedAt: new Date().toISOString(),
          note: note || `${topic} capture`,
          consentSigned: true,
          nothingConfidential: true,
          topPick: f.top,
          isCreativeWork: isCreativeSubmission
        }))
      );

      setStagedFiles((prev) => prev.map((f) => ({ ...f, done: true })));
      setUploadSuccess(true);
    } finally {
      setIsUploading(false);
    }
  };

  const pendingCount = stagedFiles.filter((f) => !f.done).length;

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-xl mx-auto">
      {/* 1. Header with Rotating Shift Selector */}
      <div className="px-1 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Snap &amp; Upload
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-slate-500 font-medium">{site} · </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shift:</span>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              aria-label="Working shift for upload"
              className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 rounded-lg px-2 py-0.5 cursor-pointer hover:bg-indigo-100 transition-colors"
            >
              {SHIFTS_LIST.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Top Pick Allowance Pill */}
        <div className="text-right text-xs">
          <span className="font-bold text-indigo-600 tabular-nums">{room.left}</span>
          <span className="text-slate-400 text-[11px] block">stars left</span>
        </div>
      </div>

      {/* Creative Staff Mode Banner */}
      {currentUser.Role === 'Creative Designer' && (
        <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200/70 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Completed Creative Work</h4>
              <p className="text-[11px] text-slate-500">Submits finished designs/edits for Director review &amp; sign-off.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCreativeSubmission(!isCreativeSubmission)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              isCreativeSubmission ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {isCreativeSubmission ? 'Active' : 'Regular'}
          </button>
        </div>
      )}

      {/* 2. Photo Drop / Camera Hero Zone (Instant System 1 recognition) */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*,video/*"
        onChange={(e) => {
          handleFiles(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        className="hidden"
      />

      <div className="glass-card rounded-3xl p-6 border border-white/80 shadow-sm text-center space-y-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center hover:bg-indigo-100 hover:scale-105 active:scale-95 transition cursor-pointer"
        >
          <Camera className="w-8 h-8" />
        </button>

        <div>
          <h3 className="text-sm font-bold text-slate-900">
            {stagedFiles.length === 0 ? 'Choose or take photos' : `${stagedFiles.length} files chosen`}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select one or multiple photos from this shift
          </p>
        </div>

        <div className="flex items-center justify-center pt-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition cursor-pointer shadow-xs"
          >
            + Select Photos / Videos
          </button>
        </div>
      </div>

      {/* 3. Staged Photos Strip with 1-Tap Star */}
      {stagedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="font-medium">Tap star on your top pick:</span>
            <button
              onClick={() => setStagedFiles([])}
              className="text-slate-400 hover:text-rose-500 text-[11px] cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {stagedFiles.map((file) => (
              <div
                key={file.id}
                className="relative rounded-2xl overflow-hidden aspect-square bg-slate-900 shadow-xs"
              >
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />

                {/* 1-Tap Star Toggle */}
                <button
                  type="button"
                  onClick={() => toggleStar(file.id)}
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition cursor-pointer ${
                    file.top
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'bg-black/40 text-white/80'
                  }`}
                  title="Star Top Pick"
                >
                  <Star className={`w-3.5 h-3.5 ${file.top ? 'fill-slate-950' : ''}`} />
                </button>

                {file.done && (
                  <div className="absolute inset-x-0 bottom-0 bg-emerald-600 text-white text-[10px] font-bold text-center py-0.5">
                    Uploaded
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Quick Topic Chips (Instant selection, zero typing) */}
      <div className="glass-card rounded-3xl p-4 border border-white/70 shadow-xs space-y-2">
        <label className="text-[11px] font-semibold text-slate-500 block">
          Topic:
        </label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TOPICS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTopic(t.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                topic === t.value
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white/80 text-slate-600 hover:bg-white border border-slate-200/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Optional Note (kept super simple) */}
        <input
          type="text"
          placeholder="Add short note (optional)..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="glass-input w-full text-xs px-3 py-2 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden mt-2"
        />
      </div>

      {/* 5. Big Tactile Upload CTA (Natural thumb zone) */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={isUploading || pendingCount === 0}
        className={`w-full py-4 rounded-2xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
          isUploading || pendingCount === 0
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-indigo-600/20'
        }`}
      >
        <Upload className="w-4 h-4" />
        <span>
          {isUploading
            ? 'Saving...'
            : pendingCount > 0
            ? `Upload ${pendingCount} Photo${pendingCount > 1 ? 's' : ''}`
            : 'Select photos to upload'}
        </span>
      </button>

      {/* Success Notification */}
      {uploadSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Uploaded to {site} shift folder</span>
          </div>
          <button
            onClick={onNavigateToLibrary}
            className="text-emerald-800 font-bold underline cursor-pointer"
          >
            View →
          </button>
        </div>
      )}
    </div>
  );
};
