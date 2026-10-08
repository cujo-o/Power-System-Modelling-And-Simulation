'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Clock,
  RefreshCw,
  Copy,
  CheckCircle2,
  XCircle,
  Search,
  Key,
  Users,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  tag: 'Principal Investigator' | 'Co-Investigator' | 'Project Lead' | 'Senior Researcher';
  department: string;
  institution: string;
  image: string;
  bio?: string;
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
  temp_password?: string;
  created_at?: string;
}

interface AdminTabProps {
  apiBaseUrl?: string;
}

const WORKFORCE_ROSTER: TeamMember[] = [
  {
    id: 'sadiq-lead',
    name: 'Engr. Dr. A. S. Ahmed',
    role: 'Lead Principal Investigator',
    tag: 'Principal Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/sadiq.jpg',
    bio: 'Directing strategic modeling frameworks, core solver design, and institutional validation for the ML4PS national grid simulation platform.',
  },
  {
    id: 'adamu-lead',
    name: 'Engr. Prof. S. S. Adamu',
    role: 'Principal Operations Specialist & NISO Liaison',
    tag: 'Project Lead',
    department: 'NESI Transmission & System Operations (NCC)',
    institution: 'Federal University of Technology, Minna',
    image: '/team/adamu.jpg',
    bio: ' national utility operations liaison, and real-time contingency validation.',
  },
  {
    id: 'buhari-copi',
    name: 'Engr. Dr. M. Buhari',
    role: 'Co-Principal Investigator (Grid Stability)',
    tag: 'Co-Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/buhari.png',
    bio: 'Leading dynamic frequency defense architectures, multi-machine rotor angle stability, and power system stabilizer optimization.',
  },
  {
    id: 'okoro-senior',
    name: 'Engr. Prof. I. Okoro',
    role: 'Senior Research Fellow (Machine Learning)',
    tag: 'Senior Researcher',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/okoro.jpg',
    bio: 'Guiding mathematical formulation of machine learning surrogates for high-dimensional AC optimal power flow.',
  },
  {
    id: 'ambafi-senior',
    name: 'Engr. Dr. J. G. Ambafi',
    role: 'Senior Simulation & Architecture Fellow',
    tag: 'Senior Researcher',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/ambafi.jpg',
    bio: 'Architecting single-line procedural diagram generation, relay coordination schemes, and substation matrix mapping.',
  },
  {
    id: 'hameedat-copi',
    name: 'Engr. Hameedat',
    role: 'Research Mentee & Simulation Analyst',
    tag: 'Co-Investigator',
    department: 'School of Infrastructure, Process Engineering & Technology',
    institution: 'Federal University of Technology, Minna',
    image: '/team/hameedat.jpeg',
    bio: 'Investigating under-frequency load shedding (UFLS) dynamics, statutory compliance tracking, and network expansion sandtables.',
  },
];

const ResilientPortrait: React.FC<{ src: string; alt: string; className?: string }> = ({
  src,
  alt,
  className = '',
}) => {
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
    <div className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}>
      <img
        src={currentSrc}
        alt={alt}
        onError={handleError}
        className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 -z-10 flex items-center justify-center font-mono text-xs font-bold text-slate-400 select-none">
        {initials}
      </div>
    </div>
  );
};

export default function AdminTab({
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com',
}: AdminTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'roster' | 'approvals'>('roster');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [issuedCredential, setIssuedCredential] = useState<{ name: string; email: string; pass: string } | null>(null);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to load user access requests:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'approvals') {
      fetchUsers();
    }
  }, [activeSubTab, apiBaseUrl]);

  const handleApprove = async (userId: string, targetName: string, targetEmail: string) => {
    setActionInProgress(userId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/approve/${userId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setIssuedCredential({
          name: data.user_name || targetName,
          email: targetEmail,
          pass: data.temp_password || 'AuthKey#2026',
        });
        await fetchUsers();
      } else {
        alert(data.detail || 'Authorization failed.');
      }
    } catch {
      alert('Network failure processing operator authorization.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm('Permanently reject and purge this access request?')) return;
    setActionInProgress(userId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/reject/${userId}`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchUsers();
      }
    } catch {
      alert('Network failure rejecting access request.');
    } finally {
      setActionInProgress(null);
    }
  };

  const pendingUsers = useMemo(() => users.filter((u) => !u.is_approved && u.status !== 'REJECTED'), [users]);
  const approvedUsers = useMemo(() => users.filter((u) => u.is_approved || u.status === 'APPROVED'), [users]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return pendingUsers;
    const q = searchQuery.toLowerCase();
    return pendingUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.institution.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q)
    );
  }, [pendingUsers, searchQuery]);

  const topLead = WORKFORCE_ROSTER[0];
  const technicalLeaders = WORKFORCE_ROSTER.slice(1, 3);
  const researchFellows = WORKFORCE_ROSTER.slice(3);

  const getTagBadgeClass = (tag: TeamMember['tag']) => {
    switch (tag) {
      case 'Principal Investigator':
        return 'bg-purple-50 dark:bg-purple-950/40 text-[#500b50] dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'Project Lead':
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Co-Investigator':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      default:
        return 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="w-full space-y-8 max-w-7xl mx-auto py-2">
      {/* Tab Header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Workforce Directorate
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-purple-100 text-[#500b50] dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              ML4PS • FUT Minna
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Institutional research personnel directory and operator access control gateway for the NESI platform.
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-xs shadow-xs w-fit">
          <button
            onClick={() => setActiveSubTab('roster')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
              activeSubTab === 'roster'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Personnel Roster</span>
          </button>

          <button
            onClick={() => setActiveSubTab('approvals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition relative ${
              activeSubTab === 'approvals'
                ? 'bg-[#500b50] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Operator Approvals</span>
            {pendingUsers.length > 0 && (
              <span className="ml-1.5 px-2 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                {pendingUsers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Temporary Password Credential Modal */}
      {issuedCredential && (
        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Access Authorization Granted: {issuedCredential.name}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Institutional credentials provisioned for <span className="font-mono">{issuedCredential.email}</span>. Transmit this secure token to the authorized operator:
              </p>
              <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 font-mono text-sm font-bold text-[#500b50] dark:text-purple-300 mt-1">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                <span>{issuedCredential.pass}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(issuedCredential.pass);
                    alert('Temporary access token copied to clipboard.');
                  }}
                  className="p-1 hover:text-slate-900 dark:hover:text-white text-slate-400 transition ml-2"
                  title="Copy password"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIssuedCredential(null)}
            className="self-end sm:self-center px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 1: WORKFORCE ROSTER DIRECTORY                                      */}
      {/* ========================================================================= */}
      {activeSubTab === 'roster' && (
        <div className="space-y-8">
          {/* Institutional Banner */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">
                  Research Council Directorate
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight mt-0.5">
                  Machine Learning 4 Power Systems (ML4PS) Consortium
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-2">
                  <span>SEET / EEE Department, FUT Minna</span>
                  <span>•</span>
                  <span>Minna, Niger State, Nigeria</span>
                  <span>•</span>
                  <span className="text-[#500b50] dark:text-purple-400 font-semibold">NESI Grid Validation Group</span>
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-slate-500 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl w-fit">
                <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{WORKFORCE_ROSTER.length} Appointed Investigators</span>
              </div>
            </div>
          </div>

          {/* Section 1: Lead Principal Investigator */}
          <div className="space-y-3">
            <div className="border-l-2 border-[#500b50] pl-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Principal Leadership &amp; Governance
              </span>
            </div>

            {topLead && (
              <div className="overflow-hidden border border-purple-200 dark:border-purple-950 bg-white dark:bg-slate-900 shadow-xs hover:border-[#500b50]/40 transition rounded-2xl group">
                <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <ResilientPortrait
                    src={topLead.image}
                    alt={topLead.name}
                    className="w-28 h-36 sm:w-32 sm:h-40 rounded-xl shrink-0 border border-purple-200/80 dark:border-purple-900/50 shadow-xs"
                  />

                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getTagBadgeClass(topLead.tag)}`}>
                        {topLead.tag}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                        {topLead.name}
                      </h4>
                      <p className="text-xs font-bold text-[#500b50] dark:text-purple-400 mt-0.5">
                        {topLead.role}
                      </p>
                    </div>

                    {topLead.bio && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                        {topLead.bio}
                      </p>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <p className="flex items-center gap-2 truncate">
                        <Building2 className="w-3.5 h-3.5 text-[#500b50] shrink-0" />
                        <span>{topLead.department}</span>
                      </p>
                      <p className="flex items-center gap-2 truncate">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{topLead.institution}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Technical Directorate */}
          <div className="space-y-3">
            <div className="border-l-2 border-slate-400 pl-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Technical Directorate &amp; Grid Liaison
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {technicalLeaders.map((member) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-[#500b50]/30 transition group flex flex-col justify-between"
                >
                  <div className="flex items-start gap-4">
                    <ResilientPortrait
                      src={member.image}
                      alt={member.name}
                      className="w-24 h-32 rounded-xl shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs"
                    />

                    <div className="space-y-1.5 min-w-0 flex-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getTagBadgeClass(member.tag)}`}>
                        {member.tag}
                      </span>

                      <div>
                        <h4 className="text-base font-black text-slate-900 dark:text-slate-100 truncate">
                          {member.name}
                        </h4>
                        <p className="text-xs font-semibold text-[#500b50] dark:text-purple-400 truncate mt-0.5">
                          {member.role}
                        </p>
                      </div>

                      {member.bio && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                          {member.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <p className="truncate text-slate-600 dark:text-slate-300">{member.department}</p>
                    <p className="text-[11px] text-slate-400 truncate">{member.institution}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Research Fellows & Simulation Specialists */}
          <div className="space-y-3">
            <div className="border-l-2 border-slate-400 pl-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Research Fellows &amp; Simulation Analysts
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {researchFellows.map((member) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-[#500b50]/30 transition group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3.5 mb-3">
                      <ResilientPortrait
                        src={member.image}
                        alt={member.name}
                        className="w-16 h-20 rounded-lg shrink-0 border border-slate-200 dark:border-slate-700"
                      />

                      <div className="min-w-0 flex-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border mb-1 ${getTagBadgeClass(member.tag)}`}>
                          {member.tag}
                        </span>
                        <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug truncate">
                          {member.name}
                        </h5>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                          {member.role}
                        </p>
                      </div>
                    </div>

                    {member.bio && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {member.bio}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-0.5 text-slate-400">
                    <p className="truncate text-slate-600 dark:text-slate-300">{member.department}</p>
                    <p className="truncate text-[10px]">{member.institution}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: ACCESS CONTROL & OPERATOR APPROVALS QUEUE                        */}
      {/* ========================================================================= */}
      {activeSubTab === 'approvals' && (
        <div className="space-y-6">
          {/* Pending Applications Section */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="bg-[#500b50] text-white px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm font-bold">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Pending Access Applications ({pendingUsers.length} Under Review)</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-white/50" />
                  <input
                    type="text"
                    placeholder="Search applicant name, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-white/10 hover:bg-white/15 focus:bg-white focus:text-slate-900 text-white placeholder-white/50 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none transition w-56 font-normal"
                  />
                </div>

                <button
                  onClick={fetchUsers}
                  disabled={loadingUsers}
                  className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition"
                  title="Refresh queue"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-10 h-10 text-emerald-600 dark:text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-slate-800 dark:text-slate-200">No Pending Requests</p>
                <p className="text-xs text-slate-400 mt-0.5">All incoming research registrations have been processed.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[750px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Applicant</th>
                      <th className="py-3 px-4">Institutional Affiliation</th>
                      <th className="py-3 px-4">Research Scope</th>
                      <th className="py-3 px-4">Submission Date</th>
                      <th className="py-3 px-4 text-right">Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 dark:text-slate-100 block">{u.name}</span>
                          <span className="font-mono text-slate-500 text-[11px] block">{u.email}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-800 dark:text-slate-200 block">{u.institution}</span>
                          <span className="text-slate-400 text-[11px] block">{u.department || 'Electrical Engineering'}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={u.reason}>
                          {u.reason || 'Transmission load flow and stability analysis'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Pending'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprove(u.id, u.name, u.email)}
                              disabled={actionInProgress === u.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Authorize</span>
                            </button>
                            <button
                              onClick={() => handleReject(u.id)}
                              disabled={actionInProgress === u.id}
                              className="px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold transition disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Active Authorized Operators Directory */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="bg-slate-800 text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Authorized Operators &amp; Active Credentials ({approvedUsers.length})</span>
              </div>
            </div>

            {approvedUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No active external operators currently authorized in system.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[700px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Operator</th>
                      <th className="py-3 px-4">Institutional Role</th>
                      <th className="py-3 px-4">Institution</th>
                      <th className="py-3 px-4">Authorization Status</th>
                      <th className="py-3 px-4 text-right">Revocation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {approvedUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                          {u.name}
                          <span className="font-mono text-slate-400 font-normal block text-[11px]">{u.email}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 dark:bg-purple-950/60 text-[#500b50] dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            {u.role || 'RESEARCH_OPERATOR'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{u.institution}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {u.id !== 'admin-root' && (
                            <button
                              onClick={() => handleReject(u.id)}
                              className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold transition"
                            >
                              Revoke Access
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}