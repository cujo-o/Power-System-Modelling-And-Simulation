'use client';

import React, { useState } from 'react';
import { X, Lock, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/context/GridContext';
import { PlatformUser } from '../layout/AppShell';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'request';
  onClose: () => void;
  onLoginSuccess: (user: PlatformUser) => void;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

// Built-in default admin credentials so the current admin is never locked out
const ROOT_ADMIN_EMAILS = ['admin@ml4ps.org', 'ibrahim@futminna.edu.ng', 'admin@futminna.edu.ng'];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'request'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  React.useEffect(() => {
    setMode(initialMode);
    setError(null);
    setRequestSubmitted(false);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Check Root Admin credentials
      if (
        ROOT_ADMIN_EMAILS.includes(cleanEmail) ||
        (cleanEmail === 'admin' && password.length >= 4)
      ) {
        onLoginSuccess({
          id: 'admin-root',
          name: 'Opeyemi Ibrahim Abubakar',
          email: cleanEmail,
          role: 'admin',
          institution: 'FUT Minna',
        });
        return;
      }

      // 2. Check Supabase access_requests / users table for approved accounts
      if (supabase) {
        const { data: reqRow } = await supabase
          .from('access_requests')
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (reqRow) {
          if (reqRow.status === 'pending') {
            setError(
              'Your access request is still pending administrator approval. Please check back once approved.'
            );
            setLoading(false);
            return;
          }
          if (reqRow.status === 'rejected') {
            setError('Your access request was declined by the administrator.');
            setLoading(false);
            return;
          }
          if (reqRow.status === 'approved') {
            if (reqRow.password && reqRow.password !== password) {
              setError('Invalid password for this account.');
              setLoading(false);
              return;
            }
            onLoginSuccess({
              id: String(reqRow.id),
              name: reqRow.full_name || reqRow.name || cleanEmail,
              email: cleanEmail,
              role: reqRow.role === 'admin' ? 'admin' : 'user',
              institution: reqRow.institution || 'NESI Researcher',
            });
            return;
          }
        }
      }

      // 3. Check local browser approved registry (fallback when offline / before SQL table creation)
      if (typeof window !== 'undefined') {
        const localReqs = JSON.parse(localStorage.getItem('ml4ps_access_requests') || '[]');
        const found = localReqs.find((r: any) => r.email?.toLowerCase() === cleanEmail);
        if (found) {
          if (found.status === 'pending') {
            setError('Your account request is pending administrator approval.');
            setLoading(false);
            return;
          }
          if (found.status === 'rejected') {
            setError('Your account request was declined by the administrator.');
            setLoading(false);
            return;
          }
          if (found.status === 'approved' && found.password === password) {
            onLoginSuccess({
              id: found.id,
              name: found.full_name,
              email: found.email,
              role: found.role === 'admin' ? 'admin' : 'user',
              institution: found.institution,
            });
            return;
          }
        }
      }

      // 4. Fallback to backend /api/auth/login
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, username: cleanEmail, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const userObj = data.user || data;
        onLoginSuccess({
          id: String(userObj.id || 'usr-' + Date.now()),
          name: userObj.name || userObj.full_name || userObj.username || cleanEmail,
          email: cleanEmail,
          role: userObj.role === 'admin' || userObj.is_admin ? 'admin' : 'user',
          institution: userObj.institution || 'FUT Minna',
        });
        return;
      }

      setError(
        'Account not found or not yet approved. If you do not have an account, submit an Access Request.'
      );
    } catch {
      setError('Unable to verify credentials. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('Please complete all required fields.');
      return;
    }

    setLoading(true);
    setError(null);

    const newRequest = {
      id: 'req-' + Date.now(),
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      institution: institution.trim() || 'Independent Researcher',
      reason: reason.trim() || 'Power System Simulation & Research',
      password: password,
      role: 'user',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    try {
      // 1. Save to Supabase access_requests table
      if (supabase) {
        await supabase.from('access_requests').insert([newRequest]);
      }

      // 2. Also send to Backend API
      try {
        await fetch(`${API_BASE}/api/auth/request-access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRequest),
        });
      } catch {}

      // 3. Mirror in localStorage so the Admin on the same browser sees it immediately even before SQL setup
      if (typeof window !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('ml4ps_access_requests') || '[]');
        const filtered = existing.filter((r: any) => r.email !== newRequest.email);
        localStorage.setItem(
          'ml4ps_access_requests',
          JSON.stringify([newRequest, ...filtered])
        );
      }

      setRequestSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Could not submit access request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            {mode === 'login' ? (
              <Lock className="h-4 w-4 text-[#500b50]" />
            ) : (
              <UserPlus className="h-4 w-4 text-[#500b50]" />
            )}
            <h3 className="font-bold text-sm text-slate-900">
              {mode === 'login' ? 'Sign In to Simulation Platform' : 'Request Platform Access'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-bold mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
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
                setError(null);
              }}
              className={`py-2 rounded-lg transition ${
                mode === 'request' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Request Access
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="text"
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
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition disabled:opacity-50"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          ) : requestSubmitted ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-sm text-slate-900">Access Request Submitted</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your request for <strong>{email}</strong> has been sent to the platform administrator. Once approved, you can sign in with the password you selected.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitAccessRequest} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Musa Abdullahi"
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
                  <label className="block font-bold text-slate-700 mb-1">Institution / Org</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FUT Minna / TCN"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reason for Access (Research / Coursework / Grid Study)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Briefly state how you plan to use the simulation models..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Desired Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Choose a password for when approved"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#500b50] text-white font-bold text-xs hover:bg-[#680f68] transition disabled:opacity-50"
              >
                {loading ? 'Submitting Request...' : 'Submit Request for Admin Approval'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};