'use client';
import React from 'react';
import { UserAccount } from '@/types/grid';
import { Check, X } from 'lucide-react';

interface AdminTabProps {
  users: UserAccount[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({ users, onApprove, onReject }) => (
  <div className="space-y-6 max-w-6xl mx-auto">
    <div className="flex justify-between items-center">
      <div>
        <h2 className="text-lg font-bold text-[#500b50]">Taskforce Administrator & Access Requests</h2>
        <p className="text-xs text-slate-500">Review, verify, and approve system operators and researchers.</p>
      </div>
      <span className="px-3 py-1 rounded bg-[#500b50] text-white text-xs font-bold">
        Admin Privilege: Active
      </span>
    </div>

    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
      <div className="bg-[#500b50] text-white px-4 py-2.5 flex justify-between items-center text-xs font-bold">
        <span>Registered Access Requests</span>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-100 text-slate-600 border-b">
          <tr>
            <th className="p-3">Researcher / Operator</th>
            <th className="p-3">Institution</th>
            <th className="p-3">Designation</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-right">Approval Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="p-3">
                <span className="font-bold text-slate-900 block">{u.name}</span>
                <span className="text-[10px] text-slate-400 font-mono">{u.email}</span>
              </td>
              <td className="p-3">{u.institution}</td>
              <td className="p-3 font-medium">{u.role}</td>
              <td className="p-3">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    u.status === 'APPROVED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : u.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {u.status}
                </span>
              </td>
              <td className="p-3 text-right">
                {u.status === 'PENDING' ? (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onApprove(u.id)}
                      className="flex items-center gap-1 bg-emerald-600 text-white px-2.5 py-1 rounded font-bold hover:bg-emerald-700"
                    >
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button
                      onClick={() => onReject(u.id)}
                      className="flex items-center gap-1 bg-rose-600 text-white px-2.5 py-1 rounded font-bold hover:bg-rose-700"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-400 font-mono text-[11px]">Verified</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);