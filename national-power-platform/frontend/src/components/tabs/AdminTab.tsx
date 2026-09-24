'use client';

import React, { useState, useEffect } from 'react';
import {
  Award,
  BookOpen,
  Building,
  Layers,
  Zap,
  Globe,
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  ShieldCheck,
  UserCheck,
  RefreshCw,
} from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  salutation: string;
  role: string;
  designation: string;
  department: string;
  institution: string;
  specialization: string[];
  imageSrc: string;
  badgeType: 'Principal Investigator' | 'Co-Investigator' | 'Senior Researcher' | 'Project Lead';
}

const TASKFORCE_COUNCIL: TeamMember[] = [
  {
    id: 'lead-pi',
    name: 'Prof. Lead Principal Investigator',
    salutation: 'FUT Minna Research Council',
    role: 'Lead Principal Investigator & Project Patron',
    designation: 'Professor of Electrical & Power Systems Engineering',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    specialization: ['Power System Dynamics', 'Grid Governance', 'NERC Grid Code Standards'],
    imageSrc: '/team/member_lead_prof.jpg',
    badgeType: 'Principal Investigator',
  },
  {
    id: 'co-pi-1',
    name: 'Dr. / Engr. Project Co-Investigator',
    salutation: 'Lead System Architect',
    role: 'Co-Principal Investigator (Grid Stability)',
    designation: 'Associate Professor / Senior Research Fellow',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    specialization: ['AC Optimal Power Flow', 'Transmission Planning', 'Voltage Stability'],
    imageSrc: '/team/member_pi_engr.jpg',
    badgeType: 'Co-Investigator',
  },
  {
    id: 'co-pi-2',
    name: 'Dr. Lead Dynamic Researcher',
    salutation: 'Control & Stability Specialist',
    role: 'Lead Research Fellow (Transient Dynamics)',
    designation: 'Senior Lecturer / Control Systems Analyst',
    department: 'School of Infrastructure, Process Engineering & Technology',
    institution: 'Federal University of Technology, Minna',
    specialization: ['Under-Frequency Load Shedding (UFLS)', 'PSS Damping', 'RoCoF Tracking'],
    imageSrc: '/team/member_dr_amina.jpg',
    badgeType: 'Co-Investigator',
  },
  {
    id: 'industry-liaison',
    name: 'Engr. Grid Operations Advisor',
    salutation: 'Industry Technical Advisor',
    role: 'Principal Operations Specialist & NISO Liaison',
    designation: 'Senior Power Systems Operations Consultant',
    department: 'National Control Centre (NCC) Liaison Division',
    institution: 'NESI Transmission & System Operations Partner',
    specialization: ['330kV Bulk Operations', 'Contingency Analysis', 'SCADA Integration'],
    imageSrc: '/team/member_engr_saliu.jpg',
    badgeType: 'Project Lead',
  },
  {
    id: 'researcher-lead',
    name: 'Dr. Systems Modeling Analyst',
    salutation: 'Mathematical & AI Modeler',
    role: 'Senior Research Fellow (Machine Learning)',
    designation: 'Research Fellow in Computational Power Engineering',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    specialization: ['Machine Learning for Power Flow', 'Fast Decoupled Algorithms', 'Data Modeling'],
    imageSrc: '/team/member_researcher_lead.jpg',
    badgeType: 'Senior Researcher',
  },
  {
    id: 'hardware-lead',
    name: 'Engr. Research Fellow & Simulation Architect',
    salutation: 'Substation & Network Engineer',
    role: 'Senior Simulation & Architecture Fellow',
    designation: 'Power Systems Simulation Specialist',
    department: 'Machine Learning 4 Power Systems (ML4PS) Lab',
    institution: 'Federal University of Technology, Minna',
    specialization: ['Single-Line CAD Synthesis', 'Relay Coordination', 'Grid Expansion'],
    imageSrc: '/team/member_dr_bello.jpg',
    badgeType: 'Senior Researcher',
  },
];

interface UserRecord {
  id: string;
  name: string;
  email: string;
  institution: string;
  department: string;
  reason: string;
  role: string;
  is_approved: boolean;
  status: 'PENDING' | 'APPROVED';
  temp_password?: string;
  created_at?: string;
}

interface Props {
  apiBaseUrl: string;
}

export const AdminTab: React.FC<Props> = ({ apiBaseUrl }) => {
  const [subTab, setSubTab] = useState<'council' | 'approvals'>('council');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [issuedTempPass, setIssuedTempPass] = useState<{ name: string; pass: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch user directory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'approvals') {
      fetchUsers();
    }
  }, [subTab]);

  const handleApprove = async (userId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/approve/${userId}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setIssuedTempPass({ name: data.user_name, pass: data.temp_password });
        fetchUsers();
      } else {
        alert(data.detail || 'Approval failed');
      }
    } catch (err) {
      alert('Network error approving user');
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm('Reject and delete this registration request?')) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/reject/${userId}`, { method: 'POST' });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      alert('Network error rejecting user');
    }
  };

  const pendingUsers = users.filter((u) => !u.is_approved);
  const approvedUsers = users.filter((u) => u.is_approved);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Navigator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Organization, Governance & Security
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            ML4PS research council leadership and operator access control gateway.
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-xs">
          <button
            onClick={() => setSubTab('council')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
              subTab === 'council' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Research Council</span>
          </button>

          <button
            onClick={() => setSubTab('approvals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition relative ${
              subTab === 'approvals' ? 'bg-[#500b50] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Operator Approvals</span>
            {pendingUsers.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold animate-pulse">
                {pendingUsers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Issued Temp Password Modal Notification */}
      {issuedTempPass && (
        <div className="p-5 rounded-2xl border border-emerald-300 bg-emerald-50 shadow-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="font-bold text-emerald-950 text-sm">
                Account Approved for {issuedTempPass.name}
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                Temporary access password issued. Share this credential with the operator:
              </p>
              <div className="mt-2 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-emerald-300 font-mono text-base font-black text-[#500b50]">
                <span>{issuedTempPass.pass}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(issuedTempPass.pass);
                    alert('Temporary password copied to clipboard!');
                  }}
                  className="p-1 hover:text-slate-900 text-slate-500"
                  title="Copy password"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIssuedTempPass(null)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-800 text-white text-xs font-bold hover:bg-emerald-900 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW 1: RESEARCH COUNCIL LEADERSHIP DIRECTORY */}
      {subTab === 'council' && (
        <div className="space-y-6">
          {/* Institution Banner */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl bg-white p-2.5 border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                <img
                  src="/ml4ps-logo.png"
                  alt="ML4PS Crest"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>

              <div className="text-center md:text-left space-y-1.5 flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#f5eff6] text-[#500b50] border border-[#500b50]/20">
                  <Award className="h-3.5 w-3.5" />
                  <span>National Power System & Development Taskforce</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Machine Learning 4 Power Systems (ML4PS) Research Group
                </h1>

                <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-3xl leading-relaxed">
                  An institutional research consortium at the Federal University of Technology, Minna (FUT Minna), dedicated to indigenous power flow modeling, machine learning-driven dynamic transient stability, and high-fidelity operational simulation for the Nigerian Electricity Supply Industry (NESI).
                </p>

                <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-slate-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Building className="h-3.5 w-3.5 text-[#500b50]" />
                    <span>SEET / EEE Department, FUT Minna</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-emerald-600" />
                    <span>330kV Bulk & 132kV Sub-Transmission</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-purple-700" />
                    <span>Minna, Niger State, Nigeria</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Directory Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {TASKFORCE_COUNCIL.map((member) => (
              <div
                key={member.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group hover:border-[#500b50]/40"
              >
                <div>
                  <div className="flex items-start gap-4">
                    <div className="relative h-20 w-20 sm:h-22 sm:w-22 rounded-xl overflow-hidden border-2 border-slate-100 bg-slate-100 shrink-0 shadow-inner group-hover:border-[#500b50]/30 transition">
                      <img
                        src={member.imageSrc}
                        alt={member.name}
                        className="w-full h-full object-cover object-top"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg -z-10">
                        {member.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1 ${
                          member.badgeType === 'Principal Investigator'
                            ? 'bg-purple-100 text-[#500b50] border border-[#500b50]/20'
                            : member.badgeType === 'Co-Investigator'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {member.badgeType}
                      </span>

                      <h3 className="text-sm font-bold text-slate-900 truncate leading-snug group-hover:text-[#500b50] transition">
                        {member.name}
                      </h3>

                      <p className="text-[11px] text-slate-500 font-medium line-clamp-1">
                        {member.designation}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Appointment
                    </span>
                    <span className="font-semibold text-slate-800 block text-xs">
                      {member.role}
                    </span>
                    <span className="text-slate-500 block text-[11px]">
                      {member.department}, {member.institution}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap gap-1">
                    {member.specialization.map((spec, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-50 text-slate-600 border border-slate-200"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: ACCESS CONTROL & OPERATOR APPROVALS QUEUE */}
      {subTab === 'approvals' && (
        <div className="space-y-6">
          {/* Pending Applications Section */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="bg-amber-600 text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Pending Access Applications ({pendingUsers.length} In Review)</span>
              </div>
              <button
                onClick={fetchUsers}
                className="flex items-center gap-1.5 text-xs text-white/90 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh Queue</span>
              </button>
            </div>

            {pendingUsers.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                <span>No pending access requests. All applications have been processed.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[700px]">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Applicant Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Institution / Dept</th>
                      <th className="py-3 px-4">Research Purpose</th>
                      <th className="py-3 px-4">Submitted</th>
                      <th className="py-3 px-4 text-right">Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {pendingUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                        <td className="py-3 px-4 text-xs">
                          <span className="font-semibold block text-slate-900">{u.institution}</span>
                          <span className="text-slate-500">{u.department}</span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">{u.reason}</td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-400">{u.created_at || 'Recently'}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprove(u.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition shadow-xs flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Approve & Issue Temp PW</span>
                            </button>
                            <button
                              onClick={() => handleReject(u.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 font-bold text-xs transition"
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

          {/* Approved Active Directory */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="bg-[#500b50] text-white px-5 py-3 flex justify-between items-center text-sm font-bold">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span>Authorized Operators & Researchers ({approvedUsers.length} Active)</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Operator Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Institution</th>
                    <th className="py-3 px-4">Access Status</th>
                    <th className="py-3 px-4 text-right">Revoke</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {approvedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-[#500b50]">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">{u.institution}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          Authorized
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {u.id !== 'admin-root' && (
                          <button
                            onClick={() => handleReject(u.id)}
                            className="text-slate-400 hover:text-rose-600 text-xs font-semibold"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};