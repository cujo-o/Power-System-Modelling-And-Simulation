export interface BusData {
  id: number;
  name: string;
  zone: string;
  vn_kv?: number;
  x?: number;
  y?: number;
  v_pu: number;
  va_deg: number;
  p_mw: number;
  q_mvar: number;
  is_gen?: boolean;
  is_load?: boolean;
}

export interface LineData {
  id: number;
  name: string;
  from_bus: number;
  to_bus: number;
  in_service: boolean;
  loading_percent: number;
  flow_mw: number;
  losses_mw: number;
}

export interface SimResult {
  converged: boolean;
  model_name?: string;
  frequency: number;
  total_gen_mw: number;
  total_load_mw: number;
  total_losses_mw: number;
  buses: BusData[];
  lines: LineData[];
  message?: string;
}

export interface UFLSEvent {
  stage: number;
  name: string;
  timestamp_s: number;
  frequency_at_trip: number;
  mw_shed: number;
  cumulative_shed_mw: number;
}

export interface DynamicSimResult {
  time: number[];
  frequency_ufls: number[];
  frequency_unmitigated: number[];
  rocof: number[];
  pss_output: number[];
  gov_power_mw: number[];
  metrics: {
    nadir_ufls_hz: number;
    nadir_unmitigated_hz: number;
    settling_ufls_hz: number;
    settling_unmitigated_hz: number;
    initial_rocof_hz_per_s: number;
    total_load_shed_mw: number;
    stages_tripped_count: number;
    rocf_compliant: boolean;
    nadir_compliant: boolean;
    frequency_band_compliant: boolean;
  };
  ufls_events: UFLSEvent[];
}

export interface CascadeStep {
  step: number;
  event_type: string;
  description: string;
  tripped_in_this_step: number[];
  total_tripped_so_far: number[];
  converged: boolean;
  max_loading_percent: number;
  total_losses_mw: number;
  frequency_hz: number;
}

export interface IslandDetail {
  island_id: number;
  bus_count: number;
  generation_mw: number;
  demand_mw: number;
  status: 'SYNCHRONOUS_ONLINE' | 'BLACKOUT_ISLAND' | 'DEFICIT_COLLAPSE';
  sample_buses: string[];
}

export interface CascadeResult {
  status: 'STABILIZED_POST_CONTINGENCY' | 'PARTIAL_SYSTEM_COLLAPSE' | 'TOTAL_BLACKOUT' | 'NO_MODEL';
  total_steps: number;
  timeline: CascadeStep[];
  islands: IslandDetail[];
  all_tripped_lines: number[];
  final_sol: SimResult;
  converged: boolean;
}

export interface NewBusElement {
  name: string;
  vn_kv: number;
  zone: string;
  p_mw: number;
  q_mvar: number;
}

export interface NewLineElement {
  name: string;
  from_bus: number;
  to_bus: number;
  length_km: number;
  conductor_type: string;
  vn_kv: number;
}

export interface NewGenElement {
  name: string;
  bus: number;
  p_mw: number;
  vm_pu: number;
  p_max_mw: number;
}

export interface PowerFlowVariables {
  loadMultiplier: number;
  targetPowerFactor: number;
  slackVoltagePu: number;
  shuntMvarCompensation: number;
  thermalDeratingFactor: number;
  newBuses: NewBusElement[];
  newLines: NewLineElement[];
  newGenerators: NewGenElement[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  institution: string;
  department?: string;
  role: string;
  reason?: string;
  referee?: string;
  research_tags?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  password?: string;
  temp_password?: string;
  registered_at: string;
}

export interface GeneratorDispatch {
  id: number;
  name: string;
  type: string;
  marginal_cost: number;
  dispatched_mw: number;
  max_mw: number;
  capacity_utilization: number;
  hourly_cost_ngn: number;
}

export interface MarketResult {
  converged: boolean;
  market_clearing_price_ngn: number;
  total_dispatched_mw: number;
  total_hourly_cost_ngn: number;
  hydro_share_percent: number;
  thermal_share_percent: number;
  merit_order: GeneratorDispatch[];
}

export interface GridModelMeta {
  id: string;
  name: string;
  voltage_level: string;
  domain: string;
  platform: string;
  buses: number;
  branches: number;
  total_installed_mw: number;
  total_demand_mw: number;
  converged: boolean;
  is_default: boolean;
  is_active: boolean;
}

export interface GeneratorRotorResult {
  id: string;
  name: string;
  bus_id: number;
  color: string;
  is_slack: boolean;
  H: number;
  rotor_angle_deg: number[];
  relative_angle_deg: number[];
  max_angle_deg: number;
  min_angle_deg: number;
}

export interface MultiMachineResult {
  status: 'STABLE' | 'UNSTABLE_POLE_SLIP' | 'NO_MODEL';
  fault_bus_id: number;
  fault_bus_name: string;
  fault_duration_ms: number;
  cct_ms: number;
  cct_cycles: number;
  is_transiently_stable: boolean;
  unstable_generator?: string;
  time: number[];
  generators: GeneratorRotorResult[];
  statutory_protection_limit_ms: number;
}