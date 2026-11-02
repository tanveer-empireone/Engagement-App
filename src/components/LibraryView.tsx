import React, { useState, useMemo, useEffect } from 'react';
import { useSignedInApp } from '../context/AppContext';
import { UploadItem, DrivePermissionGrant } from '../types';
import {
  fetchDriveTreeWithImages,
  DriveTreeResult,
  FolderWithImages,
  DriveImageFile
} from '../services/googleDriveService';
import { getAccessToken } from '../services/googleAuth';
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
  User,
  HardDrive,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Share2,
  UserPlus,
  ShieldCheck,
  Lock,
  Unlock,
  Trash2,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronRight,
  Maximize2,
  FileText
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';

export const LibraryView: React.FC = () => {
  const {
    uploads,
    sites,
    people,
    currentUser,
    isAdmin,
    googleUser,
    isGoogleConnected,
    isSigningInGoogle,
    signInWithGoogle,
    appConfig,
    googleToken,
    drivePermissions,
    grantDrivePermission,
    revokeDrivePermission,
    canUserAccessDriveItem
  } = useSignedInApp();

  // Top-level Media Library view mode: Drive folders vs Shift submissions
  const [viewMode, setViewMode] = useState<'drive' | 'submissions'>('drive');

  // Google Drive Explorer state
  const [isDriveLoading, setIsDriveLoading] = useState<boolean>(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveTree, setDriveTree] = useState<DriveTreeResult | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [driveSearch, setDriveSearch] = useState<string>('');
  const [selectedDriveImage, setSelectedDriveImage] = useState<DriveImageFile | null>(null);

  // Admin Sharing Modal state
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [shareTargetType, setShareTargetType] = useState<'all' | 'folder' | 'file'>('folder');
  const [shareTargetId, setShareTargetId] = useState<string>('');
  const [shareTargetName, setShareTargetName] = useState<string>('');
  const [shareGranteeType, setShareGranteeType] = useState<'user' | 'role' | 'site'>('user');
  const [shareGranteeValue, setShareGranteeValue] = useState<string>('');
  const [shareGranteeName, setShareGranteeName] = useState<string>('');
  const [shareNotice, setShareNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [isGranting, setIsGranting] = useState<boolean>(false);

  // Shift Submissions Filters state
  const [subTab, setSubTab] = useState<'all' | 'top' | 'creative'>('all');
  const [subSearch, setSubSearch] = useState<string>('');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedOfficer, setSelectedOfficer] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<UploadItem | null>(null);

  // Fetch live Google Drive tree
  const loadDriveTree = async () => {
    const token = googleToken || (await getAccessToken());
    if (!token) {
      if (isAdmin) {
        setDriveError('Sign in with Google to explore live Drive folders.');
      }
      return;
    }

    setIsDriveLoading(true);
    setDriveError(null);
    try {
      const rootId = appConfig.driveRootId?.trim() || '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN';
      const result = await fetchDriveTreeWithImages(token, rootId);
      setDriveTree(result);

      // Default expand all folders that contain images
      const initialExpanded: Record<string, boolean> = {};
      result.foldersWithImages.forEach((f) => {
        initialExpanded[f.folder.id] = f.images.length > 0;
      });
      setExpandedFolders(initialExpanded);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDriveError(`Failed to fetch Drive items: ${msg}`);
      console.warn('Drive tree fetch error:', err);
    } finally {
      setIsDriveLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'drive' && (isGoogleConnected || googleToken)) {
      void loadDriveTree();
    }
  }, [viewMode, isGoogleConnected, googleToken]);

  // Open Sharing modal targeted to a specific folder or file
  const openShareModal = (targetType: 'all' | 'folder' | 'file', targetId?: string, targetName?: string) => {
    setShareTargetType(targetType);
    setShareTargetId(targetId || (targetType === 'all' ? 'root' : ''));
    setShareTargetName(targetName || (targetType === 'all' ? 'Entire Google Drive' : ''));
    setShareNotice(null);
    setShareModalOpen(true);
  };

  const handleGrantPermission = async () => {
    if (!shareTargetId || !shareGranteeValue) {
      setShareNotice({ ok: false, message: 'Please select what to share and who to grant access to.' });
      return;
    }

    setIsGranting(true);
    setShareNotice(null);
    try {
      const targetLabel = shareTargetName || (shareTargetType === 'all' ? 'Entire Drive' : shareTargetId);
      let granteeLabel = shareGranteeValue;
      if (shareGranteeType === 'user') {
        const p = people.find((u) => u.Email.toLowerCase() === shareGranteeValue.toLowerCase());
        granteeLabel = p ? `${p.Name} (${p.Email})` : shareGranteeValue;
      }

      const res = await grantDrivePermission({
        targetType: shareTargetType,
        targetId: shareTargetId,
        targetName: targetLabel,
        granteeType: shareGranteeType,
        granteeValue: shareGranteeValue,
        granteeName: granteeLabel
      });
      setShareNotice({ ok: res.ok, message: res.message });
      if (res.ok) {
        // Reset grantee
        setShareGranteeValue('');
      }
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokePermission = async (id: string) => {
    const res = await revokeDrivePermission(id);
    setShareNotice({ ok: res.ok, message: res.message });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Filter Google Drive folders and files:
  // - Admins see everything.
  // - Non-admins only see folders/files where canUserAccessDriveItem is true.
  const accessibleFoldersWithImages = useMemo(() => {
    if (!driveTree) return [];

    const query = driveSearch.trim().toLowerCase();

    return driveTree.foldersWithImages
      .filter(({ folder }) => {
        // Permission check
        if (!isAdmin && !canUserAccessDriveItem('folder', folder.id)) {
          return false;
        }
        return true;
      })
      .map(({ folder, images }) => {
        // Filter images inside folder
        const visibleImages = images.filter((img) => {
          if (!isAdmin && !canUserAccessDriveItem('file', img.id, folder.id)) {
            return false;
          }
          if (query && !img.name.toLowerCase().includes(query) && !folder.name.toLowerCase().includes(query)) {
            return false;
          }
          return true;
        });

        return {
          folder,
          images: visibleImages
        };
      })
      .filter(({ folder, images }) => {
        if (!query) return true;
        return folder.name.toLowerCase().includes(query) || images.length > 0;
      });
  }, [driveTree, driveSearch, isAdmin, canUserAccessDriveItem]);

  const accessibleRootImages = useMemo(() => {
    if (!driveTree) return [];
    const query = driveSearch.trim().toLowerCase();
    return (driveTree.rootImages || []).filter((img) => {
      if (!isAdmin && !canUserAccessDriveItem('file', img.id)) return false;
      if (query && !img.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [driveTree, driveSearch, isAdmin, canUserAccessDriveItem]);

  const totalAccessibleImages = useMemo(() => {
    return (
      accessibleFoldersWithImages.reduce((sum, f) => sum + f.images.length, 0) +
      accessibleRootImages.length
    );
  }, [accessibleFoldersWithImages, accessibleRootImages]);

  // Submissions filter options
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
    return Array.from(map.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [uploads]);

  const filteredSubmissions = useMemo(() => {
    return uploads.filter((u) => {
      if (subTab === 'top' && !u.topPick) return false;
      if (subTab === 'creative' && !u.isCreativeWork) return false;

      if (selectedSite !== 'all' && u.site !== selectedSite) return false;
      if (selectedTopic !== 'all' && u.topic !== selectedTopic) return false;
      if (selectedOfficer !== 'all' && u.officer.toLowerCase() !== selectedOfficer.toLowerCase()) return false;

      if (subSearch.trim()) {
        const q = subSearch.toLowerCase();
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
  }, [uploads, subTab, selectedSite, selectedTopic, selectedOfficer, subSearch]);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-5 pb-28 md:pb-12 max-w-5xl mx-auto animate-in fade-in">
      {/* ========================================================
          1. HEADER ROW: Page Title, View Toggle & Admin Controls
          ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Media Library
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {viewMode === 'drive' ? 'Google Drive' : 'Shift Moments'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {viewMode === 'drive'
              ? isAdmin
                ? 'Browse all Google Drive folders and manage team sharing permissions.'
                : 'Browse Google Drive folders and media shared with you by the admin.'
              : `Showing ${filteredSubmissions.length} of ${uploads.length} verified submissions.`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* Admin Share Manager Button */}
          {isAdmin && (
            <button
              onClick={() => openShareModal('all')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Drive Access</span>
              {drivePermissions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                  {drivePermissions.length}
                </span>
              )}
            </button>
          )}

          {/* Mode Switcher: Google Drive vs Shift Submissions */}
          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-medium border border-slate-200/60 shadow-2xs">
            <button
              onClick={() => setViewMode('drive')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'drive'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Drive Storage</span>
            </button>
            <button
              onClick={() => setViewMode('submissions')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'submissions'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Submissions ({uploads.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. VIEW 1: GOOGLE DRIVE STORAGE (Folders & Images)
          ======================================================== */}
      {viewMode === 'drive' && (
        <div className="space-y-4">
          {/* Drive Status & Search Bar */}
          <div className="glass-card rounded-2xl p-4 border border-white/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Google Drive: {driveTree?.rootFolder?.name || 'E1CX Experience'}
                    </span>
                    {isAdmin && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                        Admin Full View
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Folder ID: {appConfig.driveRootId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void loadDriveTree()}
                  disabled={isDriveLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDriveLoading ? 'animate-spin' : ''}`} />
                  <span>{isDriveLoading ? 'Fetching...' : 'Refresh'}</span>
                </button>

                <a
                  href={`https://drive.google.com/drive/folders/${appConfig.driveRootId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition flex items-center gap-1"
                >
                  <span>Open Drive</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Drive Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Google Drive folders and media filenames..."
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              {driveSearch && (
                <button
                  onClick={() => setDriveSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Notice for Google Connection / Auth */}
            {driveError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                <span>{driveError}</span>
                <GoogleSignInButton
                  onClick={signInWithGoogle}
                  isLoading={isSigningInGoogle}
                  text="Refresh Access"
                />
              </div>
            )}
          </div>

          {/* Drive Content Loading State */}
          {isDriveLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="glass-card rounded-2xl p-5 border border-white/80 animate-pulse space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-48" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((m) => (
                      <div key={m} className="aspect-square bg-slate-200 rounded-xl" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty / Unshared State for Non-Admins */}
          {!isDriveLoading && !isAdmin && accessibleFoldersWithImages.length === 0 && accessibleRootImages.length === 0 && (
            <div className="glass-card rounded-3xl p-10 border border-white/80 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-500 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No Drive Folders Shared Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                You currently do not have access to any Google Drive folders or files. Access is managed by administrators ({appConfig.appsScriptUrl ? 'technical admin' : 'tanveer@empireonecx.com'}). Ask an admin to share specific site folders or media with your account.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setViewMode('submissions')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs cursor-pointer"
                >
                  View Shift Submissions
                </button>
              </div>
            </div>
          )}

          {/* Root Images (Files placed directly in root) */}
          {!isDriveLoading && accessibleRootImages.length > 0 && !driveSearch && (
            <div className="glass-card rounded-2xl border border-white/80 shadow-xs overflow-hidden">
              <div className="p-3.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-800">Files in Root Folder</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    {accessibleRootImages.length}
                  </span>
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {accessibleRootImages.map((img) => (
                  <DriveMediaCard
                    key={img.id}
                    image={img}
                    isAdmin={isAdmin}
                    onSelect={() => setSelectedDriveImage(img)}
                    onShare={() => openShareModal('file', img.id, img.name)}
                    formatSize={formatFileSize}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Accessible Folders with Nested Images */}
          {!isDriveLoading && accessibleFoldersWithImages.length > 0 && (
            <div className="space-y-3.5">
              {accessibleFoldersWithImages.map(({ folder, images }) => {
                const isExpanded = Boolean(expandedFolders[folder.id]);

                return (
                  <div
                    key={folder.id}
                    className="glass-card rounded-2xl border border-white/80 shadow-xs overflow-hidden transition"
                  >
                    {/* Folder Header */}
                    <div
                      onClick={() => toggleFolder(folder.id)}
                      className="p-4 bg-white/80 hover:bg-white cursor-pointer transition flex items-center justify-between gap-3 border-b border-slate-100"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-700 transition"
                          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                          {isExpanded ? (
                            <FolderOpen className="w-5 h-5" />
                          ) : (
                            <Folder className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 truncate">
                              {folder.name}
                            </h3>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                images.length > 0
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {images.length} {images.length === 1 ? 'image' : 'images'}
                            </span>
                          </div>
                          {folder.modifiedTime && (
                            <p className="text-[11px] text-slate-400">
                              Modified {formatDate(folder.modifiedTime)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {/* Admin Share Folder Action */}
                        {isAdmin && (
                          <button
                            onClick={() => openShareModal('folder', folder.id, folder.name)}
                            title={`Share ${folder.name} folder`}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 transition cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Share</span>
                          </button>
                        )}

                        {folder.webViewLink && (
                          <a
                            href={folder.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Open folder in Google Drive"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Folder Images Grid */}
                    {isExpanded && (
                      <div className="p-4 bg-slate-50/50">
                        {images.length === 0 ? (
                          <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                            <ImageIcon className="w-7 h-7 mx-auto text-slate-300 stroke-1" />
                            <p>No images in this folder on Google Drive.</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {images.map((img) => (
                              <DriveMediaCard
                                key={img.id}
                                image={img}
                                isAdmin={isAdmin}
                                onSelect={() => setSelectedDriveImage(img)}
                                onShare={() => openShareModal('file', img.id, img.name)}
                                formatSize={formatFileSize}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          3. VIEW 2: SHIFT SUBMISSIONS (Officer Uploads from Sheets)
          ======================================================== */}
      {viewMode === 'submissions' && (
        <div className="space-y-4">
          {/* Submissions Filter Toolbar */}
          <div className="glass-card rounded-2xl p-3.5 border border-white/80 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Filter className="w-3.5 h-3.5 text-indigo-600" />
                <span>Filters</span>
              </div>

              {/* Submissions Tab Switcher */}
              <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setSubTab('all')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    subTab === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500'
                  }`}
                >
                  All ({uploads.length})
                </button>
                <button
                  onClick={() => setSubTab('top')}
                  className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                    subTab === 'top' ? 'bg-white text-amber-600 shadow-xs font-bold' : 'text-slate-500'
                  }`}
                >
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>Top Picks</span>
                </button>
                <button
                  onClick={() => setSubTab('creative')}
                  className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                    subTab === 'creative' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-500'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  <span>Creative</span>
                </button>
              </div>
            </div>

            {/* Keyword Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search keyword, officer, note, or ID..."
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Select Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="glass-input w-full px-2.5 py-1.5 text-xs rounded-xl text-slate-800 font-medium cursor-pointer"
              >
                <option value="all">📍 All Locations</option>
                {availableSites.map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="glass-input w-full px-2.5 py-1.5 text-xs rounded-xl text-slate-800 font-medium cursor-pointer"
              >
                <option value="all">🏷️ All Categories</option>
                {availableTopics.map((t: string) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={selectedOfficer}
                onChange={(e) => setSelectedOfficer(e.target.value)}
                className="glass-input w-full px-2.5 py-1.5 text-xs rounded-xl text-slate-800 font-medium cursor-pointer"
              >
                <option value="all">👤 All Submitting Officers</option>
                {availableOfficers.map((o: { email: string; name: string }) => (
                  <option key={o.email} value={o.email}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Submissions Grid */}
          {filteredSubmissions.length === 0 ? (
            <div className="glass-card rounded-3xl p-12 text-center text-xs text-slate-400 border border-white/80 space-y-2">
              <Camera className="w-10 h-10 text-slate-300 mx-auto stroke-1" />
              <p>No submissions match the selected filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredSubmissions.map((item) => (
                <article
                  key={item.id}
                  onClick={() => setSelectedSubmission(item)}
                  className="glass-card hover:bg-white/95 active:scale-[0.98] rounded-2xl overflow-hidden border border-white/80 shadow-xs cursor-pointer transition flex flex-col justify-between group"
                >
                  <div>
                    <div className="relative aspect-square bg-slate-950 overflow-hidden">
                      <SubmissionThumbnail
                        url={item.mediaUrl}
                        topic={item.topic}
                        mediaType={item.mediaType}
                        site={item.site}
                      />

                      {item.topPick && (
                        <div className="absolute top-2 right-2 bg-amber-400 text-slate-950 text-[10px] font-bold p-1 rounded-full shadow-xs">
                          <Star className="w-3 h-3 fill-slate-950" />
                        </div>
                      )}

                      {item.isCreativeWork && (
                        <div className="absolute top-2 left-2 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Creative</span>
                        </div>
                      )}

                      {item.mediaType === 'Video' && (
                        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] flex items-center gap-1 font-medium">
                          <Video className="w-3 h-3 text-rose-400" />
                        </div>
                      )}

                      <div
                        className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold text-white ${
                          item.reviewStatus === 'Accepted'
                            ? 'bg-emerald-600/90'
                            : item.reviewStatus === 'Reshoot'
                            ? 'bg-rose-600/90'
                            : item.reviewStatus === 'Top pick'
                            ? 'bg-amber-600/90'
                            : 'bg-black/60'
                        }`}
                      >
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
        </div>
      )}

      {/* ========================================================
          4. LIGHTBOX MODAL FOR GOOGLE DRIVE IMAGES
          ======================================================== */}
      {selectedDriveImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in"
          onClick={() => setSelectedDriveImage(null)}
        >
          <div
            className="glass-card bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/95">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Google Drive Media
                  </span>
                  {selectedDriveImage.folderName && (
                    <span className="text-xs text-slate-400 truncate">
                      in {selectedDriveImage.folderName}
                    </span>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white truncate mt-1">
                  {selectedDriveImage.name}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => {
                      setSelectedDriveImage(null);
                      openShareModal('file', selectedDriveImage.id, selectedDriveImage.name);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-900/50 hover:bg-indigo-800/60 border border-indigo-700/50 transition cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                )}

                {selectedDriveImage.webViewLink && (
                  <a
                    href={selectedDriveImage.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition"
                  >
                    <span>Open in Drive</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => setSelectedDriveImage(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  aria-label="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Display */}
            <div className="flex-1 min-h-[300px] max-h-[60vh] bg-black/70 flex items-center justify-center p-4 overflow-auto">
              <img
                src={selectedDriveImage.thumbnailLink || `https://drive.google.com/thumbnail?id=${selectedDriveImage.id}&sz=w1200`}
                alt={selectedDriveImage.name}
                className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>

            {/* Modal Details Footer */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <span>
                  Size: <strong className="text-white">{formatFileSize(selectedDriveImage.size)}</strong>
                </span>
                {selectedDriveImage.createdTime && (
                  <span>
                    Uploaded:{' '}
                    <strong className="text-white">{formatDate(selectedDriveImage.createdTime)}</strong>
                  </span>
                )}
                <span>
                  Type: <strong className="text-white">{selectedDriveImage.mimeType.replace('image/', '').toUpperCase()}</strong>
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-500">
                ID: {selectedDriveImage.id}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          5. SUBMISSION INSPECTION MODAL
          ======================================================== */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <div className="glass-card rounded-3xl max-w-md w-full p-5 shadow-2xl border border-white/80 space-y-3.5 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-start justify-between pb-1">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-base">{selectedSubmission.topic}</h3>
                  {selectedSubmission.isCreativeWork && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Creative Work
                    </span>
                  )}
                  {selectedSubmission.usedInFinal && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Approved Final
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedSubmission.site} · {selectedSubmission.shift} Shift · {selectedSubmission.shiftDate}
                </p>
              </div>
              <button
                onClick={() => setSelectedSubmission(null)}
                aria-label="Close detail modal"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden aspect-video bg-black flex items-center justify-center border border-slate-200/70">
              <SubmissionThumbnail
                url={selectedSubmission.mediaUrl}
                topic={selectedSubmission.topic}
                mediaType={selectedSubmission.mediaType}
                site={selectedSubmission.site}
                inModal
              />
            </div>

            <div className="p-3 rounded-2xl bg-white/70 border border-slate-200/70 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-400">Submitting Officer:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <User className="w-3 h-3 text-indigo-600" />
                  {selectedSubmission.officerName || selectedSubmission.officer}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-400">Review Status:</span>
                <span className="font-semibold text-slate-800">{selectedSubmission.reviewStatus}</span>
              </div>
              {selectedSubmission.reviewNote && (
                <div className="pt-1 border-t border-slate-100">
                  <span className="text-slate-400 text-[11px] block">Reviewer Feedback:</span>
                  <p className="text-amber-900 font-medium mt-0.5">"{selectedSubmission.reviewNote}"</p>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-700 bg-white/60 p-3 rounded-2xl leading-relaxed border border-slate-200/50">
              {selectedSubmission.note}
            </p>

            {selectedSubmission.mapLink && (
              <a
                href={selectedSubmission.mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
              >
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>{selectedSubmission.place || 'View Location on Google Maps'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <button
              onClick={() => setSelectedSubmission(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs py-2.5 rounded-xl cursor-pointer transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          6. ADMIN DRIVE ACCESS & SHARING MODAL
          ======================================================== */}
      {isAdmin && shareModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="glass-card bg-white rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl border border-white/90 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Drive Access & Sharing
                  </h3>
                  <p className="text-xs text-slate-500">
                    Grant team members access to Google Drive or specific folders and files
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShareModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {/* Grant New Permission Form */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-indigo-600" />
                  <span>Grant New Access Permission</span>
                </div>

                {/* 1. Target Selector (What to share) */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    What to share:
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setShareTargetType('all');
                        setShareTargetId('root');
                        setShareTargetName('Entire Google Drive');
                      }}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                        shareTargetType === 'all'
                          ? 'bg-indigo-600 text-white font-bold border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      Entire Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShareTargetType('folder');
                        const firstFolder = driveTree?.foldersWithImages[0]?.folder;
                        setShareTargetId(firstFolder?.id || '');
                        setShareTargetName(firstFolder?.name || '');
                      }}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                        shareTargetType === 'folder'
                          ? 'bg-indigo-600 text-white font-bold border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      Specific Folder
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShareTargetType('file');
                      }}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                        shareTargetType === 'file'
                          ? 'bg-indigo-600 text-white font-bold border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      Specific File
                    </button>
                  </div>
                </div>

                {/* Folder dropdown if target is folder */}
                {shareTargetType === 'folder' && driveTree && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Select Folder:
                    </label>
                    <select
                      value={shareTargetId}
                      onChange={(e) => {
                        const fid = e.target.value;
                        setShareTargetId(fid);
                        const match = driveTree.foldersWithImages.find((f) => f.folder.id === fid);
                        setShareTargetName(match?.folder.name || fid);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800"
                    >
                      <option value="">-- Choose a Google Drive Folder --</option>
                      {driveTree.foldersWithImages.map(({ folder }) => (
                        <option key={folder.id} value={folder.id}>
                          📁 {folder.name} ({folder.imageCount} images)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* File info if target is file */}
                {shareTargetType === 'file' && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      File Name or ID:
                    </label>
                    <input
                      type="text"
                      placeholder="File Name or Drive ID..."
                      value={shareTargetName || shareTargetId}
                      onChange={(e) => {
                        setShareTargetId(e.target.value);
                        setShareTargetName(e.target.value);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800"
                    />
                  </div>
                )}

                {/* 2. Grantee Selector (Who to give access to) */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Who can access it:
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShareGranteeType('user');
                        setShareGranteeValue('');
                      }}
                      className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
                        shareGranteeType === 'user'
                          ? 'bg-indigo-100 text-indigo-800 font-bold border-indigo-300'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Specific Person
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShareGranteeType('role');
                        setShareGranteeValue('Officer');
                      }}
                      className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
                        shareGranteeType === 'role'
                          ? 'bg-indigo-100 text-indigo-800 font-bold border-indigo-300'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      By Role
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShareGranteeType('site');
                        setShareGranteeValue('Toronto');
                      }}
                      className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
                        shareGranteeType === 'site'
                          ? 'bg-indigo-100 text-indigo-800 font-bold border-indigo-300'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      By Site
                    </button>
                  </div>

                  {/* Person Selector */}
                  {shareGranteeType === 'user' && (
                    <select
                      value={shareGranteeValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setShareGranteeValue(val);
                        const p = people.find((u) => u.Email.toLowerCase() === val.toLowerCase());
                        setShareGranteeName(p?.Name || val);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800"
                    >
                      <option value="">-- Choose Team Member from Roster --</option>
                      {people.map((p) => (
                        <option key={p.Email} value={p.Email}>
                          👤 {p.Name} — {p.Role} ({p.Site}) [{p.Email}]
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Role Selector */}
                  {shareGranteeType === 'role' && (
                    <select
                      value={shareGranteeValue}
                      onChange={(e) => setShareGranteeValue(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800"
                    >
                      <option value="Officer">All Engagement Officers</option>
                      <option value="Site Manager">All Site Managers</option>
                      <option value="Creative Designer">All Creative Designers</option>
                      <option value="Director">All Directors</option>
                    </select>
                  )}

                  {/* Site Selector */}
                  {shareGranteeType === 'site' && (
                    <select
                      value={shareGranteeValue}
                      onChange={(e) => setShareGranteeValue(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800"
                    >
                      {sites.map((s) => (
                        <option key={s.Code} value={s.SiteName}>
                          📍 {s.SiteName} ({s.Code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {shareNotice && (
                  <div
                    className={`p-2.5 rounded-xl text-xs ${
                      shareNotice.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {shareNotice.message}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGrantPermission}
                  disabled={isGranting || !shareTargetId || !shareGranteeValue}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isGranting ? 'Granting Access...' : 'Grant Access'}
                </button>
              </div>

              {/* Active Permissions List */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                  <span>Active Permissions ({drivePermissions.length})</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    Admins have full access by default
                  </span>
                </div>

                {drivePermissions.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                    No active share permissions. Non-admins cannot see any Google Drive media until access is granted.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {drivePermissions.map((grant) => (
                      <div
                        key={grant.id}
                        className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900">
                              {grant.targetType === 'all'
                                ? 'Entire Google Drive'
                                : `${grant.targetType === 'folder' ? '📁' : '📄'} ${grant.targetName}`}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[11px]">
                              {grant.granteeName || grant.granteeValue}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Granted by {grant.grantedBy} · {formatDate(grant.grantedAt)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRevokePermission(grant.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                          title="Revoke access"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component for individual Google Drive media card
const DriveMediaCard: React.FC<{
  image: DriveImageFile;
  isAdmin: boolean;
  onSelect: () => void;
  onShare: () => void;
  formatSize: (bytes?: number) => string;
}> = ({ image, isAdmin, onSelect, onShare, formatSize }) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const thumbnailSrc =
    image.thumbnailLink ||
    `https://drive.google.com/thumbnail?id=${image.id}&sz=w800`;

  return (
    <div
      onClick={onSelect}
      className="group relative bg-white rounded-xl overflow-hidden border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-indigo-400 transition cursor-pointer flex flex-col justify-between"
    >
      <div className="aspect-square bg-slate-900 overflow-hidden relative">
        {!imgError ? (
          <img
            src={thumbnailSrc}
            alt={image.name}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover group-hover:scale-105 transition duration-300 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-slate-400">
            <ImageIcon className="w-6 h-6 mb-1 text-slate-500" />
            <span className="text-[10px] truncate max-w-full px-1">Drive Image</span>
          </div>
        )}

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-md">
            <Eye className="w-3.5 h-3.5" />
          </div>
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              title="Share this file"
              className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md hover:bg-indigo-700 transition"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Badge: File Type */}
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[9px] font-semibold uppercase tracking-wider">
          {image.mimeType.replace('image/', '')}
        </div>
      </div>

      {/* Info Label */}
      <div className="p-2.5">
        <div className="text-[11px] font-semibold text-slate-800 truncate" title={image.name}>
          {image.name}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
          <span>{formatSize(image.size)}</span>
          <span className="text-indigo-600 font-medium group-hover:underline">Preview</span>
        </div>
      </div>
    </div>
  );
};

// Reusable clean thumbnail with zero external stock image fallbacks
const SubmissionThumbnail: React.FC<{
  url?: string;
  topic: string;
  mediaType: string;
  site?: string;
  inModal?: boolean;
}> = ({ url, topic, mediaType, site, inModal }) => {
  const [hasError, setHasError] = useState(false);

  if (!url || hasError) {
    return (
      <div className={`w-full h-full bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 flex flex-col items-center justify-center p-4 text-center select-none ${inModal ? 'min-h-[180px]' : ''}`}>
        <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 mb-2 shadow-inner">
          {mediaType === 'Video' ? <Video className="w-5 h-5 text-indigo-300" /> : <Camera className="w-5 h-5 text-indigo-300" />}
        </div>
        <span className="text-xs font-bold text-white/90 line-clamp-1 max-w-[90%]">
          {topic}
        </span>
        <span className="text-[10px] text-slate-400 mt-0.5">
          {site ? `${site} · ` : ''}{mediaType === 'Video' ? 'Video Record' : 'Photo Record'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={topic}
      loading="lazy"
      onError={() => setHasError(true)}
      className={inModal ? 'max-h-full max-w-full object-contain' : 'w-full h-full object-cover group-hover:scale-105 transition duration-300'}
    />
  );
};
