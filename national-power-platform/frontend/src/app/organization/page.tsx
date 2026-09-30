'use client';

import React from 'react';
import { Building2, GraduationCap, Users } from 'lucide-react';

interface TeamMember {
  name: string;
  role: string;
  tag: string;
  department: string;
  institution: string;
  image: string;
  bio?: string;
}

const TEAM_MEMBERS: TeamMember[] = [
  {
    name: 'Engr. Dr. A. S. Ahmed',
    role: 'Lead Principal Investigator',
    tag: 'Principal Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/sadiq.jpg',
    bio: 'Directing strategic modeling frameworks, core solver design, and institutional validation for the ML4PS national grid simulation platform.',
  },
  {
    name: 'Engr. Prof. S. S. Adamu',
    role: 'Principal Operations Specialist & NISO Liaison',
    tag: 'Project Lead',
    department: 'NESI Transmission & System Operations (NCC)',
    institution: 'Federal University of Technology, Minna',
    image: '/team/adamu.jpg',
    bio: 'Overseeing grid telemetry synchronization, national utility operations liaison, and real-time contingency validation.',
  },
  {
    name: 'Engr. Dr. M. Buhari',
    role: 'Co-Principal Investigator (Grid Stability)',
    tag: 'Co-Investigator',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/buhari.png',
    bio: 'Leading dynamic frequency defense architectures, multi-machine rotor angle stability, and power system stabilizer optimization.',
  },
  {
    name: 'Engr. Prof. I. Okoro',
    role: 'Senior Research Fellow (Machine Learning)',
    tag: 'Senior Researcher',
    department: 'Department of Electrical & Electronics Engineering',
    institution: 'Federal University of Technology, Minna',
    image: '/team/okoro.jpg',
  },
  {
    name: 'Engr. Dr. J. G. Ambafi',
    role: 'Senior Simulation & Architecture Fellow',
    tag: 'Senior Researcher',
    department: 'Machine Learning 4 Power Systems (ML4PS) Lab',
    institution: 'Federal University of Technology, Minna',
    image: '/team/ambafi.jpg',
  },
  {
    name: 'Engr. Hameedat',
    role: 'Research Mentee & Simulation Analyst',
    tag: 'Co-Investigator',
    department: 'School of Infrastructure, Process Engineering & Technology',
    institution: 'Federal University of Technology, Minna',
    image: '/team/hameedat.jpeg',
  },
];

const ResilientPortrait: React.FC<{ src: string; alt: string; className?: string }> = ({
  src,
  alt,
  className = '',
}) => {
  const [currentSrc, setCurrentSrc] = React.useState(src.trim());
  const [attempt, setAttempt] = React.useState(0);

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
        className="w-full h-full object-cover object-top transition duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 -z-10 flex items-center justify-center font-mono text-xs font-bold text-slate-400 select-none">
        {initials}
      </div>
    </div>
  );
};

export default function OrganizationPage() {
  const topLead = TEAM_MEMBERS[0];
  const pair = TEAM_MEMBERS.slice(1, 3);
  const trio = TEAM_MEMBERS.slice(3, 6);

  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-1 bg-purple-100 text-[#500b50] dark:bg-purple-950 dark:text-purple-300 rounded-full border border-purple-200 dark:border-purple-800">
          Workforce Directory
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Machine Learning 4 Power Systems (ML4PS)
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Engineers and academic investigators developing indigenous simulation methods, stability evaluation, and operational machine learning models for the Nigerian Electricity Supply Industry.
        </p>
      </div>

      {/* Featured Lead */}
      {topLead && (
        <div className="max-w-3xl mx-auto">
          <div className="overflow-hidden border border-purple-200 dark:border-purple-950 bg-white dark:bg-slate-900 shadow-xs hover:border-[#500b50]/30 transition rounded-2xl group">
            <div className="p-6 sm:p-7 flex flex-col sm:flex-row items-center gap-6">
              <ResilientPortrait
                src={topLead.image}
                alt={topLead.name}
                className="w-32 h-40 sm:w-36 sm:h-44 rounded-xl shrink-0 border border-purple-200/80 dark:border-purple-900/40 shadow-xs"
              />

              <div className="flex-1 text-center sm:text-left space-y-2 min-w-0">
                <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-[#500b50] dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  {topLead.tag}
                </span>

                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    {topLead.name}
                  </h2>
                  <p className="text-xs font-bold text-[#500b50] dark:text-purple-400 mt-0.5">
                    {topLead.role}
                  </p>
                </div>

                {topLead.bio && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {topLead.bio}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p className="flex items-center justify-center sm:justify-start gap-2 truncate">
                    <Building2 className="w-3.5 h-3.5 text-[#500b50] shrink-0" />
                    <span>{topLead.department}</span>
                  </p>
                  <p className="flex items-center justify-center sm:justify-start gap-2 truncate">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{topLead.institution}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Technical Leaders Pair */}
      {pair.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {pair.map((member) => (
            <div
              key={member.name}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-[#500b50]/30 transition group flex flex-col justify-between"
            >
              <div className="flex items-start gap-4">
                <ResilientPortrait
                  src={member.image}
                  alt={member.name}
                  className="w-24 h-32 rounded-xl shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs"
                />

                <div className="space-y-1.5 min-w-0 flex-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {member.tag}
                  </span>

                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100 truncate">
                      {member.name}
                    </h3>
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
      )}

      {/* Research Fellows Trio */}
      {trio.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {trio.map((member) => (
            <div
              key={member.name}
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
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 mb-1">
                      {member.tag}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug truncate">
                      {member.name}
                    </h4>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                      {member.role}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-0.5 text-slate-400">
                <p className="truncate text-slate-600 dark:text-slate-300">{member.department}</p>
                <p className="truncate text-[10px]">{member.institution}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}