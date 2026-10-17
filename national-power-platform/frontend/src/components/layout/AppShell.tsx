'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthModal } from '../modals/AuthModal';
import { useGrid } from '@/context/GridContext';
import { ArrowRight, Lock } from 'lucide-react';

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
  const [activeMotivationTab, setActiveMotivationTab] = useState<
    'problem' | 'solution' | 'education'
  >('problem');
  const [previewVoltage, setPreviewVoltage] = useState<number>(1.02);
  const [previewLoading, setPreviewLoading] = useState<number>(100);

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
  // PUBLIC TECHNICAL COMPANY & STUDENT LEARNING WEBSITE
  // ============================================================================
  if (!user || showPublicPortal) {
    const LESSONS = [
      {
        title: '1. Per-Unit (pu) System & Transmission Voltage Levels',
        level: 'Undergraduate Foundation',
        summary:
          'Why bulk power grids normalize voltages (330 kV and 132 kV) and power (100 MVA base) into per-unit quantities.',
        content:
          'In the Nigerian National Grid, transmission corridors operate primarily at 330 kV (bulk backbone) and 132 kV (sub-transmission). Using per-unit (pu) values normalizes voltage magnitudes around 1.000 pu across transformer boundaries. Under the Nigerian Grid Code, normal steady-state voltage must remain between 0.950 pu and 1.050 pu (313.5 kV to 346.5 kV on the 330 kV network).',
        formula: 'V_pu = V_actual (kV) / V_base (kV)',
      },
      {
        title: '2. Steady-State AC Power Flow (Newton-Raphson)',
        level: 'Power System Analysis',
        summary:
          'How active power (MW) relates to voltage phase angles and reactive power (MVAR) relates to voltage magnitude.',
        content:
          'High-voltage transmission lines have high inductive reactance compared to resistance (X >> R). Because of this physical property, active power (MW) flows primarily from buses with higher phase angles to lower phase angles, while reactive power (MVAR) injection supports local bus voltage magnitudes. Every simulation model requires a Slack (Reference) Bus to balance network losses.',
        formula: 'P_ik = (|V_i||V_k| / X_ik) * sin(delta_i - delta_k)',
      },
      {
        title: '3. Primary Frequency Control & Governor Droop (P-f)',
        level: 'Grid Stability & Control',
        summary:
          'How synchronous generators automatically share sudden load changes without central communication.',
        content:
          'Nominal grid frequency in Nigeria is 50.0 Hz. When generation drops or demand surges, synchronous turbines slow down and system frequency falls. Each generator speed governor is configured with a droop setting R (typically 4% to 5%). A 4% droop means a 4% change in frequency (2.0 Hz) causes the unit to ramp output by 100% of its rated capacity.',
        formula: 'Delta_P_i = - (P_rated,i / (R_i * f_0)) * Delta_f',
      },
      {
        title: '4. N-1 Contingency & Cascading Overcurrent Tripping',
        level: 'System Protection',
        summary:
          'Evaluating whether the grid can survive the unexpected loss of any single transmission circuit.',
        content:
          'An N-1 contingency occurs when a single transmission line or transformer breaker opens due to a fault. The power previously carried by that line immediately diverts onto parallel paths inversely proportional to their series reactance (P_1 / P_2 = X_2 / X_1). If adjacent lines exceed their thermal current rating, overcurrent relays trip them open, which can trigger a cascading blackout.',
        formula: 'Loading (%) = (I_line / I_thermal_limit) * 100',
      },
      {
        title: '5. Economic Dispatch & Wholesale Electricity Pricing',
        level: 'Power Economics',
        summary:
          'How hydro and gas-fired thermal stations are dispatched in merit order to meet active grid demand.',
        content:
          'Generating stations have different marginal operating costs depending on whether they use water (hydro) or natural gas (thermal). In wholesale dispatch, generators are stacked from lowest to highest marginal offer (Naira/MWh) until total system demand is met. The offer of the last generator needed to meet demand sets the System Marginal Price (SMP).',
        formula: 'SMP = Offer Price of Marginal Dispatched Unit (Naira/MWh)',
      },
    ];

    const simulatedReceivingVoltage = Math.max(
      0.82,
      Number((previewVoltage - (previewLoading / 100) * 0.085).toFixed(3))
    );

    return (
      <div className="h-screen w-full overflow-y-auto bg-slate-50 text-slate-900 flex flex-col font-sans">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shrink-0">
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
                Purpose &amp; Overview
              </button>
              <button
                onClick={() => setPublicSection('products')}
                className={`py-1 transition ${
                  publicSection === 'products'
                    ? 'text-[#500b50] border-b-2 border-[#500b50]'
                    : 'hover:text-slate-900'
                }`}
              >
                Projects &amp; Modules
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
                Technical Reading
              </button>
            </nav>

            <div className="flex items-center gap-2.5">
              {user ? (
                <button
                  onClick={() => setShowPublicPortal(false)}
                  className="px-4 py-2 rounded-lg bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68] transition flex items-center gap-1.5"
                >
                  <span>Open Simulation Workspace</span>
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
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-10">
          {/* SECTION 1: PURPOSE, MOTIVATION & INTERACTIVE OVERVIEW */}
          {publicSection === 'overview' && (
            <div className="space-y-10">
              {/* Hero Section with Interactive Live Corridor Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-xs">
                <div className="lg:col-span-7 space-y-4">
                  <span className="inline-block px-3 py-1 rounded-md bg-purple-50 border border-purple-200 text-[#500b50] text-xs font-bold">
                    Department of Electrical &amp; Electronics Engineering • FUT Minna
                  </span>
                  <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                    Bridging Power Engineering Theory and Nigerian Grid Operations.
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    The Nigerian National Grid faces recurring voltage stability challenges, transmission congestion, and cascading line trips. However, students and researchers across Nigerian universities rarely have access to simulation environments pre-configured with actual Nigerian 330 kV and 132 kV network data.
                  </p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Machine Learning 4 Power Systems (ML4PS) built this platform so engineers, lecturers, and students can load real MATPOWER and Pandapower network topologies, test line contingencies, inspect single-line diagrams, and study frequency stability directly in the browser.
                  </p>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    {!user && (
                      <button
                        onClick={() => {
                          setAuthModalMode('login');
                          setShowAuthModal(true);
                        }}
                        className="px-5 py-2.5 rounded-xl bg-[#500b50] text-white text-xs font-bold hover:bg-[#680f68] transition flex items-center gap-2"
                      >
                        <span>Sign In to Platform</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setPublicSection('learning')}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
                    >
                      Explore Student Learning Hub
                    </button>
                  </div>
                </div>

                {/* Live Interactive 330kV Transmission Corridor Sandbox */}
                <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-slate-900 text-white p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block font-bold">
                        Interactive Live Preview
                      </span>
                      <h3 className="text-xs font-bold text-white mt-0.5">
                        330 kV radial transmission voltage drop test
                      </h3>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        simulatedReceivingVoltage < 0.95
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {simulatedReceivingVoltage < 0.95 ? 'UNDER-VOLTAGE' : 'COMPLIANT'}
                    </span>
                  </div>

                  {/* Live SVG Transmission Schematic */}
                  <div className="bg-slate-950 rounded-lg p-3 border border-slate-800">
                    <svg viewBox="0 0 380 105" className="w-full h-24">
                      {/* Sending Bus */}
                      <rect x="24" y="22" width="8" height="55" fill="#10b981" rx="2" />
                      <text x="28" y="15" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="bold">
                        SHIRORO 330
                      </text>
                      <text x="28" y="92" textAnchor="middle" fill="#34d399" fontSize="9" fontFamily="monospace">
                        {previewVoltage.toFixed(2)} pu
                      </text>

                      {/* Transmission Line */}
                      <line
                        x1="32"
                        y1="50"
                        x2="348"
                        y2="50"
                        stroke={simulatedReceivingVoltage < 0.95 ? '#f43f5e' : '#38bdf8'}
                        strokeWidth="3"
                        strokeDasharray="6 4"
                      />
                      <rect
                        x="145"
                        y="38"
                        width="90"
                        height="22"
                        rx="4"
                        fill="#0f172a"
                        stroke="#475569"
                        strokeWidth="1.2"
                      />
                      <text
                        x="190"
                        y="52"
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {Math.round(previewLoading * 2.4)} MW Flow
                      </text>

                      {/* Receiving Bus */}
                      <rect
                        x="348"
                        y="22"
                        width="8"
                        height="55"
                        fill={simulatedReceivingVoltage < 0.95 ? '#f43f5e' : '#10b981'}
                        rx="2"
                      />
                      <text x="342" y="15" textAnchor="end" fill="#cbd5e1" fontSize="9" fontWeight="bold">
                        KATAMPE 330
                      </text>
                      <text
                        x="342"
                        y="92"
                        textAnchor="end"
                        fill={simulatedReceivingVoltage < 0.95 ? '#fb7185' : '#34d399'}
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {simulatedReceivingVoltage.toFixed(3)} pu
                      </text>
                    </svg>
                  </div>

                  {/* Interactive Controls */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-800/70 p-2.5 rounded-lg border border-slate-700">
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Sending Bus Setpoint (pu)
                      </label>
                      <div className="flex gap-1">
                        {[1.0, 1.02, 1.05].map((v) => (
                          <button
                            key={v}
                            onClick={() => setPreviewVoltage(v)}
                            className={`flex-1 py-1 rounded font-mono text-[11px] font-bold transition ${
                              previewVoltage === v
                                ? 'bg-[#500b50] text-white'
                                : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {v.toFixed(2)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-800/70 p-2.5 rounded-lg border border-slate-700">
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Corridor Loading (%)
                      </label>
                      <div className="flex gap-1">
                        {[70, 100, 140].map((ld) => (
                          <button
                            key={ld}
                            onClick={() => setPreviewLoading(ld)}
                            className={`flex-1 py-1 rounded font-mono text-[11px] font-bold transition ${
                              previewLoading === ld
                                ? 'bg-[#500b50] text-white'
                                : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {ld}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Motivation & Purpose Tabs */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      Why We Built This Platform
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Addressing practical engineering and educational gaps in the Nigerian power sector.
                    </p>
                  </div>

                  <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold gap-1">
                    <button
                      onClick={() => setActiveMotivationTab('problem')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        activeMotivationTab === 'problem'
                          ? 'bg-[#500b50] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      The Grid Challenge
                    </button>
                    <button
                      onClick={() => setActiveMotivationTab('solution')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        activeMotivationTab === 'solution'
                          ? 'bg-[#500b50] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Our Engineering Approach
                    </button>
                    <button
                      onClick={() => setActiveMotivationTab('education')}
                      className={`px-3 py-1.5 rounded-lg transition ${
                        activeMotivationTab === 'education'
                          ? 'bg-[#500b50] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Student &amp; Research Access
                    </button>
                  </div>
                </div>

                {activeMotivationTab === 'problem' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                      <h3 className="text-sm font-bold text-slate-900">
                        Understanding Voltage Collapse and Line Overloads in Nigeria
                      </h3>
                      <p>
                        Nigeria’s bulk transmission network spans long radial 330 kV and 132 kV corridors connecting hydro stations in Niger State (Kainji, Jebba, Shiroro, Zungeru) and thermal plants in the South to distant load centers in the North-West, North-East, and Lagos.
                      </p>
                      <p>
                        When a heavily loaded corridor trips on an N-1 fault, power redistributes onto parallel circuits. Without adequate reactive power (MVAR) compensation and fast governor response, bus voltages sag below 0.95 pu and trigger cascading overcurrent trips.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2 text-xs">
                      <div className="font-bold text-slate-900">Key Questions Engineers Test Here:</div>
                      <ul className="space-y-2 text-slate-600 list-disc pl-4">
                        <li>
                          Which substations violate the 0.95–1.05 pu statutory envelope when national demand scales by 120%?
                        </li>
                        <li>
                          How many MVAR of shunt capacitor compensation are required to stabilize weak buses?
                        </li>
                        <li>
                          If a critical 330 kV line trips open, which adjacent corridors overload first?
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {activeMotivationTab === 'solution' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                      <h3 className="text-sm font-bold text-slate-900">
                        Browser-Based Simulation Without Expensive Licenses
                      </h3>
                      <p>
                        Traditional power system analysis packages require costly commercial licenses or complex local installations, limiting hands-on practice for undergraduate classes and independent researchers.
                      </p>
                      <p>
                        Our platform runs a multi-stage AC power flow engine (Newton-Raphson, Iwamoto optimal damping, and Fast-Decoupled solvers) in the cloud. Approved users can open pre-verified Nigerian 330 kV and 132 kV models and run experiments in an isolated personal sandbox without altering the master files.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2 text-xs">
                      <div className="font-bold text-slate-900">Platform Capabilities:</div>
                      <ul className="space-y-2 text-slate-600 list-disc pl-4">
                        <li>
                          Interactive single-line diagram (SLD) with movable busbars and inline breaker controls.
                        </li>
                        <li>
                          Non-destructive regional expansion sandbox to test adding new substations, lines, and power plants.
                        </li>
                        <li>
                          Dynamic frequency response, multi-machine rotor angle swing curves, and economic dispatch.
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {activeMotivationTab === 'education' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                      <h3 className="text-sm font-bold text-slate-900">
                        Built for Nigerian Engineering Students and Researchers
                      </h3>
                      <p>
                        Instead of studying only textbook 3-bus or 9-bus foreign test cases, students at FUT Minna and partner institutions can analyze the 63-bus 330 kV backbone and 369-bus 132 kV sub-transmission networks alongside smaller 5-bus and 10-bus teaching models.
                      </p>
                      <p>
                        Every parameter in the workspace includes built-in engineering explanations (`?` tooltips) so students understand the physical meaning of slack voltage, power factor, governor droop, and relay trip thresholds as they adjust them.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2 text-xs">
                      <div className="font-bold text-slate-900">How Account Approval Works:</div>
                      <ul className="space-y-2 text-slate-600 list-disc pl-4">
                        <li>
                          Students and researchers submit an Access Request form with their institution and research focus.
                        </li>
                        <li>
                          Platform administrators review and approve requests to grant full simulation access.
                        </li>
                        <li>
                          Only administrators can upload new base `.m` models or promote other administrators.
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Research Group & Leadership */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    Research Leadership &amp; Engineering Team
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Machine Learning 4 Power Systems (ML4PS) Research Group, Federal University of Technology, Minna.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { name: 'Prof.Buhari', role: 'Principal Investigator', img: '/team/buhari.png' },
                    { name: 'Prof.Sadiq', role: 'Co-Principal Investigator', img: '/team/sadiq.jpg' },
                    { name: 'Prof.Ambafi', role: 'Senior Researcher', img: '/team/ambafi.jpg' },
                    { name: 'Prof.Okoro', role: 'Advisory Researcher', img: '/team/okoro.jpg' },
                    { name: 'Dr.Adamu', role: 'Power Systems Lead', img: '/team/adamu.jpg' },
                    { name: 'Engr.Hameedat', role: 'Research Engineer', img: '/team/hameedat.jpeg' },
                  ].map((member) => (
                    <div
                      key={member.name}
                      className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs flex flex-col"
                    >
                      <div className="h-36 w-full bg-slate-100 overflow-hidden">
                        <img
                          src={member.img}
                          alt={member.name}
                          className="h-full w-full object-cover object-top"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="p-3">
                        <p className="font-bold text-xs text-slate-900 truncate">{member.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: PROJECTS & SIMULATION MODULES */}
          {publicSection === 'products' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Projects &amp; Simulation Modules</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Core simulation engines and analytical workspaces developed by the ML4PS team.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-purple-50 text-[#500b50] text-[11px] font-bold">
                      Steady-State &amp; Expansion
                    </span>
                    <span className="text-xs font-mono text-slate-400">330 kV &amp; 132 kV</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    1. AC Power Flow &amp; Regional Expansion Studio
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Solves steady-state bus voltages, phase angles, active/reactive branch flows, and transmission losses. Includes a non-destructive sandbox where users can propose new substations, connect overhead lines, add generators, or isolate existing nodes without altering the base model.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px] font-bold">
                      Vector CAD
                    </span>
                    <span className="text-xs font-mono text-slate-400">Interactive SLD</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    2. Interactive Single-Line Diagram (SLD) Canvas
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Generates untangled single-line diagrams directly from uploaded network topologies. Supports smooth node dragging, parallel circuit separation, inline breaker switching, bus property inspection, and high-resolution PNG, SVG, and CSV export.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-bold">
                      Transient &amp; Protection
                    </span>
                    <span className="text-xs font-mono text-slate-400">Time-Domain ODE</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    3. Frequency Dynamics, UFLS &amp; Multi-Machine Stability
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Simulates system frequency nadir, Rate of Change of Frequency (RoCoF), 4-stage Under-Frequency Load Shedding (UFLS) relays, and multi-machine rotor angle swing trajectories following 3-phase bus faults.
                  </p>
                </div>

                <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-bold">
                      Power Economics
                    </span>
                    <span className="text-xs font-mono text-slate-400">Model-Driven Dispatch</span>
                  </div>
                  <h3 className="font-bold text-base text-slate-900">
                    4. Active-Model Economic Dispatch &amp; Tariff Analyzer
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Extracts the active generating stations and load buses directly from the loaded grid model to simulate merit-order generator dispatch, fuel cost sensitivity, market clearing prices, and nodal/regional load obligations.
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
                  Core power systems engineering concepts explained for students before running simulations.
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
                      <p className="text-[11px] text-slate-500 mt-1">{lesson.summary}</p>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 bg-white space-y-4 h-fit">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-[10px] font-bold uppercase text-[#500b50]">
                      {LESSONS[activeLesson].level}
                    </span>
                    <h3 className="font-black text-base text-slate-900 mt-0.5">
                      {LESSONS[activeLesson].title}
                    </h3>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">
                    {LESSONS[activeLesson].content}
                  </p>

                  <div className="p-3.5 rounded-xl bg-slate-900 text-white font-mono text-xs">
                    <span className="text-[10px] text-slate-400 block mb-1 font-sans uppercase font-bold">
                      Governing Equation
                    </span>
                    {LESSONS[activeLesson].formula}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: TECHNICAL READING */}
          {publicSection === 'reading' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Publications &amp; Technical Reading</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Research documentation and grid code reference material from the ML4PS group.
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
                      'Summary of NERC statutory operating envelopes: 50.0 Hz nominal frequency, 0.95–1.05 pu steady-state voltage compliance, and 4-stage Under-Frequency Load Shedding (UFLS) settings.',
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

        <footer className="bg-white border-t border-slate-200 py-5 mt-auto shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span>
              © 2026 Machine Learning 4 Power Systems (ML4PS) • Federal University of Technology, Minna
            </span>
            <span>Nigerian Electricity Supply Industry (NESI) Simulation Platform</span>
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
      <Sidebar user={user} isAdmin={isAdmin} />

      <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
        <Header
          user={user}
          isAdmin={isAdmin}
          modelName={activeModel?.name || 'No Model Selected'}
          converged={summary.converged}
          frequency={summary.frequency}
          onLogout={handleLogout}
          onOpenCompanyPortal={() => setShowPublicPortal(true)}
        />

        <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
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