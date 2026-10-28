import React, { useState } from 'react';
import {
  BookOpen,
  Search,
  CheckCircle2,
  Lock,
  Star,
  Camera,
  RefreshCw,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const UserManualView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string>('group-upload');

  const sections = [
    {
      id: 'overview',
      title: '1. Overview & Setup',
      content: (
        <p className="text-xs text-slate-600 leading-relaxed">
          E1 Engagement Capture is EmpireOne CX&apos;s centralized shift capture platform. It connects officers, shift supervisors, and marketing with automatic ClickUp task synchronization, photo consent validation, and automated Google Drive filing.
        </p>
      )
    },
    {
      id: 'today',
      title: '2. Today: Directions & Themes',
      content: (
        <p className="text-xs text-slate-600 leading-relaxed">
          Open the Today tab at shift start. Inbound tasks from ClickUp and shift briefing notes populate your shift feed. Tap &ldquo;Got it&rdquo; to confirm you have read the direction.
        </p>
      )
    },
    {
      id: 'group-upload',
      title: '3. Group Upload (Photos & Videos)',
      content: (
        <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
          <p>
            When you have many photos from a shift or event:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Select your site, shift, and mode (Daily or Event).</li>
            <li>Choose Topic and Spot once for the entire batch.</li>
            <li>Tap &ldquo;Browse / Shoot&rdquo; to pick up to 35 MB per file.</li>
            <li>Tap the star on your best shots (5 per shift, 10 per event).</li>
            <li>Confirm consent and screen privacy checkboxes, then tap Upload.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'top-picks',
      title: '4. Top Picks Limit & Marketing',
      content: (
        <p className="text-xs text-slate-600 leading-relaxed">
          Officers can mark up to 5 top picks per shift (10 for special events). Approved top picks automatically route to ClickUp&apos;s Marketing Content Handoff for internal newsletters and social media.
        </p>
      )
    },
    {
      id: 'privacy',
      title: '5. Confidentiality & Screen Privacy',
      content: (
        <p className="text-xs text-slate-600 leading-relaxed">
          Strict Zero-Tolerance: No photos or videos may show computer monitors containing customer data, CRM screens, or ID badges. Any upload showing confidential screens will be rejected for reshoot.
        </p>
      )
    },
    {
      id: 'reports',
      title: '6. Shift Reports & 36-Hour Adherence',
      content: (
        <p className="text-xs text-slate-600 leading-relaxed">
          Submit your shift report before clocking out. Reports unsubmitted past 36 hours automatically trigger a follow-up task assigned to the Site Manager in ClickUp.
        </p>
      )
    }
  ];

  const filtered = sections.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-28 md:pb-12 max-w-3xl mx-auto">
      {/* Header Card */}
      <div className="glass-card rounded-3xl p-5 border border-white/70 shadow-xs space-y-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            User Manual &amp; Guidelines
          </h2>
          <p className="text-xs text-slate-500">
            Version 1.2 · Standard Operating Procedures for EmpireOne CX
          </p>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search guidelines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input w-full pl-8 pr-3 py-2 text-xs rounded-xl text-slate-900 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-2">
        {filtered.map((sec) => {
          const isOpen = expandedId === sec.id;
          return (
            <div
              key={sec.id}
              className="glass-card rounded-2xl border border-white/70 shadow-xs overflow-hidden transition"
            >
              <button
                onClick={() => setExpandedId(isOpen ? '' : sec.id)}
                className="w-full p-4 flex items-center justify-between text-left text-xs font-bold text-slate-800 hover:bg-white/40 cursor-pointer"
              >
                <span>{sec.title}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-slate-100/60">
                  {sec.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
