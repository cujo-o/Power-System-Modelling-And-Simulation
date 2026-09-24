'use client'

import { useState } from 'react'
import { 
  Building2, 
  GraduationCap, 
  Sparkles, 
  UserCheck 
} from 'lucide-react'

export interface TeamMember {
  id: string
  name: string
  role: string
  tag: string
  department: string
  institution: string
  image: string
  bio?: string
}

interface AdminTabProps {
  apiBaseUrl?: string
}

// Single flexible list of contributors
const INITIAL_MEMBERS: TeamMember[] = [
  // 1. Featured Top Lead
  {
    id: 'okoro',
    name: 'Engr. Prof. I. Okoro',
    role: 'Lead Principal Investigator & Project Patron',
    tag: 'Principal Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/okoro.jpg',
    bio: 'Overseeing project governance, strategic simulation workflows, and institutional validation for the ML4PS research platform.',
  },
  // 2. Middle Row (Pair)
  {
    id: 'adamu',
    name: 'Engr. Prof. S. S. Adamu',
    role: 'Principal Operations Specialist & NISO Liaison',
    tag: 'Project Lead',
    department: 'NESI Transmission & System Operations (NCC)',
    institution: 'Federal University of Technology, Minna',
    image: '/team/adamu.jpg',
    bio: 'Coordinating grid telemetry, dispatch synchronization, and utility operations for the national transmission network.',
  },
  {
    id: 'buhari',
    name: 'Engr. Dr. M. Buhari',
    role: 'Co-Principal Investigator (Grid Stability)',
    tag: 'Co-Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/buhari.jpg',
    bio: 'Directing dynamic frequency response modeling, transient stability analysis, and PSS controller optimization.',
  },
  // 3. Lower Row (Trio)
  {
    id: 'sadiq',
    name: 'Engr. Dr. Abubakar Sadiq',
    role: 'Senior Research Fellow (Machine Learning)',
    tag: 'Senior Researcher',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/sadiq.jpg',
  },
  {
    id: 'ambafi',
    name: 'Engr. Dr. J. G. Ambafi',
    role: 'Senior Simulation & Architecture Fellow',
    tag: 'Senior Researcher',
    department: 'Machine Learning 4 Power Systems (ML4PS)',
    institution: 'Federal University of Technology, Minna',
    image: '/team/ambafi.jpg',
  },
  {
    id: 'hameedat',
    name: 'Engr. Hameedat',
    role: 'Research Mentee & Simulation Analyst',
    tag: 'Co-Investigator',
    department: 'School of Infrastructure, Process Engineering & Technology',
    institution: 'Federal University of Technology, Minna',
    image: '/team/hameedat.jpg',
  },
]

export default function AdminTab({ apiBaseUrl }: AdminTabProps) {
  const [members] = useState<TeamMember[]>(INITIAL_MEMBERS)

  const topLead = members[0]
  const pair = members.slice(1, 3)
  const trio = members.slice(3, 6)
  const remainder = members.slice(6)

  return (
    <div className="w-full space-y-10 py-4 px-2 sm:px-4">
      {/* Platform Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Project Leadership &amp; Researchers
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              ML4PS Core Team
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Key personnel directing the modeling, stability assessment, and machine learning telemetry for the Nigerian Electricity Supply Industry (NESI).
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 rounded-xl w-fit">
          <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{members.length} Registered Contributors</span>
        </div>
      </div>

      {/* Row 1: Top Featured Patron / Lead */}
      {topLead && (
        <div className="max-w-3xl mx-auto w-full">
          <div className="overflow-hidden border border-purple-200/80 dark:border-purple-900/40 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all rounded-3xl group">
            <div className="p-6 sm:p-7 flex flex-col sm:flex-row items-center gap-6">
              <div className="relative w-44 sm:w-52 aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border-2 border-purple-500/20 shadow-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={topLead.image}
                  alt={topLead.name}
                  className="w-full h-full object-cover object-top group-hover:scale-102 transition duration-300"
                />
              </div>

              <div className="flex-1 text-center sm:text-left space-y-3 min-w-0">
                <span className="inline-flex items-center bg-purple-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md">
                  <Sparkles className="w-3 h-3 mr-1 inline" /> {topLead.tag}
                </span>

                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                    {topLead.name}
                  </h3>
                  <p className="text-xs sm:text-sm font-bold text-purple-700 dark:text-purple-400 mt-0.5">
                    {topLead.role}
                  </p>
                </div>

                {topLead.bio && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {topLead.bio}
                  </p>
                )}

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 truncate">
                    <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span className="truncate">{topLead.department}</span>
                  </p>
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 truncate">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{topLead.institution}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Secondary Pair */}
      {pair.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
          {pair.map((member) => (
            <div
              key={member.id}
              className="overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md transition-all rounded-3xl group flex flex-col justify-between"
            >
              <div className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="relative w-40 sm:w-48 aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover object-top group-hover:scale-103 transition duration-300"
                  />
                </div>

                <div className="space-y-2 w-full min-w-0">
                  <span className="inline-flex items-center border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                    {member.tag}
                  </span>

                  <div>
                    <h4 className="text-lg font-black text-slate-900 dark:text-slate-100 truncate">
                      {member.name}
                    </h4>
                    <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mt-0.5">
                      {member.role}
                    </p>
                  </div>

                  {member.bio && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 px-1">
                      {member.bio}
                    </p>
                  )}

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <p className="truncate">{member.department}</p>
                    <p className="text-[10px] text-slate-400 truncate">{member.institution}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Row 3: Research Fellows Trio */}
      {trio.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto w-full">
          {trio.map((member) => (
            <div
              key={member.id}
              className="overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md transition-all rounded-3xl group flex flex-col justify-between"
            >
              <div className="p-5 flex flex-col items-center text-center space-y-3.5">
                <div className="relative w-36 aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover object-top group-hover:scale-103 transition duration-300"
                  />
                </div>

                <div className="space-y-1.5 w-full min-w-0">
                  <span className="inline-flex items-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                    {member.tag}
                  </span>

                  <div>
                    <h5 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate">
                      {member.name}
                    </h5>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 line-clamp-1">
                      {member.role}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 space-y-0.5">
                    <p className="truncate">{member.department}</p>
                    <p className="truncate text-slate-400">{member.institution}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Row 4+: Additional Contributors */}
      {remainder.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto w-full pt-2">
          {remainder.map((member) => (
            <div
              key={member.id}
              className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 flex items-center gap-3.5 shadow-2xs"
            >
              <div className="relative w-16 aspect-square rounded-xl overflow-hidden bg-slate-100 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[8px] uppercase px-1.5 py-0 rounded-full mb-1">
                  {member.tag}
                </span>
                <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {member.name}
                </h5>
                <p className="text-[10px] text-slate-500 truncate">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}