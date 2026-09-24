'use client';

import React, { useState } from 'react';
import { X, Lock, Mail, AlertTriangle, User, Building, BookOpen, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { UserAccount } from '@/types/grid';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserAccount) => void;
  apiBaseUrl: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  apiBaseUrl,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('operator@futminna.edu.ng');
  const [loginPassword, setLoginPassword] = useState('ML4PS-ADMIN');

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regInstitution, setRegInstitution] = useState('FUT Minna');
  const [regDepartment, setRegDepartment] = useState('Electrical & Electronics Engineering');
  const [regReason, setRegReason] = useState('Transient Stability & Dynamic Grid Research');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Sign-in failed');
      }

      if (data.user) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('ml4ps_user', JSON.stringify(data.user));
        }
        onSuccess(data.user);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to log in');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          institution: regInstitution,
          department: regDepartment,
          reason: regReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      setSuccessMsg(data.message);
      // Switch back to login after short delay
      setTimeout(() => {
        setLoginEmail(regEmail);
        setTab('login');
      }, 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to submit registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#500b50] text-white flex items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Taskforce Access Gateway</h3>
              <p className="text-xs text-slate-500">Machine Learning for Power Systems (ML4PS)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Toggle: Sign In vs Register */}
        <div className="flex rounded-xl border border-slate-200 p-1 bg-slate-50 text-xs">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 rounded-lg font-bold transition ${
              tab === 'login' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In with Credentials
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 rounded-lg font-bold transition ${
              tab === 'register' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Request Access / Register
          </button>
        </div>

        {/* Alert Messages */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-rose-300 bg-rose-50 flex items-start gap-2.5 text-xs text-rose-800 leading-relaxed">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50 flex items-start gap-2.5 text-xs text-emerald-800 leading-relaxed">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: LOGIN FORM */}
        {tab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                Operator Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="operator@futminna.edu.ng"
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                Access Token / Temporary Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                />
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Enter your issued temporary password (e.g. <strong>ML4PS-XXXX</strong>)
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#500b50] text-white font-bold text-sm hover:bg-[#680f68] transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* TAB 2: REGISTRATION FORM */}
        {tab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3 text-xs">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Engr. Saliu Adamu"
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Official Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="saliu@tcn.org.ng or researcher@futminna.edu.ng"
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#500b50]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Institution
                </label>
                <div className="relative">
                  <Building className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={regInstitution}
                    onChange={(e) => setRegInstitution(e.target.value)}
                    placeholder="FUT Minna, TCN, NERC..."
                    className="w-full border border-slate-300 rounded-xl pl-8 pr-2 py-2 text-xs text-slate-900 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  placeholder="Electrical Engineering"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Research Purpose / Project Title
              </label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={regReason}
                  onChange={(e) => setRegReason(e.target.value)}
                  placeholder="e.g. Under-frequency load shedding optimization"
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-1 rounded-xl bg-[#500b50] text-white font-bold text-sm hover:bg-[#680f68] transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Submitting Request...</span>
                </>
              ) : (
                <>
                  <span>Submit Application for Approval</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};