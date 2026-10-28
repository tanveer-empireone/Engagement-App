import React from 'react';
import { useApp } from '../context/AppContext';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AlertCircle, ShieldCheck } from 'lucide-react';

export const SessionLoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card rounded-3xl p-8 max-w-md w-full border border-white/80 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center shadow-md shadow-indigo-500/25">
          E1
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Checking your Google session</h1>
        <p className="mt-1 text-xs text-slate-500">
          Engagement Capture stays closed until Google confirms who is signed in.
        </p>
        <div className="mt-5 mx-auto w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
};

export const SignInScreen: React.FC = () => {
  const { signInWithGoogle, signOutGoogle, isSigningInGoogle, liveError, googleUser } = useApp();

  return (
    <div data-testid="google-sign-in-gate" className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="glass-card rounded-3xl p-6 sm:p-8 max-w-md w-full border border-white/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center shadow-md shadow-indigo-500/25">
            E1
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">EmpireOne CX</div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Engagement Capture</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600 leading-relaxed">
          Sign in with Google to open the app. Today, capture, review, and reports stay unavailable until Google sign-in succeeds.
        </p>

        <div className="mt-4 p-3 rounded-2xl bg-indigo-50/80 border border-indigo-100 flex items-start gap-2 text-[11px] text-indigo-900">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <p>Use your EmpireOne Google account. A cancelled popup leaves the app closed.</p>
        </div>

        {liveError && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>{liveError}</p>
          </div>
        )}

        {googleUser && !googleUser.email && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            This Google account did not share an email address, so it cannot enter the app.
          </div>
        )}

        <div className="mt-5">
          <GoogleSignInButton
            onClick={signInWithGoogle}
            isLoading={isSigningInGoogle}
            text="Sign in with Google"
            className="w-full"
          />
        </div>

        {googleUser && (
          <button
            type="button"
            onClick={() => void signOutGoogle()}
            className="mt-3 w-full text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Sign out of this Google account
          </button>
        )}
      </div>
    </div>
  );
};

export const BlockedScreen: React.FC = () => {
  const { currentUser, signOutGoogle } = useApp();

  return (
    <div data-testid="access-blocked" className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card rounded-3xl p-8 max-w-md w-full border border-white/80 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 text-white font-bold flex items-center justify-center">
          E1
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Access removed</h1>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          {currentUser?.Email || 'This Google account'} is signed in, but an admin removed access on this browser.
          The rest of Engagement Capture stays closed until access is restored.
        </p>
        <button
          type="button"
          onClick={() => void signOutGoogle()}
          className="mt-5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  );
};
