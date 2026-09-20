import { SimResult, DynamicSimResult, MarketResult, GridModelMeta, UserAccount } from '@/types/grid';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com';

export const api = {
  async getModels(): Promise<GridModelMeta[]> {
    const res = await fetch(`${API_BASE}/api/models`);
    return res.json();
  },
  async activateModel(id: string) {
    const res = await fetch(`${API_BASE}/api/models/${id}/activate`, { method: 'POST' });
    return res.json();
  },
  async resetGrid() {
    const res = await fetch(`${API_BASE}/api/grid/reset`, { method: 'POST' });
    return res.json();
  },
  async runPowerFlow(multiplier: number, outages: number[]): Promise<SimResult> {
    const res = await fetch(`${API_BASE}/api/simulate/power-flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ load_multiplier: multiplier, tripped_lines: outages }),
    });
    return res.json();
  },
  async runDynamics(disturbance: number, governor: boolean, pss: boolean): Promise<DynamicSimResult> {
    const res = await fetch(`${API_BASE}/api/simulate/dynamics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disturbance_mw: disturbance,
        inertia_constant_H: 4.5,
        enable_governor: governor,
        droop_R: 0.05,
        enable_pss: pss,
        pss_gain_K: 25.0,
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
    return res.json();
  },
  async getUsers(): Promise<UserAccount[]> {
    const res = await fetch(`${API_BASE}/api/admin/users`);
    return res.json();
  },
  async approveUser(id: string) {
    const res = await fetch(`${API_BASE}/api/admin/users/${id}/approve`, { method: 'POST' });
    return res.json();
  },
  async rejectUser(id: string) {
    const res = await fetch(`${API_BASE}/api/admin/users/${id}/reject`, { method: 'POST' });
    return res.json();
  },
  async deleteModel(id: string) {
    const res = await fetch(`${API_BASE}/api/models/${id}`, { method: 'DELETE' });
    return res.json();
  },
};