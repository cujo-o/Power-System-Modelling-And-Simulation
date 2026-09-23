'use client';

import React from 'react';
import Image from 'next/image';
import {
  Award,
  BookOpen,
  Mail,
  Building,
  Cpu,
  Layers,
  Zap,
  Globe,
  ExternalLink,
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

export const AdminTab: React.FC = () => {
  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* INSTITUTIONAL BANNER WITH ML4PS LOGO */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-br from-[#500b50]/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
          {/* Logo Showcase */}
          <div className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl bg-white p-2.5 border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
            <img
              src="/ml4ps-logo.png"
              alt="Machine Learning for Power System (ML4PS) Logo"
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback icon placeholder if image path is not yet copied
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

      {/* TEAM DIRECTORY HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#500b50] flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#500b50]" />
            <span>Taskforce Leadership & Research Council</span>
          </h2>
          <p className="text-xs text-slate-500">
            Principal investigators, computational analysts, and power engineering researchers overseeing platform development.
          </p>
        </div>

        <span className="px-3 py-1 rounded bg-slate-100 text-slate-700 text-xs font-mono font-bold border border-slate-200 w-fit">
          {TASKFORCE_COUNCIL.length} Research Fellows
        </span>
      </div>

      {/* DIRECTORY CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {TASKFORCE_COUNCIL.map((member) => (
          <div
            key={member.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group hover:border-[#500b50]/40"
          >
            <div>
              {/* Member Photo & Badge Header */}
              <div className="flex items-start gap-4">
                <div className="relative h-20 w-20 sm:h-22 sm:w-22 rounded-xl overflow-hidden border-2 border-slate-100 bg-slate-100 shrink-0 shadow-inner group-hover:border-[#500b50]/30 transition">
                  <img
                    src={member.imageSrc}
                    alt={member.name}
                    className="w-full h-full object-cover object-top"
                    onError={(e) => {
                      // Fallback placeholder with initials if image not found
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
                        : member.badgeType === 'Project Lead'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
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

              {/* Roles & Department */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Taskforce Appointment
                  </span>
                  <span className="font-semibold text-slate-800 block text-[11px]">
                    {member.role}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Institutional Affiliation
                  </span>
                  <span className="text-slate-600 block text-[11px]">
                    {member.department}
                  </span>
                  <span className="text-[#500b50] font-semibold block text-[10px]">
                    {member.institution}
                  </span>
                </div>
              </div>
            </div>

            {/* Specialization Tags */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1.5">
                Core Research Focus
              </span>
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

      {/* FOOTER CALLOUT / INSTITUTIONAL ATTESTATION */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-[#500b50] shrink-0" />
          <div>
            <span className="font-bold text-slate-900 block">
              Machine Learning 4 Power Systems (ML4PS) Laboratory
            </span>
            <p className="text-[11px] text-slate-500">
              School of Electrical Engineering & Technology, Federal University of Technology, Minna, P.M.B. 65, Minna, Niger State.
            </p>
          </div>
        </div>

        <div className="font-mono text-[10px] text-slate-400 bg-white px-3 py-1.5 rounded border border-slate-200 shrink-0">
          Consortium Code: ML4PS-FUTM-2026
        </div>
      </div>
    </div>
  );
};