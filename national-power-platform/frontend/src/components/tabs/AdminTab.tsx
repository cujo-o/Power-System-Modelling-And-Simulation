"use client";

import React, { useState, useEffect } from "react";
import {
  Award,
  Building,
  Layers,
  Globe,
  CheckCircle2,
  Copy,
  Clock,
  ShieldCheck,
  UserCheck,
  RefreshCw,
  User,
  Shield,
  Briefcase,
} from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  institution: string;
  imageSrc: string;
  badgeType: "Principal Investigator" | "Co-Investigator" | "Project Lead" | "Senior Researcher";
}

const PRINCIPAL_LEADERSHIP: TeamMember[] = [
  {
    id: "lead-pi",
    name: "Engr. Prof. I. Okoro",
    role: "Lead Principal Investigator & Project Patron",
    department: "Department of Electrical & Electronics Engineering",
    institution: "Federal University of Technology, Minna",
    imageSrc: "/team/member_lead_prof.jpg",
    badgeType: "Principal Investigator",
  },
  {
    id: "co-pi-1",
    name: "Engr. Dr. M. Buhari",
    role: "Co-Principal Investigator (Grid Stability)",
    department: "Department of Electrical & Electronics Engineering",
    institution: "Federal University of Technology, Minna",
    imageSrc: "/team/member_pi_engr.png",
    badgeType: "Co-Investigator",
  },
  {
    id: "co-pi-2",
    name: "Engr Hameedat",
    role: "Research Mentee",
    department: "School of Infrastructure, Process Engineering & Technology",
    institution: "Federal University of Technology, Minna",
    imageSrc: "/team/member_dr_amina.jpeg",
    badgeType: "Co-Investigator",
  },
];

const TECHNICAL_DIRECTORATE: TeamMember[] = [
  {
    id: "industry-liaison",
    name: "Engr. Prof. S. S. Adamu",
    role: "Principal Operations Specialist & NISO Liaison",
    department: "National Control Centre (NCC) Liaison Division",
    institution: "NESI Transmission & System Operations Partner",
    imageSrc: "/team/member_engr_saliu.jpg",
    badgeType: "Project Lead",
  },
  {
    id: "researcher-lead",
    name: "Engr. Dr. Abubakar Sadiq Ahmed",
    role: "Senior Research Fellow (Machine Learning)",
    department: "Department of Electrical & Electronics Engineering",
    institution: "Federal University of Technology, Minna",
    imageSrc: "/team/member_researcher_lead.jpg",
    badgeType: "Senior Researcher",
  },
  {
    id: "hardware-lead",
    name: "Engr. Dr. J. G. Ambafi",
    role: "Senior Simulation & Architecture Fellow",
    department: "Machine Learning 4 Power Systems (ML4PS) Lab",
    institution: "Federal University of Technology, Minna",
    imageSrc: "/team/member_dr_bello.jpg",
    badgeType: "Senior Researcher",
  },
];

// Resilient Image component that falls back across file formats (.jpg, .jpeg, .png, .webp)
const ResilientAvatar: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [attempt, setAttempt] = useState(0);

  const basePath = src.replace(/\.(png|jpe?g|webp)$/i, "");
  const extensions = [".jpg", ".jpeg", ".png", ".webp"];

  const handleError = () => {
    if (attempt < extensions.length) {
      setCurrentSrc(`${basePath}${extensions[attempt]}`);
      setAttempt((prev) => prev + 1);
    }
  };

  return (
    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm ring-4 ring-slate-50">
      <img
        src={currentSrc}
        alt={alt}
        onError={handleError}
        className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 -z-10 flex items-center justify-center bg-slate-200 text-lg font-bold text-slate-500">
        {alt
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")}
      </div>
    </div>
  );
};

interface UserRecord {
  id: string;
  name: string;
  email: string;
  institution: string;
  department: string;
  reason: string;
  role: string;
  is_approved: boolean;
  status: "PENDING" | "APPROVED";
  temp_password?: string;
  created_at?: string;
}

interface Props {
  apiBaseUrl: string;
}

export const AdminTab: React.FC<Props> = ({ apiBaseUrl }) => {
  const [subTab, setSubTab] = useState<"council" | "approvals">("council");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [issuedTempPass, setIssuedTempPass] = useState<{
    name: string;
    pass: string;
  } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch user directory:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === "approvals") {
      fetchUsers();
    }
  }, [subTab]);

  const handleApprove = async (userId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/approve/${userId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setIssuedTempPass({ name: data.user_name, pass: data.temp_password });
        fetchUsers();
      } else {
        alert(data.detail || "Approval failed");
      }
    } catch {
      alert("Network error approving user");
    }
  };

  const handleReject = async (userId: string) => {
    if (!confirm("Reject and delete this registration request?")) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/reject/${userId}`, {
        method: "POST",
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch {
      alert("Network error rejecting user");
    }
  };

  const pendingUsers = users.filter((u) => !u.is_approved);
  const approvedUsers = users.filter((u) => u.is_approved);

  const renderProfileCard = (member: TeamMember) => (
    <div
      key={member.id}
      className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#500b50]/30 hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <ResilientAvatar src={member.imageSrc} alt={member.name} />

        <div className="min-w-0 flex-1 space-y-1">
          <span
            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              member.badgeType === "Principal Investigator"
                ? "border border-purple-200 bg-purple-50 text-[#500b50]"
                : member.badgeType === "Co-Investigator"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : member.badgeType === "Project Lead"
                ? "border border-blue-200 bg-blue-50 text-blue-900"
                : "border border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {member.badgeType}
          </span>

          <h3 className="truncate text-base font-black tracking-tight text-slate-900 group-hover:text-[#500b50] transition">
            {member.name}
          </h3>

          <p className="text-xs font-bold leading-tight text-[#500b50]">
            {member.role}
          </p>

          <div className="pt-2 border-t border-slate-100 text-xs space-y-0.5 text-slate-500">
            <p className="line-clamp-1 font-medium text-slate-600">{member.department}</p>
            <p className="line-clamp-1 text-[11px] font-semibold text-slate-400">{member.institution}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
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
            onClick={() => setSubTab("council")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition ${
              subTab === "council"
                ? "bg-[#500b50] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Research Council</span>
          </button>

          <button
            onClick={() => setSubTab("approvals")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition relative ${
              subTab === "approvals"
                ? "bg-[#500b50] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
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

      {/* Issued Temp Password Modal */}
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
                    alert("Temporary password copied to clipboard!");
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
      {subTab === "council" && (
        <div className="space-y-8">
          {/* Institution Header Banner */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-white p-2 border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                <img
                  src="/ml4ps-logo.png"
                  alt="ML4PS Crest"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>

              <div className="text-center md:text-left space-y-1.5 flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-xs font-bold bg-[#f5eff6] text-[#500b50] border border-[#500b50]/20">
                  <Award className="h-3.5 w-3.5" />
                  <span>National Power System Taskforce</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Machine Learning 4 Power Systems (ML4PS) Research Group
                </h1>

                <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-3xl leading-relaxed">
                  Institutional research consortium at the Federal University of Technology, Minna (FUT Minna), dedicated to indigenous power flow simulation, transient dynamics, and operational security for the Nigerian Electricity Supply Industry (NESI).
                </p>

                <div className="pt-1 flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs text-slate-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Building className="h-3.5 w-3.5 text-[#500b50]" />
                    <span>SEET / EEE Department, FUT Minna</span>
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

          {/* Section 1: Principal Leadership & Governance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#500b50]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Principal Leadership & Project Governance
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PRINCIPAL_LEADERSHIP.map(renderProfileCard)}
            </div>
          </div>

          {/* Section 2: Technical Directorate & Operations */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[#500b50]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                System Operations & Technical Directorate
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {TECHNICAL_DIRECTORATE.map(renderProfileCard)}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: OPERATOR APPROVALS QUEUE */}
      {subTab === "approvals" && (
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
                        <td className="py-3 px-4 text-xs font-mono text-slate-400">
                          {u.created_at || "Recently"}
                        </td>
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
                        {u.id !== "admin-root" && (
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