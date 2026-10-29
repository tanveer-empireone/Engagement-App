import React, { useEffect, useState } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { ASSIGNABLE_ROLES, isAdminEmail } from '../utils/access';
import { SHIFTS_LIST } from '../utils/idGenerator';
import { testAppsScriptConnection } from '../services/appsScriptService';
import { DirectionMessage, Person, ReviewStatus, Role, ShiftReport, UploadItem } from '../types';
import { ShieldCheck, X } from 'lucide-react';

type AdminSection = 'people' | 'records' | 'configuration' | 'sync';
type RecordTab = 'uploads' | 'directions' | 'reports';

const REVIEW_STATUSES: ReviewStatus[] = ['Pending', 'Accepted', 'Top pick', 'Reshoot'];

export const AdminPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const app = useSignedInApp();
  const [section, setSection] = useState<AdminSection>('people');
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeOk, setNoticeOk] = useState(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!app.isAdmin) return null;

  const show = (result: { ok: boolean; message: string }) => {
    setNoticeOk(result.ok);
    setNotice(result.message);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div
        data-testid="admin-panel"
        role="dialog"
        aria-labelledby="admin-panel-title"
        className="glass-card w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/80 shadow-xl flex flex-col"
      >
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/70">
          <div className="px-5 py-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Admin</div>
              <h2 id="admin-panel-title" className="text-lg font-bold text-slate-900">
                Engagement settings
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Signed in as {app.currentUser.Email}. Changes are saved to the server.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close admin panel"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/80 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                ['people', 'People'],
                ['records', 'Records'],
                ['configuration', 'Configuration'],
                ['sync', 'Sync']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-all ${
                  section === id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white/80 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="p-3 rounded-2xl bg-white/80 border border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-900">Capture media</div>
              <p className="text-[11px] text-slate-500">
                {app.showCaptureForAdmin
                  ? 'Visible on the admin view. Other roles always see it.'
                  : 'Hidden on the admin view. Other roles still see it.'}
              </p>
            </div>
            <button
              type="button"
              data-testid="toggle-admin-capture"
              onClick={() => show(app.setShowCaptureForAdmin(!app.showCaptureForAdmin))}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white cursor-pointer"
            >
              {app.showCaptureForAdmin ? 'Hide Capture' : 'Show Capture'}
            </button>
          </div>
          {notice && (
            <div
              className={`p-3 rounded-2xl border text-[11px] ${
                noticeOk ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {notice}
            </div>
          )}

          {section === 'people' && <PeopleSection show={show} />}
          {section === 'records' && <RecordsSection show={show} />}
          {section === 'configuration' && <ConfigSection show={show} />}
          {section === 'sync' && <SyncSection show={show} />}
        </div>
      </div>
    </div>
  );
};

const PeopleSection: React.FC<{ show: (result: { ok: boolean; message: string }) => void }> = ({ show }) => {
  const { people, sites, addDirectoryUser, updateDirectoryUser, removeDirectoryUser } = useSignedInApp();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('Officer');
  const [site, setSite] = useState(sites[0]?.SiteName || 'Cebu City');
  const [shift, setShift] = useState('Peak');

  return (
    <div className="space-y-4">
      <form
        className="p-4 rounded-2xl bg-white/70 border border-slate-200/70 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const result = addDirectoryUser({ email, name, role, site, shift });
          show(result);
          if (result.ok) {
            setEmail('');
            setName('');
            setRole('Officer');
          }
        }}
      >
        <div>
          <h3 className="text-sm font-bold text-slate-900">Add a user</h3>
          <p className="text-[11px] text-slate-500">
            Only emails added here can sign in. Choosing Admin gives them this panel and Integrations. tanveer@empireonecx.com stays an admin.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@empireonecx.com"
            aria-label="New user email"
            className="glass-input rounded-xl px-3 py-2 text-xs"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            aria-label="New user name"
            className="glass-input rounded-xl px-3 py-2 text-xs"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            aria-label="New user role"
            className="glass-input rounded-xl px-3 py-2 text-xs"
          >
            {ASSIGNABLE_ROLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={site}
            onChange={(event) => setSite(event.target.value)}
            aria-label="New user site"
            className="glass-input rounded-xl px-3 py-2 text-xs"
          >
            {sites.map((item) => (
              <option key={item.Code} value={item.SiteName}>
                {item.SiteName}
              </option>
            ))}
          </select>
          <select
            value={shift}
            onChange={(event) => setShift(event.target.value)}
            aria-label="New user shift"
            className="glass-input rounded-xl px-3 py-2 text-xs"
          >
            {SHIFTS_LIST.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
        >
          Add user
        </button>
      </form>

      <div className="space-y-2">
        {people.length === 0 && (
          <p className="text-xs text-slate-500">No roster rows yet. A Google sign-in adds the signed-in account.</p>
        )}
        {people.map((person) => (
          <PersonRow
            key={person.Email}
            person={person}
            sites={sites.map((item) => item.SiteName)}
            onUpdate={(patch) => show(updateDirectoryUser(person.Email, patch))}
            onRemove={() => show(removeDirectoryUser(person.Email))}
          />
        ))}
      </div>
    </div>
  );
};

const PersonRow: React.FC<{
  person: Person;
  sites: string[];
  onUpdate: (patch: Partial<Pick<Person, 'Name' | 'Role' | 'Site' | 'Shift' | 'Active'>>) => void;
  onRemove: () => void;
}> = ({ person, sites, onUpdate, onRemove }) => {
  const admin = isAdminEmail(person.Email);
  return (
    <div className="p-3 rounded-2xl bg-white/80 border border-slate-200/70 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-900 truncate">{person.Email}</div>
          <div className="text-[10px] text-slate-500">{person.Active ? 'Access on' : 'Access removed'}</div>
        </div>
        {admin ? (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            Admin
          </span>
        ) : person.Active ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] font-semibold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg cursor-pointer"
          >
            Remove access
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onUpdate({ Active: true })}
            className="text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-lg cursor-pointer"
          >
            Restore access
          </button>
        )}
      </div>
      <div className="grid sm:grid-cols-4 gap-2">
        <input
          defaultValue={person.Name}
          key={`${person.Email}-name-${person.Name}`}
          aria-label={`Name for ${person.Email}`}
          onBlur={(event) => {
            if (event.target.value.trim() && event.target.value !== person.Name) {
              onUpdate({ Name: event.target.value.trim() });
            }
          }}
          className="glass-input rounded-xl px-3 py-2 text-xs"
        />
        {admin ? (
          <div className="rounded-xl px-3 py-2 text-xs bg-slate-50 border border-slate-200 text-slate-500">Admin</div>
        ) : (
          <select
            value={ASSIGNABLE_ROLES.includes(person.Role) ? person.Role : 'Officer'}
            aria-label={`Role for ${person.Email}`}
            onChange={(event) => onUpdate({ Role: event.target.value as Role })}
            className="glass-input rounded-xl px-3 py-2 text-xs"
          >
            {ASSIGNABLE_ROLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}
        <select
          value={person.Site}
          aria-label={`Site for ${person.Email}`}
          onChange={(event) => onUpdate({ Site: event.target.value })}
          className="glass-input rounded-xl px-3 py-2 text-xs"
        >
          {!sites.includes(person.Site) && <option value={person.Site}>{person.Site}</option>}
          {sites.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={person.Shift || 'Peak'}
          aria-label={`Shift for ${person.Email}`}
          onChange={(event) => onUpdate({ Shift: event.target.value })}
          className="glass-input rounded-xl px-3 py-2 text-xs"
        >
          {SHIFTS_LIST.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const RecordsSection: React.FC<{ show: (result: { ok: boolean; message: string }) => void }> = ({ show }) => {
  const app = useSignedInApp();
  const [tab, setTab] = useState<RecordTab>('uploads');
  const [confirm, setConfirm] = useState<RecordTab | null>(null);

  const wipe = () => {
    if (confirm === 'uploads') show(app.deleteAllUploads());
    if (confirm === 'directions') show(app.deleteAllDirections());
    if (confirm === 'reports') show(app.deleteAllShiftReports());
    setConfirm(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['uploads', `Uploads (${app.uploads.length})`],
            ['directions', `Directions (${app.directions.length})`],
            ['reports', `Reports (${app.shiftReports.length})`]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              tab === id ? 'bg-slate-900 text-white' : 'bg-white/80 text-slate-600 border border-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setConfirm(tab)}
          className="ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 cursor-pointer"
        >
          Delete all in this tab
        </button>
      </div>

      {confirm && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex flex-wrap items-center gap-2">
          <span>Delete every {confirm} record stored on the server? Remote files and tasks stay where they are.</span>
          <button type="button" onClick={wipe} className="px-2 py-1 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer">
            Delete
          </button>
          <button type="button" onClick={() => setConfirm(null)} className="px-2 py-1 rounded-lg bg-white border border-rose-200 cursor-pointer">
            Cancel
          </button>
        </div>
      )}

      {tab === 'uploads' &&
        (app.uploads.length === 0 ? (
          <EmptyRecords label="No uploads on the server." />
        ) : (
          app.uploads.map((item) => <UploadEditor key={item.id} item={item} show={show} />)
        ))}
      {tab === 'directions' &&
        (app.directions.length === 0 ? (
          <EmptyRecords label="No directions on the server." />
        ) : (
          app.directions.map((item) => <DirectionEditor key={item.feedbackId} item={item} show={show} />)
        ))}
      {tab === 'reports' &&
        (app.shiftReports.length === 0 ? (
          <EmptyRecords label="No shift reports on the server." />
        ) : (
          app.shiftReports.map((item) => <ReportEditor key={item.reportId} item={item} show={show} />)
        ))}
    </div>
  );
};

const EmptyRecords: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-xs text-slate-500 p-4 rounded-2xl bg-white/60 border border-slate-200/70">{label}</p>
);

const UploadEditor: React.FC<{ item: UploadItem; show: (result: { ok: boolean; message: string }) => void }> = ({ item, show }) => {
  const { updateUpload, deleteUpload, sites, topics } = useSignedInApp();
  const [note, setNote] = useState(item.note);
  const [reviewNote, setReviewNote] = useState(item.reviewNote || '');

  return (
    <div className="p-3 rounded-2xl bg-white/80 border border-slate-200/70 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-900">{item.id}</div>
          <div className="text-[10px] text-slate-500">{item.officer} · {item.mediaType}</div>
        </div>
        <button
          type="button"
          onClick={() => show(deleteUpload(item.id))}
          className="text-[11px] font-semibold text-rose-600 cursor-pointer"
        >
          Delete
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <select
          value={item.site}
          aria-label={`Site for ${item.id}`}
          onChange={(event) => show(updateUpload(item.id, { site: event.target.value }))}
          className="glass-input rounded-xl px-3 py-2 text-xs"
        >
          {!sites.some((site) => site.SiteName === item.site) && <option value={item.site}>{item.site}</option>}
          {sites.map((site) => (
            <option key={site.Code} value={site.SiteName}>
              {site.SiteName}
            </option>
          ))}
        </select>
        <select
          value={item.topic}
          aria-label={`Topic for ${item.id}`}
          onChange={(event) => show(updateUpload(item.id, { topic: event.target.value }))}
          className="glass-input rounded-xl px-3 py-2 text-xs"
        >
          {!topics.some((topic) => topic.Topic === item.topic) && <option value={item.topic}>{item.topic}</option>}
          {topics.map((topic) => (
            <option key={topic.Code} value={topic.Topic}>
              {topic.Topic}
            </option>
          ))}
        </select>
        <select
          value={item.reviewStatus}
          aria-label={`Review status for ${item.id}`}
          onChange={(event) => show(updateUpload(item.id, { reviewStatus: event.target.value as ReviewStatus }))}
          className="glass-input rounded-xl px-3 py-2 text-xs"
        >
          {REVIEW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <input
        value={item.spot}
        aria-label={`Spot for ${item.id}`}
        onChange={(event) => show(updateUpload(item.id, { spot: event.target.value }))}
        className="glass-input rounded-xl px-3 py-2 text-xs w-full"
      />
      <label className="flex items-center gap-2 text-[11px] text-slate-600">
        <input
          type="checkbox"
          checked={item.topPick}
          onChange={(event) => show(updateUpload(item.id, { topPick: event.target.checked }))}
        />
        Top pick
      </label>
      <textarea
        value={note}
        aria-label={`Note for ${item.id}`}
        onChange={(event) => setNote(event.target.value)}
        className="glass-input rounded-xl px-3 py-2 text-xs w-full min-h-16"
      />
      <textarea
        value={reviewNote}
        aria-label={`Review note for ${item.id}`}
        onChange={(event) => setReviewNote(event.target.value)}
        placeholder="Review note"
        className="glass-input rounded-xl px-3 py-2 text-xs w-full min-h-16"
      />
      <button
        type="button"
        onClick={() => show(updateUpload(item.id, { note, reviewNote }))}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white cursor-pointer"
      >
        Save notes
      </button>
    </div>
  );
};

const DirectionEditor: React.FC<{
  item: DirectionMessage;
  show: (result: { ok: boolean; message: string }) => void;
}> = ({ item, show }) => {
  const { updateDirection, deleteDirection } = useSignedInApp();
  const [title, setTitle] = useState(item.title);
  const [message, setMessage] = useState(item.message);

  return (
    <div className="p-3 rounded-2xl bg-white/80 border border-slate-200/70 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-mono text-slate-500">{item.feedbackId}</div>
        <button
          type="button"
          onClick={() => show(deleteDirection(item.feedbackId))}
          className="text-[11px] font-semibold text-rose-600 cursor-pointer"
        >
          Delete
        </button>
      </div>
      <input
        value={title}
        aria-label={`Title for ${item.feedbackId}`}
        onChange={(event) => setTitle(event.target.value)}
        className="glass-input rounded-xl px-3 py-2 text-xs w-full"
      />
      <textarea
        value={message}
        aria-label={`Message for ${item.feedbackId}`}
        onChange={(event) => setMessage(event.target.value)}
        className="glass-input rounded-xl px-3 py-2 text-xs w-full min-h-16"
      />
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={item.status}
          aria-label={`Status for ${item.feedbackId}`}
          onChange={(event) =>
            show(updateDirection(item.feedbackId, { status: event.target.value as DirectionMessage['status'] }))
          }
          className="glass-input rounded-xl px-3 py-2 text-xs"
        >
          <option value="Published">Published</option>
          <option value="Draft">Draft</option>
        </select>
        <label className="flex items-center gap-2 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={item.acknowledged}
            onChange={(event) => show(updateDirection(item.feedbackId, { acknowledged: event.target.checked }))}
          />
          Acknowledged
        </label>
        <button
          type="button"
          onClick={() => show(updateDirection(item.feedbackId, { title, message }))}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white cursor-pointer"
        >
          Save text
        </button>
      </div>
    </div>
  );
};

const ReportEditor: React.FC<{
  item: ShiftReport;
  show: (result: { ok: boolean; message: string }) => void;
}> = ({ item, show }) => {
  const { updateShiftReport, deleteShiftReport } = useSignedInApp();
  const [done, setDone] = useState(item.engagementDone);
  const [notes, setNotes] = useState(item.notes || '');
  const [hours, setHours] = useState(String(item.hoursWorked));

  return (
    <div className="p-3 rounded-2xl bg-white/80 border border-slate-200/70 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-900">{item.reportId}</div>
          <div className="text-[10px] text-slate-500">
            {item.officerName} · {item.site} · {item.shiftDate}
          </div>
        </div>
        <button
          type="button"
          onClick={() => show(deleteShiftReport(item.reportId))}
          className="text-[11px] font-semibold text-rose-600 cursor-pointer"
        >
          Delete
        </button>
      </div>
      <textarea
        value={done}
        aria-label={`Engagement summary for ${item.reportId}`}
        onChange={(event) => setDone(event.target.value)}
        className="glass-input rounded-xl px-3 py-2 text-xs w-full min-h-16"
      />
      <textarea
        value={notes}
        aria-label={`Notes for ${item.reportId}`}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes"
        className="glass-input rounded-xl px-3 py-2 text-xs w-full min-h-16"
      />
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="number"
          min={0}
          value={hours}
          aria-label={`Hours for ${item.reportId}`}
          onChange={(event) => setHours(event.target.value)}
          className="glass-input rounded-xl px-3 py-2 text-xs w-24"
        />
        <label className="flex items-center gap-2 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={item.signedOff}
            onChange={(event) => show(updateShiftReport(item.reportId, { signedOff: event.target.checked }))}
          />
          Signed off
        </label>
        <label className="flex items-center gap-2 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={item.verified}
            onChange={(event) => show(updateShiftReport(item.reportId, { verified: event.target.checked }))}
          />
          Verified
        </label>
        <button
          type="button"
          onClick={() =>
            show(
              updateShiftReport(item.reportId, {
                engagementDone: done,
                notes,
                hoursWorked: Number(hours) || 0
              })
            )
          }
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white cursor-pointer"
        >
          Save report
        </button>
      </div>
    </div>
  );
};

const ConfigSection: React.FC<{ show: (result: { ok: boolean; message: string }) => void }> = ({ show }) => {
  const { appConfig, updateAppConfig, clickUpToken, setClickUpToken, testClickUpToken } = useSignedInApp();
  const [draft, setDraft] = useState(appConfig);
  const [token, setToken] = useState(clickUpToken);
  const [scriptNote, setScriptNote] = useState<string | null>(null);
  const [scriptBusy, setScriptBusy] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);

  useEffect(() => {
    setDraft(appConfig);
  }, [appConfig]);

  const field = (key: keyof typeof draft, label: string) => (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        value={draft[key]}
        onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
        className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-2xl bg-white/70 border border-slate-200/70 text-[11px] text-slate-600 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p>
          These ids are what the read connectors use. There is no Apps Script, Drive, or ClickUp write client wired up. Leaving the Apps Script URL empty means a write cannot be sent.
        </p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          show(updateAppConfig(draft));
        }}
      >
        {field('sheetId', 'Google Sheet id')}
        {field('driveRootId', 'Drive root folder id')}
        {field('clickUpTeamId', 'ClickUp team id')}
        {field('clickUpSpaceId', 'ClickUp space id')}
        {field('appsScriptUrl', 'Apps Script web app URL')}
        <button type="submit" className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 cursor-pointer">
          Save configuration
        </button>
      </form>

      <div className="p-4 rounded-2xl bg-white/70 border border-slate-200/70 space-y-2">
        <h3 className="text-sm font-bold text-slate-900">ClickUp personal token</h3>
        <p className="text-[11px] text-slate-500">
          Saved on the server and used for read requests. A blank token cannot connect, and this does not create tasks.
        </p>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="pk_..."
          aria-label="ClickUp API token"
          autoComplete="off"
          className="glass-input rounded-xl px-3 py-2 text-xs w-full"
        />
        <button
          type="button"
          disabled={tokenBusy}
          onClick={() => {
            setTokenBusy(true);
            setClickUpToken(token.trim());
            void testClickUpToken(token.trim()).then((result) => {
              show({ ok: result.success, message: result.message });
              setTokenBusy(false);
            });
          }}
          className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white cursor-pointer disabled:opacity-50"
        >
          {tokenBusy ? 'Testing…' : 'Save and test ClickUp token'}
        </button>
      </div>

      <div className="p-4 rounded-2xl bg-white/70 border border-slate-200/70 space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Apps Script ping</h3>
        <p className="text-[11px] text-slate-500">
          The only Apps Script call available is a read ping. It does not upload files or post reviews.
        </p>
        <button
          type="button"
          disabled={scriptBusy}
          onClick={() => {
            setScriptBusy(true);
            setScriptNote(null);
            void testAppsScriptConnection(appConfig.appsScriptUrl).then((result) => {
              setScriptNote(result.message);
              show({ ok: result.success, message: result.message });
              setScriptBusy(false);
            });
          }}
          className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 cursor-pointer disabled:opacity-50"
        >
          {scriptBusy ? 'Pinging…' : 'Test Apps Script URL'}
        </button>
        {scriptNote && <p className="text-[11px] text-slate-600">{scriptNote}</p>}
      </div>
    </div>
  );
};

const SyncSection: React.FC<{ show: (result: { ok: boolean; message: string }) => void }> = ({ show }) => {
  const {
    syncHealth,
    lastSyncReport,
    triggerManualSync,
    toggleSyncPause,
    googleToken,
    signInWithGoogle,
    isSigningInGoogle,
    isFetchingLiveSheets,
    isFetchingLiveDrive,
    isFetchingClickUp,
    syncLogs
  } = useSignedInApp();
  const [running, setRunning] = useState(false);
  const busy = running || isFetchingLiveSheets || isFetchingLiveDrive || isFetchingClickUp;

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/70 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Read sync</h3>
            <p className="text-[11px] text-slate-500">
              Last attempt: {syncHealth.lastSync ? new Date(syncHealth.lastSync).toLocaleString() : 'not run'} · {syncHealth.syncState}
              {syncHealth.paused ? ' · paused flag on' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSyncPause}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white cursor-pointer"
          >
            {syncHealth.paused ? 'Resume sync flag' : 'Pause sync flag'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          The pause flag is stored locally. Connectors are still read-only, so pause does not stop a remote job. Running sync only fetches.
        </p>
        {!googleToken && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-2">
            <p>Google sign-in is active, but the Sheets and Drive access token is missing. Refresh it before a Sheets or Drive read. This keeps the same Google account.</p>
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={isSigningInGoogle}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 text-white cursor-pointer disabled:opacity-50"
            >
              {isSigningInGoogle ? 'Waiting for Google…' : 'Refresh Google access'}
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setRunning(true);
            void triggerManualSync().then((report) => {
              const problems = report.filter((item) => item.state !== 'OK');
              show({
                ok: problems.length === 0,
                message: problems.length
                  ? `Sync did not fully succeed. ${problems.map((item) => `${item.name}: ${item.state}`).join(' ')}`
                  : 'Sync read Sheets, Drive, and ClickUp. No remote records were written.'
              });
              setRunning(false);
            });
          }}
          className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 cursor-pointer disabled:opacity-50"
        >
          {busy ? 'Reading…' : 'Run read sync'}
        </button>
        {syncHealth.paused && (
          <p className="text-[11px] text-amber-700">Pause is on. A manual read still runs if you press the button. It does not write anywhere.</p>
        )}
      </div>

      <div className="space-y-2">
        {(lastSyncReport || []).map((item) => (
          <div key={item.name} className="p-3 rounded-2xl bg-white/80 border border-slate-200/70">
            <div className="text-xs font-bold text-slate-900">
              {item.name} · {item.state}
            </div>
            <p className="text-[11px] text-slate-600 mt-1">{item.detail}</p>
          </div>
        ))}
        {!lastSyncReport && <p className="text-xs text-slate-500">No sync has been run in this visit.</p>}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recent log</h3>
        {syncLogs.slice(0, 6).map((log) => (
          <div key={log.id} className="text-[11px] text-slate-600 p-2 rounded-xl bg-white/60 border border-slate-100">
            <span className="font-semibold text-slate-800">{log.state}</span> · {log.detail}
          </div>
        ))}
        {syncLogs.length === 0 && <p className="text-xs text-slate-500">No log entries yet.</p>}
      </div>
    </div>
  );
};
