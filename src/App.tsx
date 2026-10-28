import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { TodayView } from './components/TodayView';
import { CaptureView } from './components/CaptureView';
import { LibraryView } from './components/LibraryView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { ShiftReportsView } from './components/ShiftReportsView';
import { ConnectionView } from './components/ConnectionView';
import { UserManualView } from './components/UserManualView';

const MainContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('today');

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans selection:bg-indigo-500 selection:text-white bg-slate-50/50">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          {activeTab === 'today' && (
            <TodayView
              onNavigateToCapture={() => setActiveTab('capture')}
              onNavigateToReports={() => setActiveTab('reports')}
            />
          )}
          {activeTab === 'capture' && (
            <CaptureView onNavigateToLibrary={() => setActiveTab('library')} />
          )}
          {activeTab === 'library' && <LibraryView />}
          {activeTab === 'review' && <ReviewQueueView />}
          {activeTab === 'reports' && <ShiftReportsView />}
          {activeTab === 'connection' && <ConnectionView />}
          {activeTab === 'manual' && <UserManualView />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
