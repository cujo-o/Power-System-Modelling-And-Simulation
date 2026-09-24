'use client'

import { Building2, GraduationCap, Sparkles } from 'lucide-react'

interface TeamMember {
  name: string
  role: string
  tag: string
  department: string
  institution: string
  image: string
  bio?: string
}

// Easily add, remove, or reorder members as the project evolves
const TEAM_MEMBERS: TeamMember[] = [
  // 1. Top Lead (Single Featured Card)
  {
    name: 'Engr. Prof. I. Okoro',
    role: 'Lead Principal Investigator & Project Patron',
    tag: 'Principal Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/okoro.jpg',
    bio: 'Overseeing institutional governance, research integrity, and strategic simulation initiatives for the ML4PS platform.',
  },
  // 2. Second Row (Pair of Cards)
  {
    name: 'Engr. Prof. S. S. Adamu',
    role: 'Principal Operations Specialist & NISO Liaison',
    tag: 'Project Lead',
    department: 'NESI Transmission & System Operations (NCC)',
    institution: 'Federal University of Technology, Minna',
    image: '/team/adamu.jpg',
    bio: 'Directing grid telemetry validation, real-world utility operational synchronization, and transmission modeling.',
  },
  {
    name: 'Engr. Dr. M. Buhari',
    role: 'Co-Principal Investigator (Grid Stability)',
    tag: 'Co-Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/buhari.jpg',
    bio: 'Specializing in power system transient dynamics, voltage oscillation control, and PSS controller architecture.',
  },
  // 3. Third Row (Trio of Cards)
  {
    name: 'Engr. Dr. Abubakar Sadiq',
    role: 'Senior Research Fellow (Machine Learning)',
    tag: 'Senior Researcher',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/sadiq.jpg',
  },
  {
    name: 'Engr. Dr. J. G. Ambafi',
    role: 'Senior Simulation & Architecture Fellow',
    tag: 'Senior Researcher',
    department: 'Machine Learning 4 Power Systems (ML4PS)',
    institution: 'Federal University of Technology, Minna',
    image: '/team/ambafi.jpg',
  },
  {
    name: 'Engr. Hameedat',
    role: 'Research Mentee & Simulation Analyst',
    tag: 'Co-Investigator',
    department: 'School of Infrastructure, Process Engineering & Tech',
    institution: 'Federal University of Technology, Minna',
    image: '/team/hameedat.jpg',
  },
]

export default function OrganizationPage() {
  const topLead = TEAM_MEMBERS[0]
  const pair = TEAM_MEMBERS.slice(1, 3)
  const trio = TEAM_MEMBERS.slice(3, 6)
  const remainder = TEAM_MEMBERS.slice(6)

  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-12">
      {/* Intro Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2.5">
        <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 rounded-full border border-purple-200 dark:border-purple-800">
          Research &amp; Engineering Team
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Project Contributors &amp; Specialists
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Researchers and engineers driving power flow simulation, transient dynamics, and operational security for the Nigerian Electricity Supply Industry.
        </p>
      </div>

      {/* Row 1: Single Featured Card */}
      {topLead && (
        <div className="max-w-2xl mx-auto">
          <div className="overflow-hidden border border-purple-200/80 dark:border-purple-900/40 bg-white dark:bg-slate-900 shadow-md hover:shadow-xl transition-all duration-300 rounded-3xl group">
            <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
              <div className="relative w-40 sm:w-48 aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border-2 border-purple-500/20 group-hover:scale-102 transition duration-300 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={topLead.image}
                  alt={topLead.name}
                  className="w-full h-full object-cover object-top"
                />
              </div>

              <div className="flex-1 text-center sm:text-left space-y-3 min-w-0">
                <span className="inline-flex items-center bg-purple-600 text-white text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-md">
                  <Sparkles className="w-3 h-3 mr-1 inline" /> {topLead.tag}
                </span>

                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                    {topLead.name}
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-purple-700 dark:text-purple-400 mt-0.5">
                    {topLead.role}
                  </p>
                </div>

                {topLead.bio && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {topLead.bio}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-400">
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 truncate">
                    <Building2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span>{topLead.department}</span>
                  </p>
                  <p className="flex items-center justify-center sm:justify-start gap-1.5 truncate">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{topLead.institution}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Two Spacious Cards */}
      {pair.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {pair.map((member) => (
            <div
              key={member.name}
              className="overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-lg transition-all duration-300 rounded-3xl group flex flex-col justify-between"
            >
              <div className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="relative w-36 sm:w-44 aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 group-hover:scale-103 transition duration-300 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>

                <div className="space-y-2 w-full min-w-0">
                  <span className="inline-flex items-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                    {member.tag}
                  </span>

                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 truncate">
                      {member.name}
                    </h3>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                      {member.role}
                    </p>
                  </div>

                  {member.bio && (
                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 px-2">
                      {member.bio}
                    </p>
                  )}

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <p className="truncate">{member.department}</p>
                    <p className="text-[10px] font-medium text-slate-400 truncate">{member.institution}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Row 3: Three Vertical Cards */}
      {trio.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {trio.map((member) => (
            <div
              key={member.name}
              className="overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs hover:shadow-md transition-all duration-300 rounded-3xl group flex flex-col justify-between"
            >
              <div className="p-5 flex flex-col items-center text-center space-y-3.5">
                <div className="relative w-32 aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 group-hover:scale-103 transition duration-300 shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover object-top"
                  />
                </div>

                <div className="space-y-1.5 w-full min-w-0">
                  <span className="inline-flex items-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                    {member.tag}
                  </span>

                  <div>
                    <h4 className="text-base font-black text-slate-900 dark:text-slate-100 truncate">
                      {member.name}
                    </h4>
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

      {/* Row 4+: Any Additional Members Fall into a Balanced Grid */}
      {remainder.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {remainder.map((member) => (
            <div
              key={member.name}
              className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-3xl p-4 bg-white dark:bg-slate-900 flex items-center gap-4"
            >
              <div className="relative w-20 aspect-square rounded-xl overflow-hidden bg-slate-100 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] uppercase px-1.5 py-0 rounded-full mb-1">
                  {member.tag}
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {member.name}
                </h4>
                <p className="text-[11px] text-slate-500 truncate">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}