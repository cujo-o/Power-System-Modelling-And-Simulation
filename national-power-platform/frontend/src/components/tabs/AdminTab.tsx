'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAllPlatformAccessRequests,
  persistPlatformAccessRequest,
  isConfiguredAdminRole,
} from '../modals/AuthModal';
import {
  Check,
  X,
  UserCheck,
  RefreshCw,
  Clock,
} from 'lucide-react';

interface AccessRequestItem {
  id: string;
  full_name: string;
  email: string;
  institution: string;
  reason: string;
  password?: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface TeamMember {
  name: string;
  title: string;
  photo: string;
}

// 1 - 2 - 3 Triangle Hierarchy
const TRIANGLE_ROW_1: TeamMember[] = [
 
  {
    name: 'Engr. Dr. A. S. Ahmed',
    title: 'Principal Investigator',
    photo: '/team/sadiq.jpg',
  }
];

const TRIANGLE_ROW_2: TeamMember[] = [
   {
    name: 'Engr. Dr. M. Buhari',
    title: 'Senior Researcher',
    photo: '/team/buhari.png',
  },
  {
    name: 'Engr. Dr. J. G. Ambafi',
    title: 'Senior Researcher',
    photo: '/team/ambafi.jpg',
  },
];

const TRIANGLE_ROW_3: TeamMember[] = [
  {
    name: 'Engr. Prof. I. Okoro',
    title: 'Senior Researcher',
    photo: '/team/okoro.jpg',
  },
  {
    name: 'Engr. Prof. S. S. Adamu',
    title: 'Senior Researcher',
    photo: '/team/adamu.jpg',
  },
  {
    name: 'Engr. Hameedat',
    title: 'Research Mentee',
    photo: '/team/hameedat.jpeg',
  },
];

// Large Rectangular Portrait Card (Not Circular)
const MemberCard: React.FC<{ member: TeamMember }> = ({ member }) => (
  <div className="w-64 sm:w-72 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
    <div className="h-64 w-full bg-slate-100 overflow-hidden">
      <img
        src={member.photo}
        alt={member.name}
        className="h-full w-full object-cover object-top"
      />
    </div>
    <div className="p-4 text-center">
      <h4 className="font-bold text-sm text-slate-900 leading-snug">{member.name}</h4>
      <p className="text-xs text-slate-500 mt-1">{member.title}</p>
    </div>
  </div>
);

export const AdminTab: React.FC = () => {
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('ml4ps_user') || localStorage.getItem('nesi_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          setIsAdminUser(
            isConfiguredAdminRole(
              parsed.role,
              parsed.isAdmin || parsed.is_admin,
              parsed.email
            )
          );
        }
      } catch {}
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAllPlatformAccessRequests();
      const normalized: AccessRequestItem[] = list.map((r: any) => ({
        id: String(r.id || 'req-' + Math.random().toString(36).slice(2, 7)),
        full_name: r.full_name || r.name || 'User',
        email: r.email || '',
        institution: r.institution || 'Independent',
        reason: r.reason || '',
        password: r.password || '',
        role: isConfiguredAdminRole(r.role, r.is_admin, r.email) ? 'admin' : 'user',
        status: r.status || 'pending',
        created_at: r.created_at || new Date().toISOString(),
      }));
      setRequests(normalized);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const updateRequestState = async (
    email: string,
    updates: Partial<AccessRequestItem>
  ) => {
    const target = requests.find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (!target) return;

    const updatedRecord = { ...target, ...updates };
    const updatedList = requests.map((r) =>
      r.email.toLowerCase() === email.toLowerCase() ? updatedRecord : r
    );
    setRequests(updatedList);
    await persistPlatformAccessRequest(updatedRecord, updatedList);
  };

  const filtered = requests.filter((r) => (filter === 'all' ? true : r.status === filter));
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="max-w-6xl mx-auto space-y-10 py-2 text-slate-800">
      {/* ===================================================================== */}
      {/* 1. WORKFORCE TRIANGLE (Large Rectangular Photos in 1 - 2 - 3 Pyramid) */}
      {/* ===================================================================== */}
      <section className="space-y-6">
        

        <div className="flex flex-col items-center space-y-8 py-2">
          {/* Top Apex (1) */}
          <div className="flex justify-center">
            {TRIANGLE_ROW_1.map((m) => (
              <MemberCard key={m.name} member={m} />
            ))}
          </div>

          {/* Middle Row (2) */}
          <div className="flex flex-wrap justify-center gap-8">
            {TRIANGLE_ROW_2.map((m) => (
              <MemberCard key={m.name} member={m} />
            ))}
          </div>

          {/* Base Row (3) */}
          <div className="flex flex-wrap justify-center gap-8">
            {TRIANGLE_ROW_3.map((m) => (
              <MemberCard key={m.name} member={m} />
            ))}
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. ACCOUNT ACCEPTANCE & REJECTION (Admin Management)                  */}
      {/* ===================================================================== */}
      {isAdminUser && (
        <section className="space-y-4 pt-6 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Account Requests (Acceptance &amp; Rejection)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Accept or reject user signup requests and manage administrator roles.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold gap-1">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`px-3 py-1 rounded-lg capitalize transition ${
                      filter === tab
                        ? 'bg-[#500b50] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab}
                    {tab === 'pending' && pendingCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px]">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchRequests}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No account requests in this view.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Name &amp; Email</th>
                      <th className="py-2.5 px-4">Institution</th>
                      <th className="py-2.5 px-4">Reason</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{item.full_name}</p>
                          <p className="text-[11px] font-mono text-slate-500">{item.email}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{item.institution}</td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs">{item.reason}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              item.role === 'admin'
                                ? 'bg-purple-100 text-[#500b50]'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.role}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {item.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                              <Clock className="h-3 w-3" />
                              <span>Pending</span>
                            </span>
                          )}
                          {item.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              <Check className="h-3 w-3" />
                              <span>Accepted</span>
                            </span>
                          )}
                          {item.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                              <X className="h-3 w-3" />
                              <span>Rejected</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {item.status !== 'approved' && (
                            <button
                              onClick={() =>
                                updateRequestState(item.email, { status: 'approved' })
                              }
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                            >
                              Accept
                            </button>
                          )}
                          {item.status !== 'rejected' && (
                            <button
                              onClick={() =>
                                updateRequestState(item.email, { status: 'rejected' })
                              }
                              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px]"
                            >
                              Reject
                            </button>
                          )}
                          {item.status === 'approved' && (
                            <button
                              onClick={() =>
                                updateRequestState(item.email, {
                                  role: item.role === 'admin' ? 'user' : 'admin',
                                })
                              }
                              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-[11px] inline-flex items-center gap-1"
                            >
                              <UserCheck className="h-3 w-3 text-[#500b50]" />
                              <span>
                                {item.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                              </span>
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
        </section>
      )}
    </div>
  );
};