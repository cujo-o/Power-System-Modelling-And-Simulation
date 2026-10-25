export interface BusData {
  id: number;
  name: string;
  vn_kv?: number;
  v_pu: number;
  va_deg?: number;
  p_mw: number;
  q_mvar?: number;
  zone?: string;
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
  q_mvar?: number;
  flow_mw?: number;
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
  // Hydro dynamic parameters
  waterIntakeM3s?: number;
  netHeadM?: number;
  turbineEfficiency?: number;
  // Gas thermal dynamic parameters
  gasPressureBar?: number;
  ambientTempC?: number;
  // Distributed / Renewable parameters
  irradianceWm2?: number;
  cloudCoverPct?: number;
  // Machine dynamics
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

export interface CascadeStep {
  step: number;
  tripped_in_this_step: number[];
  max_loading_percent: number;
  converged: boolean;
  description: string;
}

export interface CascadeResult {
  status: string;
  total_steps: number;
  all_tripped_lines: number[];
  timeline: CascadeStep[];
  final_buses?: BusData[];
  final_lines?: LineData[];
}

export interface UflsEvent {
  stage: number;
  threshold_hz: number;
  shed_mw: number;
  timestamp: number;
}

export interface DynamicSimResult {
  time: number[];
  f_unmitigated?: number[];
  f_protected?: number[];
  frequency_unmitigated?: number[];
  frequency_ufls?: number[];
  nadir_hz?: number;
  nadir?: number;
  initial_rocof?: number;
  rocof?: number;
  settling_hz?: number;
  total_shed_mw?: number;
  stages_tripped?: number;
  ufls_events?: UflsEvent[];
  metrics?: {
    nadir?: number;
    nadir_hz?: number;
    rocof?: number;
    initial_rocof?: number;
    settling_hz?: number;
    total_shed_mw?: number;
    stages_tripped?: number;
  };
}