'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import {
  PlatformUser,
  authenticateUser,
  fetchAllPlatformAccessRequests,
  isConfiguredAdminRole,
  persistPlatformAccessRequest,
  persistSession,
  readStoredSession,
  submitAccessRequest,
} from '@/lib/auth';

export type { PlatformUser };

interface AuthContextValue {
  user: PlatformUser | null;
  isAdmin: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAdmin: false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<PlatformUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Sign-in / Access Request form state
  const [mode, setMode] = useState<'login' | 'request'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [reason, setReason] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      const stored = readStoredSession();
      if (!stored) {
        if (mounted) setAuthInitialized(true);
        return;
      }

      if (mounted) {
        setUser(stored);
        setAuthInitialized(true);
      }

      // Sync role changes (e.g., admin promotion/revocation) when remote store is reachable
      try {
        const { requests, remoteReachable } = await fetchAllPlatformAccessRequests();
        if (!remoteReachable || !mounted) return;

        const hasAnyAdmin = requests.some((r) => r.status === 'approved' && r.role === 'admin');
        const dbRecord = requests.find((r) => r.email.toLowerCase() === stored.email.toLowerCase());
        let resolvedRole: 'admin' | 'user' = stored.role;

        if (!hasAnyAdmin && requests.length === 0) {
          resolvedRole = 'admin';
          await persistPlatformAccessRequest(
            {
              id: stored.id,
              full_name: stored.name,
              email: stored.email,
              institution: stored.institution || 'FUT Minna',
              reason: 'Primary Platform Administrator',
              password: '',
              role: 'admin',
              status: 'approved',
              created_at: new Date().toISOString(),
            },
            requests
          );
        } else if (dbRecord) {
          resolvedRole = isConfiguredAdminRole(dbRecord.role, false, dbRecord.email)
            ? 'admin'
            : 'user';
        }

        if (mounted && resolvedRole !== stored.role) {
          const updated: PlatformUser = { ...stored, role: resolvedRole };
          setUser(updated);
          persistSession(updated);
        }
      } catch {}
    };

    initSession();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLoginSuccess = (loggedInUser: PlatformUser) => {
    setUser(loggedInUser);
    persistSession(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
    setAuthError(null);
    setRequestSubmitted(false);
    persistSession(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const result = await authenticateUser(email, password);
      if (result.user) {
        handleLoginSuccess(result.user);
      } else {
        setAuthError(result.error || 'Sign-in failed.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setAuthError('Please fill in all required fields.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      const result = await submitAccessRequest({
        fullName,
        email,
        institution,
        reason,
        password,
      });

      if (result.autoApprovedUser) {
        handleLoginSuccess(result.autoApprovedUser);
        return;
      }
      setRequestSubmitted(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not submit request.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (!authInitialized) return null;

  // Logged-out view: Direct Sign In / Request Access + Quick Instructions
  if (!user) {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col justify-between font-sans">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/ml4ps-logo.png"
                alt="ML4PS Logo"
                className="h-9 w-9 object-contain rounded-lg border border-slate-200 p-0.5 bg-white"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div>
                <span className="font-black text-base text-slate-900 tracking-tight block leading-none">
                  National Power System Modelling and Simulation Platform (Nigeria)
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Machine Learning 4 Power Systems (ML4PS) • FUT Minna
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Sign In / Request Access Card */}
            <div className="md:col-span-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                {mode === 'login' ? (
                  <Lock className="h-4 w-4 text-[#500b50]" />
                ) : (
                  <UserPlus className="h-4 w-4 text-[#500b50]" />
                )}
                <h1 className="font-bold text-sm text-slate-900">
                  {mode === 'login' ? 'Sign In' : 'Request Account Access'}
                </h1>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-bold mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setAuthError(null);
                      setRequestSubmitted(false);
                    }}
                    className={`py-2 rounded-lg transition ${
                      mode === 'login' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('request');
                      setAuthError(null);
                    }}
                    className={`py-2 rounded-lg transition ${
                      mode === 'request' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Request Access
                  </button>
                </div>

                {authError && (
                  <div className="mb-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                {mode === 'login' ? (
                  <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        required
                        placeholder="name@institution.edu.ng"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#500b50]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Password</label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-[#500b50]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-2.5 rounded-xl bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition disabled:opacity-50"
                    >
                      {authLoading ? 'Signing In...' : 'Sign In'}
                    </button>
                  </form>
                ) : requestSubmitted ? (
                  <div className="py-6 text-center space-y-3">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                    <h4 className="font-bold text-sm text-slate-900">Request Sent</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Your request for <strong>{email}</strong> has been sent to the administrators. Once approved, you can sign in with your chosen password.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestSubmitted(false);
                        setMode('login');
                      }}
                      className="mt-2 px-4 py-2 rounded-lg bg-[#500b50] text-white text-xs font-bold"
                    >
                      Back to Sign In
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRequestSubmit} className="space-y-3 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="you@university.edu.ng"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Institution</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. FUT Minna"
                          value={institution}
                          onChange={(e) => setInstitution(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Purpose of Use</label>
                      <textarea
                        rows={2}
                        required
                        placeholder="Coursework, thesis, or grid analysis..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Password</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Choose a password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-2.5 rounded-xl bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition disabled:opacity-50"
                    >
                      {authLoading ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Platform Instructions */}
            <div className="md:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="font-bold text-sm text-slate-900">Quick Instructions</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  How to use the power system simulation workspace after signing in.
                </p>
              </div>

              <ol className="space-y-3.5 text-xs text-slate-700">
                <li className="flex gap-3">
                  <span className="h-5 w-5 rounded-full bg-[#500b50] text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <strong className="text-slate-900 block">Select or Upload a Model</strong>
                    Open <em>Grid Stability Models</em> to load an existing 330 kV or 132 kV network, or use <em>Upload &amp; Ingestion</em> to upload a MATPOWER (<code>.m</code>) or pandapower (<code>.json</code>) file.
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="h-5 w-5 rounded-full bg-[#500b50] text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <strong className="text-slate-900 block">Edit Parameters &amp; Run Power Flow</strong>
                    In the <em>Operational Deck</em>, adjust load scaling, power factor, or slack voltage, switch buses or lines on and off, or click <strong>⋯</strong> on any row to edit its static and dynamic ratings.
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="h-5 w-5 rounded-full bg-[#500b50] text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <strong className="text-slate-900 block">Single-Line Diagram (SLD)</strong>
                    View bus voltages and line flows on the diagram. Drag buses to rearrange them, click any line to open or close its breaker, or click a bus to inspect live readings.
                  </div>
                </li>

                <li className="flex gap-3">
                  <span className="h-5 w-5 rounded-full bg-[#500b50] text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <strong className="text-slate-900 block">Time-Domain &amp; Market Simulations</strong>
                    Use <em>Time-Domain</em> to run frequency response and fault clearing time studies, or <em>Market Simulations</em> to calculate merit-order dispatch and nodal settlement.
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </main>

        <footer className="bg-white border-t border-slate-200 py-4">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span>© 2026 Machine Learning 4 Power Systems (ML4PS) • FUT Minna</span>
            <span>National Power System Simulation Platform</span>
          </div>
        </footer>
      </div>
    );
  }

  const isAdmin = user.role === 'admin';
  const isRestrictedAdminRoute = !isAdmin && pathname?.startsWith('/upload');

  return (
    <AuthContext.Provider value={{ user, isAdmin, logout: handleLogout }}>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50">
        <Sidebar user={user} isAdmin={isAdmin} />

        <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
          <Header onLogout={handleLogout} />

          <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {isRestrictedAdminRoute ? (
              <div className="max-w-xl mx-auto mt-16 p-8 rounded-2xl border border-slate-200 bg-white text-center space-y-3 shadow-xs">
                <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="text-base font-black text-slate-900">Administrator Access Only</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your account (<strong>{user.email}</strong>) has standard researcher permissions. You can run and modify all loaded grid models in your workspace, while Administrators manage model uploads and account approvals.
                </p>
                <button
                  onClick={() => router.push('/stability')}
                  className="mt-2 px-4 py-2 rounded-lg bg-[#500b50] text-white text-xs font-bold"
                >
                  Go to Grid Stability Studio
                </button>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AuthContext.Provider>
  );
};
