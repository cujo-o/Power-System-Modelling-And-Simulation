/**
 * Core domain types shared between backend API responses, GridContext, and UI views.
 */

export interface BusData {
  id: number;
  name: string;
  vn_kv?: number;
  v_pu: number;
  va_deg?: number;
  p_mw: number;
  q_mvar?: number;
  zone?: string;
  is_gen?: boolean;
  is_load?: boolean;
}

export interface LineData {
  id: number;
  name: string;
  from_bus: number;
  to_bus: number;
  length_km?: number;
  r_ohm_per_km?: number;
  x_ohm_per_km?: number;
  max_i_ka?: number;
  p_mw?: number;
  flow_mw?: number;
  losses_mw?: number;
  loading_percent: number;
  in_service?: boolean;
}

export interface GridModelMeta {
  id: string;
  name: string;
  voltage_level: string;
  platform: string;
  buses: number;
  branches: number;
  total_installed_mw: number;
  total_demand_mw: number;
  domain: string;
  is_active: boolean;
  converged?: boolean;
  is_default?: boolean;
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
  message?: string | null;
}

export interface LoadSharingAllocation {
  id: string;
  name: string;
  bus_id: number;
  rated_mw: number;
  droop_percent: number;
  participation_factor_percent: number;
  base_p_mw: number;
  allocated_delta_mw: number;
  new_p_mw: number;
  remaining_headroom_mw: number;
  exceeded_rating: boolean;
}

export interface ParallelCorridor {
  corridor: string;
  from_bus: number;
  to_bus: number;
  circuits_count: number;
  circuits: {
    line_id: number;
    name: string;
    reactance_ohm: number;
    theoretical_share_percent: number;
  }[];
}

export interface LoadSharingResult {
  model_name: string;
  nominal_frequency_hz: number;
  settling_frequency_hz: number;
  frequency_deviation_hz: number;
  load_step_mw: number;
  system_stiffness_mw_per_hz: number;
  allocations: LoadSharingAllocation[];
  parallel_corridors: ParallelCorridor[];
}

export interface MultiMachineResult {
  time: number[];
  fault_bus_id?: number;
  fault_duration_ms?: number;
  fault_start_s?: number;
  fault_clear_s?: number;
  lowest_cct_ms: number;
  system_status: 'STABLE' | 'POLE_SLIP' | 'NO_MODEL' | string;
  trajectories: {
    id: number | string;
    name: string;
    angles: number[];
  }[];
  machines: {
    id: number | string;
    name: string;
    bus_node: string | number;
    inertia_h: number | string;
    max_excursion: string | number;
    cct_ms: number;
    cct_margin_ms: number;
    status: string;
  }[];
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

export interface BusOverride {
  name?: string;
  vn_kv?: number;
  zone?: string;
  v_pu_setpoint?: number;
  shunt_mvar?: number;
  in_service?: boolean;
}

export interface LineOverride {
  name?: string;
  length_km?: number;
  r_ohm_per_km?: number;
  x_ohm_per_km?: number;
  thermal_rating_mw?: number;
  in_service?: boolean;
}

export interface GeneratorOverride {
  busId: number;
  name?: string;
  primeMover: 'Hydro' | 'Thermal (Gas)' | 'Solar / Distributed' | 'Synchronous';
  ratedMw?: number;
  activeMw?: number;
  vmPu?: number;
  waterIntakeM3s?: number;
  netHeadM?: number;
  turbineEfficiency?: number;
  gasPressureBar?: number;
  ambientTempC?: number;
  irradianceWm2?: number;
  cloudCoverPct?: number;
  inertiaH?: number;
  droopPercent?: number;
  inService?: boolean;
}

export interface LoadOverride {
  busId: number;
  name?: string;
  pMw?: number;
  qMvar?: number;
  powerFactor?: number;
  criticalInfrastructure?:
    | 'Standard Bulk Load'
    | 'Water Treatment & Pumping'
    | 'Regional Hospital Cluster'
    | 'Telecom & SCADA Hub'
    | 'Industrial Corridor';
  uflsProtected?: boolean;
  inService?: boolean;
}

export interface WideAreaScenario {
  activeEvent:
    | 'NONE'
    | 'HYDRO_FLOOD_SURGE'
    | 'GAS_PIPELINE_RUPTURE'
    | 'CYBER_SCADA_ATTACK'
    | 'DISTRIBUTED_CLOUD_TRANSIENT';
  severityPercent: number;
  autoRecoveryEnabled: boolean;
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

export interface ExtendedPowerFlowVariables extends PowerFlowVariables {
  disabledBuses?: number[];
  disabledGenerators?: number[];
  disabledLoads?: number[];
  busOverrides?: Record<number, BusOverride>;
  lineOverrides?: Record<number, LineOverride>;
  generatorOverrides?: Record<number, GeneratorOverride>;
  loadOverrides?: Record<number, LoadOverride>;
  wideAreaScenario?: WideAreaScenario;
}

export interface CascadeStep {
  step: number;
  event_type?: string;
  tripped_in_this_step: number[];
  total_tripped_so_far?: number[];
  max_loading_percent: number;
  total_losses_mw?: number;
  frequency_hz?: number;
  converged: boolean;
  description: string;
}

export interface CascadeIsland {
  island_id: number;
  bus_count: number;
  generation_mw: number;
  demand_mw: number;
  status: 'SYNCHRONOUS_ONLINE' | 'DEFICIT_COLLAPSE' | 'BLACKOUT_ISLAND' | string;
  sample_buses: string[];
}

export interface CascadeResult {
  status: string;
  total_steps: number;
  all_tripped_lines: number[];
  timeline: CascadeStep[];
  islands?: CascadeIsland[];
  converged?: boolean;
}

export interface UflsEvent {
  stage: number;
  threshold_hz: number;
  shed_mw: number;
  timestamp: number;
}

export interface DynamicSimResult {
  time: number[];
  f_unmitigated: number[];
  f_protected: number[];
  nadir_hz: number;
  initial_rocof: number;
  settling_hz: number;
  total_shed_mw: number;
  stages_tripped: number;
  ufls_events: UflsEvent[];
}
