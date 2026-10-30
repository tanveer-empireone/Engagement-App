import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { UploadItem } from '../types';
import {
  Search,
  Star,
  MapPin,
  ExternalLink,
  X,
  Camera,
  Filter,
  RotateCcw,
  Sparkles,
  Video,
  CheckCircle2,
  User
} from 'lucide-react';

export const LibraryView: React.FC = () => {
  const { uploads, sites } = useApp();
  const [tab, setTab] = useState<'all' | 'top' | 'creative'>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedOfficer, setSelectedOfficer] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<UploadItem | null>(null);

  // Extract unique filter options from data
  const availableSites = useMemo(() => {
    const fromUploads = uploads.map((u) => u.site).filter(Boolean);
    const fromSites = sites.map((s) => s.SiteName);
    return Array.from(new Set([...fromSites, ...fromUploads])).sort();
  }, [uploads, sites]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const u of uploads) {
      if (u.topic) set.add(u.topic);
    }
    return Array.from(set).sort();
  }, [uploads]);

  const availableOfficers = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of uploads) {
      if (u.officer) {
        map.set(u.officer.toLowerCase(), u.officerName || u.officer);
      }
    }
    return Array.from(map.entries()).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [uploads]);

  const hasActiveFilters =
    selectedSite !== 'all' ||
    selectedTopic !== 'all' ||
    selectedOfficer !== 'all' ||
    search.trim() !== '' ||
    tab !== 'all';

  const resetFilters = () => {
    setSelectedSite('all');
    setSelectedTopic('all');
    setSelectedOfficer('all');
    setSearch('');
    setTab('all');
  };

  const filtered = uploads.filter((u) => {
    if (tab === 'top' && !u.topPick) return false;
    if (tab === 'creative' && !u.isCreativeWork) return false;

    if (selectedSite !== 'all' && u.site !== selectedSite) return false;
    if (selectedTopic !== 'all' && u.topic !== selectedTopic) return false;
    if (selectedOfficer !== 'all' && u.officer.toLowerCase() !== selectedOfficer.toLowerCase()) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.id.toLowerCase().includes(q) ||
        u.topic.toLowerCase().includes(q) ||
        u.site.toLowerCase().includes(q) ||
        (u.officerName && u.officerName.toLowerCase().includes(q)) ||
        u.officer.toLowerCase().includes(q) ||
        u.note.toLowerCase().includes(q) ||
        (u.place && u.place.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-4xl mx-auto">
      {/* 1. Header with Tab Switcher & Active Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Media Library
          </h2>
          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {uploads.length} submission{uploads.length === 1 ? '' : 's'}
          </p>
        </div>

        {/* 3-Option View Switcher */}
        <div className="flex bg-slate-100/90 p-1 rounded-2xl text-xs font-medium self-start sm:self-auto border border-slate-200/50">
          <button
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
              tab === 'all'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All ({uploads.length})
          </button>
          <button
            onClick={() => setTab('top')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 ${
              tab === 'top'
                ? 'bg-white text-amber-600 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>Top Picks ({uploads.filter((u) => u.topPick).length})</span>
          </button>
          <button
            onClick={() => setTab('creative')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 ${
              tab === 'creative'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Creative ({uploads.filter((u) => u.isCreativeWork).length})</span>
          </button>
        </div>
      </div>

      {/* 2. Combined Content Filtering Bar (Location, Category, Submitting Officer, Search) */}
      <div className="glass-card rounded-2xl p-3.5 border border-white/80 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>Combined Filters</span>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {/* Quick Keyword Search */}
          <div className="relative sm:col-span-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden"
            />
          </div>

          {/* Location / Site Filter */}
          <div>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              aria-label="Filter submissions by location"
              className="glass-input w-full px-2.5 py-1.5 text-xs rounded-xl text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">📍 All Locations</option>
              {availableSites.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Category / Topic Filter */}
          <div>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              aria-label="Filter submissions by category"
              className="glass-input w-full px-2.5 py-1.5 text-xs rounded-xl text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">🏷️ All Categories</option>
              {availableTopics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Submitting Officer Filter */}
          <div>
            <select
              value={selectedOfficer}
              onChange={(e) => setSelectedOfficer(e.target.value)}
              aria-label="Filter by submitting officer"
              className="glass-input w-full px-2.5 py-1.5 text-xs rounded-xl text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">👤 All Submitting Officers</option>
              {availableOfficers.map((o) => (
                <option key={o.email} value={o.email}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Media Grid */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center text-xs text-slate-400 border border-white/80">
          <Camera className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-bold text-slate-700 text-sm">No submissions match the selected filters</p>
          <p className="text-slate-400 mt-1">Try resetting or broadening your filters.</p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="mt-3 px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs cursor-pointer shadow-xs hover:bg-indigo-700 transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="glass-card hover:bg-white/95 active:scale-[0.98] rounded-2xl overflow-hidden border border-white/80 shadow-xs cursor-pointer transition flex flex-col justify-between group"
            >
              <div>
                <div className="relative aspect-square bg-slate-950 overflow-hidden">
                  <img
                    src={item.mediaUrl}
                    alt={item.id}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />

                  {/* Top pick badge */}
                  {item.topPick && (
                    <div className="absolute top-2 right-2 bg-amber-400 text-slate-950 text-[10px] font-bold p-1 rounded-full shadow-xs">
                      <Star className="w-3 h-3 fill-slate-950" />
                    </div>
                  )}

                  {/* Creative Work badge */}
                  {item.isCreativeWork && (
                    <div className="absolute top-2 left-2 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Creative</span>
                    </div>
                  )}

                  {/* Video indicator */}
                  {item.mediaType === 'Video' && (
                    <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] flex items-center gap-1 font-medium">
                      <Video className="w-3 h-3 text-rose-400" />
                    </div>
                  )}

                  {/* Review Status badge */}
                  <div className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white ${
                    item.reviewStatus === 'Accepted'
                      ? 'bg-emerald-600/90'
                      : item.reviewStatus === 'Reshoot'
                      ? 'bg-rose-600/90'
                      : item.reviewStatus === 'Top pick'
                      ? 'bg-amber-600/90'
                      : 'bg-black/60'
                  }`}>
                    {item.reviewStatus}
                  </div>
                </div>

                <div className="p-2.5">
                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {item.topic}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {item.site} · {item.officerName || item.officer.split('@')[0]}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 4. Inspection Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <div className="glass-card rounded-3xl max-w-md w-full p-5 shadow-2xl border border-white/80 space-y-3.5 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-start justify-between pb-1">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-base">{selectedItem.topic}</h3>
                  {selectedItem.isCreativeWork && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Creative Work
                    </span>
                  )}
                  {selectedItem.usedInFinal && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Approved Final
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedItem.site} · {selectedItem.shift} Shift · {selectedItem.shiftDate}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                aria-label="Close detail modal"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden aspect-video bg-black flex items-center justify-center border border-slate-200/70">
              <img
                src={selectedItem.mediaUrl}
                alt={selectedItem.id}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="p-3 rounded-2xl bg-white/70 border border-slate-200/70 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-400">Submitting Officer:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <User className="w-3 h-3 text-indigo-600" />
                  {selectedItem.officerName || selectedItem.officer}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-400">Review Status:</span>
                <span className="font-semibold text-slate-800">{selectedItem.reviewStatus}</span>
              </div>
              {selectedItem.reviewNote && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-slate-400 text-[11px] block">Reviewer Feedback:</span>
                  <p className="text-amber-900 font-medium mt-0.5">"{selectedItem.reviewNote}"</p>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-700 bg-white/60 p-3 rounded-2xl leading-relaxed border border-slate-200/50">
              {selectedItem.note}
            </p>

            {selectedItem.mapLink && (
              <a
                href={selectedItem.mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
              >
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>{selectedItem.place || 'View Location on Google Maps'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <button
              onClick={() => setSelectedItem(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs py-2.5 rounded-xl cursor-pointer transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
