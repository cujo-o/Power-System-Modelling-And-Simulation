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

const SYSTEM_REQ_ROW_NAME = '__ml4ps_access_requests__';

// Configured privately in Vercel Environment Variables (never hardcoded in source)
const ENV_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ENV_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';

export function isConfiguredAdminRole(role?: string, isAdminFlag?: boolean, email?: string): boolean {
  if (isAdminFlag) return true;
  if (email && ENV_ADMIN_EMAILS.includes(email.trim().toLowerCase())) return true;
  const normalized = String(role || '').trim().toLowerCase();
  return ['admin', 'administrator', 'superuser', 'operator'].includes(normalized);
}

/**
 * Reads all access requests from Supabase (`access_requests` table OR `grid_models` fallback row)
 * and backend so requests work across all devices.
 */
export async function fetchAllPlatformAccessRequests(): Promise<any[]> {
  const mapByEmail = new Map<string, any>();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        data.forEach((r) => {
          if (r?.email) mapByEmail.set(r.email.toLowerCase(), r);
        });
      }
    } catch {}

    try {
      const { data: sysRow } = await supabase
        .from('grid_models')
        .select('*')
        .eq('name', SYSTEM_REQ_ROW_NAME)
        .maybeSingle();

      const rawPayload = sysRow?.network_payload || sysRow?.payload || sysRow?.domain;
      if (rawPayload) {
        const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
        if (Array.isArray(parsed)) {
          parsed.forEach((r: any) => {
            if (r?.email && !mapByEmail.has(r.email.toLowerCase())) {
              mapByEmail.set(r.email.toLowerCase(), r);
            }
          });
        }
      }
    } catch {}
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/requests`);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        list.forEach((r: any) => {
          if (r?.email && !mapByEmail.has(r.email.toLowerCase())) {
            mapByEmail.set(r.email.toLowerCase(), r);
          }
        });
      }
    }
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      const local = JSON.parse(localStorage.getItem('ml4ps_access_requests') || '[]');
      if (Array.isArray(local)) {
        local.forEach((r: any) => {
          if (r?.email && !mapByEmail.has(r.email.toLowerCase())) {
            mapByEmail.set(r.email.toLowerCase(), r);
          }
        });
      }
    } catch {}
  }

  return Array.from(mapByEmail.values());
}

/**
 * Saves the updated access request list across Supabase, Backend, and localStorage.
 */
export async function persistPlatformAccessRequest(
  record: any,
  allRecords?: any[]
): Promise<void> {
  const existing = allRecords || (await fetchAllPlatformAccessRequests());
  const merged = [
    record,
    ...existing.filter((r) => r.email?.toLowerCase() !== record.email?.toLowerCase()),
  ];

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('ml4ps_access_requests', JSON.stringify(merged));
    } catch {}
  }

  if (supabase) {
    try {
      await supabase.from('access_requests').upsert([record], { onConflict: 'email' });
    } catch {}

    try {
      const { data: existingSys } = await supabase
        .from('grid_models')
        .select('id')
        .eq('name', SYSTEM_REQ_ROW_NAME)
        .maybeSingle();

      const serialized = JSON.stringify(merged);
      if (existingSys?.id) {
        await supabase
          .from('grid_models')
          .update({ network_payload: serialized })
          .eq('id', existingSys.id);
      } else {
        await supabase.from('grid_models').insert([
          {
            id: SYSTEM_REQ_ROW_NAME,
            name: SYSTEM_REQ_ROW_NAME,
            voltage_level: 'SYS',
            platform: 'SYSTEM',
            buses: 0,
            branches: 0,
            is_active: false,
            network_payload: serialized,
          },
        ]);
      }
    } catch {}
  }

  try {
    await fetch(`${API_BASE}/api/auth/request-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
  } catch {}
}

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
      // 1. Check Environment-Configured Admin (if set in Vercel Environment Variables)
      if (
        ENV_ADMIN_EMAILS.includes(cleanEmail) &&
        (!ENV_ADMIN_PASSWORD || password === ENV_ADMIN_PASSWORD)
      ) {
        onLoginSuccess({
          id: 'env-admin',
          name: cleanEmail.split('@')[0],
          email: cleanEmail,
          role: 'admin',
        });
        return;
      }

      // 2. Check Supabase Auth (if project uses Supabase Auth users)
      if (supabase) {
        try {
          const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (!authErr && authData?.user) {
            const meta = authData.user.user_metadata || {};
            const isAdm = isConfiguredAdminRole(meta.role, meta.is_admin, cleanEmail);
            onLoginSuccess({
              id: authData.user.id,
              name: meta.full_name || meta.name || cleanEmail.split('@')[0],
              email: cleanEmail,
              role: isAdm ? 'admin' : 'user',
              institution: meta.institution || '',
            });
            return;
          }
        } catch {}
      }

      // 3. Check unified cross-device access_requests registry
      const allReqs = await fetchAllPlatformAccessRequests();
      const hasAnyAdmin = allReqs.some(
        (r: any) => r.status === 'approved' && isConfiguredAdminRole(r.role, r.is_admin, r.email)
      );
      const found = allReqs.find((r: any) => r.email?.toLowerCase() === cleanEmail);

      if (found) {
        if (found.status === 'pending') {
          setError(
            'Your access request is still pending administrator approval. Please check back once approved.'
          );
          setLoading(false);
          return;
        }
        if (found.status === 'rejected') {
          setError('Your access request was declined by the administrator.');
          setLoading(false);
          return;
        }
        if (found.status === 'approved') {
          if (found.password && found.password !== password) {
            setError('Invalid password for this account.');
            setLoading(false);
            return;
          }
          const roleResolved =
            !hasAnyAdmin || isConfiguredAdminRole(found.role, found.is_admin, cleanEmail)
              ? 'admin'
              : 'user';

          onLoginSuccess({
            id: String(found.id || 'usr-' + Date.now()),
            name: found.full_name || found.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: roleResolved,
            institution: found.institution || '',
          });
          return;
        }
      }

      // 4. Check Backend /api/auth/login
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, username: cleanEmail, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const userObj = data.user || data;
        const isAdm =
          !hasAnyAdmin ||
          isConfiguredAdminRole(userObj.role, userObj.is_admin || userObj.isAdmin, cleanEmail);

        onLoginSuccess({
          id: String(userObj.id || 'usr-' + Date.now()),
          name: userObj.name || userObj.full_name || userObj.username || cleanEmail.split('@')[0],
          email: cleanEmail,
          role: isAdm ? 'admin' : 'user',
          institution: userObj.institution || '',
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

    try {
      const existingReqs = await fetchAllPlatformAccessRequests();
      const hasApprovedAdmin = existingReqs.some(
        (r: any) => r.status === 'approved' && isConfiguredAdminRole(r.role, r.is_admin, r.email)
      );

      // Standard open-source bootstrap: if no admin exists in the database yet,
      // the very first account registered becomes the initial administrator.
      const isFirstBootstrapAdmin = !hasApprovedAdmin && existingReqs.length === 0;

      const newRequest = {
        id: 'req-' + Date.now(),
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        institution: institution.trim() || 'Researcher',
        reason: reason.trim() || 'Power System Simulation & Research',
        password: password,
        role: isFirstBootstrapAdmin ? 'admin' : 'user',
        status: isFirstBootstrapAdmin ? 'approved' : 'pending',
        created_at: new Date().toISOString(),
      };

      await persistPlatformAccessRequest(newRequest, existingReqs);

      if (isFirstBootstrapAdmin) {
        onLoginSuccess({
          id: newRequest.id,
          name: newRequest.full_name,
          email: newRequest.email,
          role: 'admin',
          institution: newRequest.institution,
        });
        return;
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
                Your request for <strong>{email}</strong> has been transmitted to the platform administrators. Once approved, you can sign in with the password you selected.
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
                  <label className="block font-bold text-slate-700 mb-1">Institution / Org</label>
                  <input
                    type="text"
                    required
                    placeholder="Institution"
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