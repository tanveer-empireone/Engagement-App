import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { UploadItem } from '../types';
import {
  Search,
  Star,
  MapPin,
  ExternalLink,
  X,
  Camera
} from 'lucide-react';
import { MediaFrame } from './MediaFrame';

export const LibraryView: React.FC = () => {
  const { uploads } = useApp();
  const [tab, setTab] = useState<'all' | 'top'>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<UploadItem | null>(null);

  const filtered = uploads.filter((u) => {
    if (tab === 'top' && !u.topPick) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        u.id.toLowerCase().includes(q) ||
        u.topic.toLowerCase().includes(q) ||
        u.site.toLowerCase().includes(q) ||
        u.note.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-xl mx-auto">
      {/* 1. Header with Clean 2-Way Filter & Search */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Library
        </h2>

        {/* Effortless 2-Option Pill Filter */}
        <div className="flex bg-slate-100/80 p-1 rounded-xl text-xs font-medium">
          <button
            onClick={() => setTab('all')}
            className={`px-3 py-1 rounded-lg transition cursor-pointer ${
              tab === 'all'
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All ({uploads.length})
          </button>
          <button
            onClick={() => setTab('top')}
            className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
              tab === 'top'
                ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>Top Picks</span>
          </button>
        </div>
      </div>

      {/* Quick Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search moments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-full pl-9 pr-3 py-2 text-xs rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-hidden"
        />
      </div>

      {/* 2. Photo Grid (2-column, clean and visual) */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-3xl p-10 text-center text-xs text-slate-400">
          <Camera className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-600">No photos found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="glass-card hover:bg-white/90 active:scale-[0.98] rounded-2xl overflow-hidden border border-white/70 shadow-xs cursor-pointer transition flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-square bg-slate-950 overflow-hidden">
                  <MediaFrame mediaUrl={item.mediaUrl} label={item.id} className="w-full h-full object-cover" />

                  {item.topPick && (
                    <div className="absolute top-2 right-2 bg-amber-400 text-slate-950 text-[10px] font-bold p-1 rounded-full shadow-xs">
                      <Star className="w-3 h-3 fill-slate-950" />
                    </div>
                  )}

                  <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-medium">
                    {item.reviewStatus}
                  </div>
                </div>

                <div className="p-2.5">
                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {item.topic}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {item.site} · {item.shiftDate.slice(5)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 3. Detail Bottom Sheet / Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="glass-card rounded-t-3xl sm:rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-white/80 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{selectedItem.topic}</h3>
                <span className="text-[11px] text-slate-400">{selectedItem.site} · {selectedItem.shiftDate}</span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden aspect-video bg-black flex items-center justify-center">
              <MediaFrame mediaUrl={selectedItem.mediaUrl} label={selectedItem.id} className="max-h-full max-w-full object-contain" />
            </div>
            {selectedItem.webViewLink && (
              <a
                href={selectedItem.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Drive
              </a>
            )}

            <p className="text-xs text-slate-700 bg-white/60 p-3 rounded-2xl leading-relaxed">
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
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2.5 rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
