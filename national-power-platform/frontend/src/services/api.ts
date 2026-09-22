import {
  SimResult,
  DynamicSimResult,
  MarketResult,
  GridModelMeta,
  UserAccount,
  PowerFlowVariables,
  CascadeResult,
  MultiMachineResult,
} from '@/types/grid';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

export const api = {
  async getModels(): Promise<GridModelMeta[]> {
    const res = await fetch(`${API_BASE}/api/models`);
    return res.json();
  },
  async loadPayload(data: {
    id: string;
    name: string;
    voltage_level?: string;
    domain?: string;
    platform?: string;
    network_payload: string;
  }) {
    const res = await fetch(`${API_BASE}/api/models/load-payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to load model payload');
    }
    return res.json();
  },
  async activateModel(id: string) {
    const res = await fetch(`${API_BASE}/api/models/${id}/activate`, { method: 'POST' });
    return res.json();
  },
  async deleteModel(id: string) {
    const res = await fetch(`${API_BASE}/api/models/${id}`, { method: 'DELETE' });
    return res.json();
  },
  async resetGrid() {
    const res = await fetch(`${API_BASE}/api/grid/reset`, { method: 'POST' });
    return res.json();
  },
  async runPowerFlow(vars: PowerFlowVariables, outages: number[]): Promise<SimResult> {
    const res = await fetch(`${API_BASE}/api/simulate/power-flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        load_multiplier: vars.loadMultiplier,
        target_power_factor: vars.targetPowerFactor,
        slack_voltage_pu: vars.slackVoltagePu,
        shunt_mvar_compensation: vars.shuntMvarCompensation,
        thermal_derating_factor: vars.thermalDeratingFactor,
        tripped_lines: outages,
        new_buses: vars.newBuses,
        new_lines: vars.newLines,
        new_generators: vars.newGenerators,
      }),
    });
    return res.json();
  },
  async runCascade(data: {
    initial_tripped_lines: number[];
    overload_threshold_percent: number;
    max_cascade_steps?: number;
    load_multiplier: number;
    slack_voltage_pu: number;
  }): Promise<CascadeResult> {
    const res = await fetch(`${API_BASE}/api/simulate/cascade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 async runDynamics(data: {
    disturbance_mw: number;
    inertia_constant_H: number;
    damping_coefficient_D?: number;
    enable_governor: boolean;
    droop_R: number;
    enable_pss: boolean;
    pss_gain_K: number;
    enable_ufls: boolean;
    sim_duration_s?: number;
  }): Promise<DynamicSimResult> {
    const res = await fetch(`${API_BASE}/api/simulate/dynamics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disturbance_mw: data.disturbance_mw,
        inertia_constant_H: data.inertia_constant_H,
        damping_coefficient_D: data.damping_coefficient_D || 1.8,
        enable_governor: data.enable_governor,
        droop_R: data.droop_R,
        enable_pss: data.enable_pss,
        pss_gain_K: data.pss_gain_K,
        enable_ufls: data.enable_ufls,
        sim_duration_s: data.sim_duration_s || 12.0,
      }),
    });
    return res.json();
  },
  async runMarket(multiplier: number, gasFactor: number, hydroAvail: number, outages: number[]): Promise<MarketResult> {
    const res = await fetch(`${API_BASE}/api/simulate/market-dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        load_multiplier: multiplier,
        gas_price_factor: gasFactor,
        hydro_availability: hydroAvail,
        tripped_lines: outages,
      }),
    });
    return res.json();
  },
  async uploadModel(formData: FormData) {
    const res = await fetch(`${API_BASE}/api/upload/model`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Model parsing failed');
    }
    return res.json();
  },
  async getUsers(): Promise<UserAccount[]> {
    const res = await fetch(`${API_BASE}/api/admin/users`);
    return res.json();
  },
  async registerUser(data: {
    name: string;
    email: string;
    institution: string;
    department: string;
    reason: string;
    referee?: string;
    research_tags?: string;
  }) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Registration failed');
    }
    return res.json();
  },
  async loginUser(email: string, password: string): Promise<{ status: string; user: UserAccount }> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Login failed');
    }
    return res.json();
  },
  async approveUser(id: string) {
    const res = await fetch(`${API_BASE}/api/admin/users/${id}/approve`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Approval failed');
    }
    return res.json();
  },
  async rejectUser(id: string) {
    const res = await fetch(`${API_BASE}/api/admin/users/${id}/reject`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Rejection failed');
    }
    return res.json();
  },
  async runMultiMachine(data: {
    fault_bus_id: number;
    fault_duration_ms: number;
    fault_start_time_s?: number;
    sim_duration_s?: number;
    calc_cct?: boolean;
  }): Promise<MultiMachineResult> {
    const res = await fetch(`${API_BASE}/api/simulate/multi-machine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
};