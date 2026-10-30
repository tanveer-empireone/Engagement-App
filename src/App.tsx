import React, { useEffect, useState } from 'react';
import { AppProvider, useApp, useSignedInApp } from './context/AppContext';
import { selectAppShell } from './utils/access';
import { Header } from './components/Header';
import { TodayView } from './components/TodayView';
import { CaptureView } from './components/CaptureView';
import { LibraryView } from './components/LibraryView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { ShiftReportsView } from './components/ShiftReportsView';
import { ConnectionView } from './components/ConnectionView';
import { UserManualView } from './components/UserManualView';
import { BlockedScreen, SessionLoadingScreen, SignInScreen } from './components/SignInScreen';

const MainContent: React.FC = () => {
  const { canUseCapture, canSeeIntegrations, canReview } = useSignedInApp();
  const [activeTab, setActiveTab] = useState<string>('today');

  useEffect(() => {
    if (!canReview && activeTab === 'review') setActiveTab('today');
    if (!canUseCapture && activeTab === 'capture') setActiveTab('today');
    if (!canSeeIntegrations && activeTab === 'connection') setActiveTab('today');
  }, [activeTab, canUseCapture, canSeeIntegrations, canReview]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans selection:bg-indigo-500 selection:text-white bg-slate-50/50">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          {activeTab === 'today' && (
            <TodayView
              onNavigateToCapture={() => setActiveTab('capture')}
              onNavigateToReports={() => setActiveTab('reports')}
            />
          )}
          {activeTab === 'capture' && canUseCapture && (
            <CaptureView onNavigateToLibrary={() => setActiveTab('library')} />
          )}
          {activeTab === 'library' && <LibraryView />}
          {activeTab === 'review' && canReview && <ReviewQueueView />}
          {activeTab === 'reports' && <ShiftReportsView />}
          {activeTab === 'connection' && canSeeIntegrations && <ConnectionView />}
          {activeTab === 'manual' && <UserManualView />}
        </main>
      </div>
    </div>
  );
};

const AuthShell: React.FC = () => {
  const { authReady, googleUser, currentUser } = useApp();
  const shell = selectAppShell({
    authReady,
    hasGoogleUser: Boolean(googleUser),
    person: currentUser
  });

  if (shell === 'loading') return <SessionLoadingScreen />;
  if (shell === 'signin') return <SignInScreen />;
  if (shell === 'blocked') return <BlockedScreen />;
  return <MainContent />;
};

export default function App() {
  return (
    <AppProvider>
      <AuthShell />
    </AppProvider>
  );
};
