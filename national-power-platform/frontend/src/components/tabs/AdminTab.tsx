'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  Check,
  X,
  Copy,
  RefreshCw,
  Key,
} from 'lucide-react';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  institution: string;
  image: string;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  institution: string;
  department: string;
  reason: string;
  role: string;
  is_approved: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface AdminTabProps {
  apiBaseUrl?: string;
}

const WORKFORCE_ROSTER: TeamMember[] = [
  {
    id: 'sadiq-lead',
    name: 'Engr. Dr. A. S. Ahmed',
    role: 'Lead Principal Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/sadiq.jpg',
  },
  {
    id: 'adamu-lead',
    name: 'Engr. Prof. S. S. Adamu',
    role: 'Principal Operations Specialist & NISO Liaison',
    department: 'NESI Transmission & System Operations (NCC)',
    institution: 'Federal University of Technology, Minna',
    image: '/team/adamu.jpg',
  },
  {
    id: 'buhari-copi',
    name: 'Engr. Dr. M. Buhari',
    role: 'Co-Principal Investigator (Grid Stability)',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/buhari.png',
  },
  {
    id: 'okoro-senior',
    name: 'Engr. Prof. I. Okoro',
    role: 'Senior Research Fellow (Machine Learning)',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/okoro.jpg',
  },
  {
    id: 'ambafi-senior',
    name: 'Engr. Dr. J. G. Ambafi',
    role: 'Senior Simulation & Architecture Fellow',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/ambafi.jpg',
  },
  {
    id: 'hameedat-copi',
    name: 'Engr. Hameedat',
    role: 'Research Mentee & Simulation Analyst',
    department: 'School of Infrastructure, Process Engineering & Technology',
    institution: 'Federal University of Technology, Minna',
    image: '/team/hameedat.jpeg',
  },
];

const ResilientPortrait: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [currentSrc, setCurrentSrc] = useState(src.trim());
  const [attempt, setAttempt] = useState(0);

  const cleanBase = src.trim().replace(/\.(png|jpe?g|webp)$/i, '');
  const candidateExtensions = ['.jpg', '.png', '.jpeg', '.webp'];

  const handleError = () => {
    if (attempt < candidateExtensions.length) {
      setCurrentSrc(`${cleanBase}${candidateExtensions[attempt]}`);
      setAttempt((prev) => prev + 1);
    }
  };

  const initials = alt
    .replace(/^Engr\.\s*|Prof\.\s*|Dr\.\s*/gi, '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  return (
    <div className="relative w-full aspect-square bg-slate-100 overflow-hidden rounded-xl border border-slate-200">
      <img
        src={currentSrc}
        alt={alt}
        onError={handleError}
        className="w-full h-full object-cover object-top"
      />
      <div className="absolute inset-0 -z-10 flex items-center justify-center font-mono text-sm font-bold text-slate-400">
        {initials}
      </div>
    </div>
  );
};

export default function AdminTab({
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com',
}: AdminTabProps) {
  const [activeView, setActiveView] = useState<'team' | 'requests'>('team');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [issuedCredential, setIssuedCredential] = useState<{ name: string; pass: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch {
      // API error handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [apiBaseUrl]);

  const handleApprove = async (userId: string, targetName: string) => {
    setProcessingId(userId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/approve/${userId}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setIssuedCredential({
          name: data.user_name || targetName,
          pass: data.temp_password || 'AuthKey#2026',
        });
        await fetchUsers();
      } else {
        alert(data.detail || 'Approval failed.');
      }
    } catch {
      alert('Error approving user.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm('Reject this request?')) return;
    setProcessingId(userId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/reject/${userId}`, { method: 'POST' });
      if (res.ok) {
        await fetchUsers();
      }
    } catch {
      alert('Error rejecting user.');
    } finally {
      setProcessingId(null);
    }
  };

  const pendingUsers = users.filter((u) => !u.is_approved && u.status !== 'REJECTED');

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-2">
      {/* Top Header & Navigation Toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Project Workforce</h2>
          <p className="text-xs text-slate-500">Research team directory and access control.</p>
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold shadow-xs">
          <button
            onClick={() => setActiveView('team')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeView === 'team' ? 'bg-[#500b50] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team ({WORKFORCE_ROSTER.length})</span>
          </button>

          <button
            onClick={() => setActiveView('requests')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
              activeView === 'requests' ? 'bg-[#500b50] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin Requests</span>
            {pendingUsers.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                {pendingUsers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Generated Credential Banner */}
      {issuedCredential && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between text-xs text-emerald-950">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Approved <strong>{issuedCredential.name}</strong>. Generated password:
            </span>
            <code className="bg-white px-2 py-0.5 rounded border border-emerald-300 font-mono font-bold text-slate-900">
              {issuedCredential.pass}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(issuedCredential.pass);
                alert('Copied.');
              }}
              className="p-1 hover:text-slate-900 text-slate-500"
              title="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => setIssuedCredential(null)}
            className="text-xs font-semibold text-emerald-800 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW 1: Team Cards */}
      {activeView === 'team' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {WORKFORCE_ROSTER.map((member) => (
            <div
              key={member.id}
              className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3"
            >
              <ResilientPortrait src={member.image} alt={member.name} />
              <div>
                <h3 className="font-bold text-sm text-slate-900 leading-snug">{member.name}</h3>
                <p className="text-xs font-medium text-[#500b50] mt-0.5">{member.role}</p>
                <p className="text-[11px] text-slate-500 mt-1">{member.department}</p>
                <p className="text-[11px] text-slate-400">{member.institution}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 2: Admin Access Requests */}
      {activeView === 'requests' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Pending Approvals ({pendingUsers.length})</span>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-1 font-normal text-slate-500 hover:text-slate-800"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No pending requests.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingUsers.map((u) => (
                <div
                  key={u.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{u.name}</span>
                      <span className="text-slate-400">({u.email})</span>
                    </div>
                    <p className="text-slate-500">
                      {u.institution} {u.department ? `• ${u.department}` : ''}
                    </p>
                    {u.reason && <p className="text-slate-400 italic text-[11px]">&ldquo;{u.reason}&rdquo;</p>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(u.id, u.name)}
                      disabled={processingId === u.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 transition disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept</span>
                    </button>
                    <button
                      onClick={() => handleReject(u.id)}
                      disabled={processingId === u.id}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 font-semibold flex items-center gap-1 transition disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}