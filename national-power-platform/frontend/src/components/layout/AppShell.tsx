'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthModal } from '../modals/AuthModal';
import { useGrid } from '@/context/GridContext';
import {
  Zap,
  BookOpen,
  Cpu,
  GraduationCap,
  FileText,
  ArrowRight,
  Lock,
  CheckCircle2,
  Building2,
  TrendingUp,
  Layers,
  ShieldCheck,
} from 'lucide-react';

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  institution?: string;
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { activeModel, summary } = useGrid();

  const [user, setUser] = useState<PlatformUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'request'>('login');
  const [showPublicPortal, setShowPublicPortal] = useState(false);
  const [publicSection, setPublicSection] = useState<
    'overview' | 'products' | 'learning' | 'reading'
  >('overview');
  const [activeLesson, setActiveLesson] = useState<number>(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ml4ps_user') || localStorage.getItem('nesi_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setUser({
            id: parsed.id || 'usr-1',
            name: parsed.name || parsed.username || 'Engineer',
            email: parsed.email || '',
            role: parsed.role === 'admin' || parsed.isAdmin ? 'admin' : 'user',
            institution: parsed.institution || 'FUT Minna',
          });
        } catch {}
      }
      setAuthInitialized(true);
    }
  }, []);

  const handleLoginSuccess = (loggedInUser: PlatformUser) => {
    setUser(loggedInUser);
    setShowPublicPortal(false);
    setShowAuthModal(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ml4ps_user', JSON.stringify(loggedInUser));
      localStorage.setItem('nesi_user', JSON.stringify(loggedInUser));
    }
  };

  const handleLogout = () => {
    setUser(null);
    setShowPublicPortal(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ml4ps_user');
      localStorage.removeItem('nesi_user');
    }
  };

  if (!authInitialized) return null;

  // ============================================================================
  // PUBLIC TECHNICAL COMPANY & STUDENT LEARNING WEBSITE (Shown when logged out
  // or when a logged-in user clicks "Company & Learning Site")
  // ============================================================================
  if (!user || showPublicPortal) {
    const LESSONS = [
      {
        title: '1. Per-Unit (pu) System & Transmission Voltage Levels',
        level: 'Undergraduate Foundation',
        summary:
          'Why bulk power grids normalize voltages (330 kV and 132 kV) and power (100 MVA base) into per-unit quantities.',
        content:
          'In the Nigerian National Grid, transmission corridors operate primarily at 330 kV (bulk backbone) and 132 kV (sub-transmission). Using per-unit (pu) values normalizes voltage magnitudes around 1.000 pu. Under the Nigerian Grid Code, normal steady-state voltage must remain between 0.950 pu and 1.050 pu (313.5 kV to 346.5 kV on the 330 kV network).',
        formula: 'V_pu = V_actual (kV) / V_base (kV)',
      },
      {
        title: '2. Steady-State AC Power Flow (Newton-Raphson)',
        level: 'Power System Analysis',
        summary:
          'How active power (MW) relates to voltage phase angles (δ) and reactive power (MVAR) relates to voltage magnitude (|V|).',
        content:
          'Transmission lines have high inductive reactance compared to resistance (X >> R). Because of this physical property, active power (MW) flows from buses with higher phase angles to lower phase angles, while reactive power (MVAR) injection supports local bus voltage magnitudes. Every simulation model requires one Slack (Reference) Bus at 1.05 pu to balance network losses.',
        formula: 'P_ik ≈ (|V_i||V_k| / X_ik) * sin(δ_i - δ_k)',
      },
      {
        title: '3. Primary Frequency Control & Governor Droop (P–f)',
        level: 'Grid Stability & Control',
        summary:
          'How synchronous generators automatically share sudden load changes without central communication.',
        content:
          'Nominal grid frequency in Nigeria is 50.0 Hz. When generation drops or demand surges, turbines slow down and frequency falls. Each generator governor is configured with a droop setting R (typically 4% to 5%). A 4% droop means a 4% change in frequency (2.0 Hz) causes the unit to ramp output by 100% of its rated capacity.',
        formula: 'ΔP_i = - (P_rated,i / (R_i * f_0)) * Δf',
      },
      {
        title: '4. N-1 Contingency & Cascading Overcurrent Tripping',
        level: 'System Protection',
        summary:
          'Evaluating whether the grid can survive the unexpected loss of any single transmission circuit.',
        content:
          'An N-1 contingency occurs when a single transmission line or transformer breaker opens due to a fault. The power previously carried by that line immediately diverts onto parallel paths inversely proportional to their series reactance (P_1 / P_2 = X_2 / X_1). If adjacent lines exceed their thermal current rating, overcurrent relays trip them open, which can lead to a cascading blackout.',
        formula: 'Loading (%) = (I_line / I_thermal_limit) * 100',
      },
      {
        title: '5. Electricity Market Clearing & ASSUME Framework',
        level: 'Power Economics & NESI',
        summary:
          'Agent-based modeling of GenCos, DisCos, NBET, and System Marginal Price (SMP) in Nigeria.',
        content:
          'The Nigerian Electricity Supply Industry (NESI) comprises thermal (gas-fired) and hydro Generation Companies (GenCos), the Transmission Company of Nigeria (TCN), and 11 regional Distribution Companies (DisCos). Using the ASSUME agent-based market framework, generator agents submit price-quantity bids (₦/MWh) based on fuel and operational costs, and the market operator clears supply against regional demand.',
        formula: 'SMP = Marginal Bid of Last Dispatched Generator (₦/MWh)',
      },
    ];

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/ml4ps-logo.png"
                alt="ML4PS Logo"
                className="h-9 w-9 object-contain rounded-lg border border-slate-200 p-0.5 bg-white"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div>
                <span className="font-black text-base text-slate-900 tracking-tight block leading-none">
                  ML4PS
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Machine Learning 4 Power Systems • FUT Minna
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-slate-600">
              <button
                onClick={() => setPublicSection('overview')}
                className={`py-1 transition ${
                  publicSection === 'overview'
                    ? 'text-[#500b50] border-b-2 border-[#500b50]'
                    : 'hover:text-slate-900'
                }`}
              >
                Company &amp; Platform
              </button>
              <button
                onClick={() => setPublicSection('products')}
                className={`py-1 transition ${
                  publicSection === 'products'
                    ? 'text-[#500b50] border-b-2 border-[#500b50]'
                    : 'hover:text-slate-900'
                }`}
              >
                Products &amp; Tools
              </button>
              <button
                onClick={() => setPublicSection('learning')}
                className={`py-1 transition ${
                  publicSection === 'learning'
                    ? 'text-[#500b50] border-b-2 border-[#500b50]'
                    : 'hover:text-slate-900'
                }`}
              >
                Student Learning Hub
              </button>
              <button
                onClick={() => setPublicSection('reading')}
                className={`py-1 transition ${
                  publicSection === 'reading'
                    ? 'text-[#500b50] border-b-2 border-[#500b50]'
                    : 'hover:text-slate-900'
                }`}
              >
                Publications &amp; Reading
              </button>
            </nav>

            <div className="flex items-center gap-2.5">
              {user ? (
                <button
                  onClick={() => setShowPublicPortal(false)}
                  className="px-4 py-2 rounded-lg bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68] transition flex items-center gap-1.5"
                >
                  <span>Return to Simulation Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setAuthModalMode('login');
                      setShowAuthModal(true);
                    }}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-50 transition"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setAuthModalMode('request');
                      setShowAuthModal(true);
                    }}
                    className="px-4 py-2 rounded-lg bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68] transition"
                  >
                    Request Access
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 space-y-12">
          {/* SECTION 1: COMPANY & PLATFORM OVERVIEW */}
          {publicSection === 'overview' && (
            <div className="space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-xs">
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-[#500b50] text-xs font-bold">
                    <Zap className="h-3.5 w-3.5" />
                    <span>Power Systems Engineering &amp; Market Simulation</span>
                  </div>
                  <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                    Modelling, Stability, and Market Design for the Nigerian Power Grid.
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                    Machine Learning 4 Power Systems (ML4PS) develops simulation software and analytical models for the Nigerian Electricity Supply Industry (NESI). Our platform combines steady-state 330kV/132kV load flow, transient rotor stability, single-line CAD diagrams, and the ASSUME electricity market simulation engine.
                  </p>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        if (user) setShowPublicPortal(false);
                        else {
                          setAuthModalMode('login');
                          setShowAuthModal(true);
                        }
                      }}
                      className="px-5 py-2.5 rounded-xl bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68] transition flex items-center gap-2"
                    >
                      <span>Sign In to Simulation Platform</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPublicSection('learning')}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
                    >
                      Explore Student Learning Hub
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Backbone Grid</span>
                    <p className="text-xl font-black font-mono text-slate-900">330 / 132 kV</p>
                    <p className="text-xs text-slate-500">Full AC Newton-Raphson &amp; Iwamoto solvers</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Market Engine</span>
                    <p className="text-xl font-black font-mono text-[#500b50]">ASSUME</p>
                    <p className="text-xs text-slate-500">Agent-based NESI wholesale market clearing</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Protection</span>
                    <p className="text-xl font-black font-mono text-slate-900">N-1 &amp; UFLS</p>
                    <p className="text-xs text-slate-500">Breaker switching &amp; cascading outage analysis</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Education</span>
                    <p className="text-xl font-black font-mono text-emerald-700">Open Lab</p>
                    <p className="text-xs text-slate-500">Guided modules for engineering students</p>
                  </div>
                </div>
              </div>

              {/* How Access Works */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-purple-50 text-[#500b50] flex items-center justify-center">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">About the Organization</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Based at the Department of Electrical and Electronics Engineering, Federal University of Technology, Minna, ML4PS builds practical simulation tools for grid operators, researchers, and students.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-purple-50 text-[#500b50] flex items-center justify-center">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">ASSUME Market Integration</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    We integrate the ASSUME agent-based framework to model the Nigerian Electricity Market—evaluating GenCo bidding strategies, NBET vesting contracts, bilateral trading, and DisCo tariff impacts.
                  </p>
                </div>

                <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-purple-50 text-[#500b50] flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">Verified Workspace Access</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Approved users can run all uploaded grid models in an isolated personal workspace. Model uploads and user approvals are managed by platform administrators to maintain data integrity.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: PRODUCTS & TOOLS WORKED ON */}
          {publicSection === 'products' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Products &amp; Engineering Systems</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Core software modules and research systems developed by the ML4PS engineering team.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-purple-50 text-[#500b50] text-[11px] font-bold">
                      Core Engine
                    </span>
                    <span className="text-xs font-mono text-slate-400">v2.4 Production</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    1. NESI 330kV / 132kV Steady-State &amp; Contingency Simulator
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Full AC load flow solver built on Pandapower and MATPOWER standards. Supports real-time demand scaling, shunt MVAR compensation, N-1 line breaker switching, automated overcurrent cascading outage sequences, and regional substation expansion in a non-destructive sandbox.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-bold">
                      Market Simulation
                    </span>
                    <span className="text-xs font-mono text-slate-400">ASSUME Integration</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    2. ASSUME-NESI Wholesale Electricity Market Simulator
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Adapts the open-source ASSUME (Agent-based Simulation of Sustainable Electricity Markets) framework to the Nigerian Electricity Supply Industry. Simulates thermal and hydro GenCo bidding agents, gas supply constraints, System Marginal Price (SMP) clearing, and DisCo load allocation.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px] font-bold">
                      Vector CAD
                    </span>
                    <span className="text-xs font-mono text-slate-400">Interactive SVG</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    3. STAC Planar Single-Line Diagram (SLD) Studio
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Automated force-directed topological layout engine that untangles complex transmission networks, separates parallel circuits, docks line terminals cleanly to copper busbars, and allows interactive breaker switching and high-resolution PNG/SVG/CSV export.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-bold">
                      Transient Dynamics
                    </span>
                    <span className="text-xs font-mono text-slate-400">Time-Domain ODE</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    4. Multi-Machine Swing Equation &amp; UFLS Analyzer
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Simulates synchronous generator rotor angle trajectories during 3-phase bus faults, calculates Critical Clearing Time (CCT), and evaluates 4-stage Under-Frequency Load Shedding (UFLS) relays against Nigerian Grid Code frequency limits (50 Hz ± 0.5 Hz).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: STUDENT LEARNING HUB */}
          {publicSection === 'learning' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Student Learning Hub</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Structured power systems engineering guides designed for undergraduate and postgraduate students before running live simulations.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-2">
                  {LESSONS.map((lesson, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveLesson(idx)}
                      className={`w-full text-left p-4 rounded-xl border transition ${
                        activeLesson === idx
                          ? 'border-[#500b50] bg-purple-50/60 shadow-2xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase text-[#500b50] block">
                        {lesson.level}
                      </span>
                      <h4 className="font-bold text-xs text-slate-900 mt-0.5">{lesson.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{lesson.summary}</p>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 bg-white space-y-4 h-fit">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#500b50]">
                        {LESSONS[activeLesson].level}
                      </span>
                      <h3 className="font-black text-base text-slate-900 mt-0.5">
                        {LESSONS[activeLesson].title}
                      </h3>
                    </div>
                    <GraduationCap className="h-6 w-6 text-[#500b50]" />
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">
                    {LESSONS[activeLesson].content}
                  </p>

                  <div className="p-3.5 rounded-xl bg-slate-900 text-white font-mono text-xs">
                    <span className="text-[10px] text-slate-400 block mb-1 font-sans uppercase font-bold">
                      Governing Relationship
                    </span>
                    {LESSONS[activeLesson].formula}
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs">
                    <span className="text-slate-500">
                      Want to test this concept on the 63-bus 330kV or 369-bus 132kV model?
                    </span>
                    <button
                      onClick={() => {
                        if (user) setShowPublicPortal(false);
                        else {
                          setAuthModalMode('request');
                          setShowAuthModal(true);
                        }
                      }}
                      className="font-bold text-[#500b50] hover:underline flex items-center gap-1"
                    >
                      <span>{user ? 'Open Simulator' : 'Request Student Access'}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: PUBLICATIONS & TECHNICAL READING */}
          {publicSection === 'reading' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Publications &amp; Technical Reading</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Research papers, grid code standards, and technical documentation from the ML4PS research group.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    title:
                      'Steady-State Voltage Stability and Continuation Power Flow Analysis of the Nigerian 330 kV Transmission Network',
                    authors: 'ML4PS Research Group • FUT Minna',
                    year: '2026',
                    tag: 'Grid Stability',
                    abstract:
                      'Evaluates bus voltage profiles across 63 bulk 330 kV substations under peak loading and identifies reactive power compensation requirements in the North-East and North-Central zones.',
                  },
                  {
                    title:
                      'Integrating ASSUME for Agent-Based Wholesale Market Clearing in the Nigerian Electricity Supply Industry (NESI)',
                    authors: 'ML4PS Market & Economics Division',
                    year: '2026',
                    tag: 'Electricity Markets (ASSUME)',
                    abstract:
                      'Models generator bidding behavior, NBET vesting contract transitions, and bilateral power purchase agreements across Nigeria’s 11 distribution zones using the ASSUME simulation framework.',
                  },
                  {
                    title:
                      'Sub-Transmission Expansion: 369-Bus 132 kV Network Modelling and N-1 Contingency Screening',
                    authors: 'Department of Electrical & Electronics Engineering, FUT Minna',
                    year: '2026',
                    tag: 'Sub-Transmission',
                    abstract:
                      'Comprehensive topological parameterization of the 132 kV sub-transmission feeders, analyzing parallel line impedance sharing and automated overcurrent relay trip thresholds.',
                  },
                  {
                    title:
                      'Nigerian Grid Code Statutory Operating Limits: Reference Guide for Simulation Engineers',
                    authors: 'Technical Standards Brief',
                    year: '2025',
                    tag: 'Grid Standards',
                    abstract:
                      'Summary of NERC statutory operating envelopes: 50.0 Hz ± 0.5% nominal frequency, 0.95–1.05 pu steady-state voltage compliance, and 4-stage Under-Frequency Load Shedding (UFLS) settings.',
                  },
                ].map((pub, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-xl border border-slate-200 bg-white space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                        {pub.tag}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{pub.year}</span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">{pub.title}</h3>
                    <p className="text-[11px] font-semibold text-[#500b50]">{pub.authors}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{pub.abstract}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        <footer className="bg-white border-t border-slate-200 py-6 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span>
              © 2026 Machine Learning 4 Power Systems (ML4PS) • Federal University of Technology, Minna
            </span>
            <span>Nigerian Electricity Supply Industry (NESI) Research &amp; Simulation Platform</span>
          </div>
        </footer>

        <AuthModal
          isOpen={showAuthModal}
          initialMode={authModalMode}
          onClose={() => setShowAuthModal(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  // ============================================================================
  // AUTHENTICATED TECHNICAL SIMULATION WORKSPACE
  // ============================================================================
  const isAdmin = user.role === 'admin';
  const isRestrictedAdminRoute =
    !isAdmin && (pathname?.startsWith('/upload') || pathname?.startsWith('/organization'));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <Sidebar
        user={user}
        isAdmin={isAdmin}
        onOpenCompanyPortal={() => setShowPublicPortal(true)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          isAdmin={isAdmin}
          modelName={activeModel?.name || 'No Model Selected'}
          converged={summary.converged}
          frequency={summary.frequency}
          onLogout={handleLogout}
          onOpenCompanyPortal={() => setShowPublicPortal(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isRestrictedAdminRoute ? (
            <div className="max-w-xl mx-auto mt-16 p-8 rounded-2xl border border-slate-200 bg-white text-center space-y-3 shadow-xs">
              <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">Administrator Access Only</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your account (<strong>{user.email}</strong>) has standard simulation permissions. You can run and modify all uploaded grid models in your personal sandbox, but only Administrators can upload new model files or approve user accounts.
              </p>
              <button
                onClick={() => router.push('/stability')}
                className="mt-2 px-4 py-2 rounded-lg bg-[#500b50] text-white text-xs font-bold"
              >
                Go to Grid Stability Studio
              </button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
};