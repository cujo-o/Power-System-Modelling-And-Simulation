'use client';
import React, { useState } from 'react';
import { UserAccount } from '@/types/grid';
import { Check, X, ShieldCheck, Key, Copy, CheckCheck, Clock, UserCheck } from 'lucide-react';

interface AdminTabProps {
  users: UserAccount[];
  onApprove: (id: string) => Promise<{ generated_password?: string }>;
  onReject: (id: string) => Promise<void>;
}

export const AdminTab: React.FC<AdminTabProps> = ({ users, onApprove, onReject }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [latestApproval, setLatestApproval] = useState<{ name: string; password: string } | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleApproveClick = async (u: UserAccount) => {
    setApprovingId(u.id);
    try {
      const res = await onApprove(u.id);
      if (res?.generated_password) {
        setLatestApproval({ name: u.name, password: res.generated_password });
      }
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg font-bold text-[#500b50]">Taskforce Administrator & Access Requests</h2>
          <p className="text-xs text-slate-500">
            Review applicant background, research justifications, and grant secure simulation credentials.
          </p>
        </div>
        <span className="px-3 py-1 rounded bg-[#500b50] text-white text-xs font-bold shadow-xs">
          Admin Privilege: Active
        </span>
      </div>

      {/* Success Notification on password generation */}
      {latestApproval && (
        <div className="p-4 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-emerald-700 shrink-0" />
            <div>
              <span className="text-xs font-bold block">
                Access Granted for {latestApproval.name}!
              </span>
              <span className="text-[11px] text-emerald-800">
                Temporary Password: <strong className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">{latestApproval.password}</strong> (Applicant can now sign in).
              </span>
            </div>
          </div>
          <button
            onClick={() => handleCopy('latest', latestApproval.password)}
            className="px-2.5 py-1 rounded bg-white border border-emerald-300 text-xs font-bold text-emerald-800 hover:bg-emerald-100 flex items-center gap-1"
          >
            {copiedId === 'latest' ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedId === 'latest' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}

      {/* Access Requests Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
          <span>Registered Access Applications ({users.length})</span>
          <span className="text-[11px] font-normal text-white/80">
            Pending: {users.filter((u) => u.status === 'PENDING').length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-semibold">
              <tr>
                <th className="p-3">Applicant & Affiliation</th>
                <th className="p-3">Department</th>
                <th className="p-3">Research Justification & Referee</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned Password</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition">
                  <td className="p-3">
                    <span className="font-bold text-slate-900 block text-sm">{u.name}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{u.email}</span>
                    <span className="text-[10px] text-[#500b50] font-semibold block mt-0.5">
                      {u.institution}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600 font-medium">
                    {u.department || 'Electrical Engineering'}
                  </td>
                  <td className="p-3 max-w-[240px]">
                    <p className="text-[11px] text-slate-800 line-clamp-2 italic" title={u.reason}>
                      "{u.reason || 'General grid analysis'}"
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Ref: <strong>{u.referee || 'None'}</strong></span>
                      <span>•</span>
                      <span className="text-purple-700 font-mono">{u.research_tags}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        u.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : u.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {u.status === 'APPROVED' && <Check className="h-3 w-3" />}
                      {u.status === 'PENDING' && <Clock className="h-3 w-3" />}
                      {u.status === 'REJECTED' && <X className="h-3 w-3" />}
                      <span>{u.status}</span>
                    </span>
                  </td>
                  <td className="p-3">
                    {u.temp_password || u.password ? (
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="bg-slate-100 text-slate-900 px-2 py-0.5 rounded border border-slate-300 font-bold text-[11px]">
                          {u.temp_password || u.password}
                        </span>
                        <button
                          onClick={() => handleCopy(u.id, (u.temp_password || u.password)!)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-500"
                          title="Copy Password"
                        >
                          {copiedId === u.id ? <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">Not assigned</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {u.status === 'PENDING' ? (
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleApproveClick(u)}
                          disabled={approvingId === u.id}
                          className="flex items-center gap-1 bg-[#15803d] text-white px-2.5 py-1 rounded text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => onReject(u.id)}
                          className="flex items-center gap-1 bg-rose-600 text-white px-2.5 py-1 rounded text-xs font-bold hover:bg-rose-700 transition"
                        >
                          <X className="h-3 w-3" />
                          <span>Reject</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};