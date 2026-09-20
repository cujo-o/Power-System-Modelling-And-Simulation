export interface BusData {
  id: number;
  name: string;
  zone: string;
  x?: number;
  y?: number;
  v_pu: number;
  va_deg: number;
  p_mw: number;
  q_mvar: number;
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

export interface DynamicSimResult {
  time: number[];
  frequency: number[];
  rocof: number[];
  pss_output: number[];
  metrics: {
    nadir_hz: number;
    settling_hz: number;
    initial_rocof_hz_per_s: number;
    ufls_triggered: boolean;
  };
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  institution: string;
  role: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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