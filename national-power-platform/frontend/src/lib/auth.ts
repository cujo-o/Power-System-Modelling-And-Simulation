/**
 * Platform authentication and cross-device access request helpers.
 * Coordinates Supabase (`access_requests` table + fallback system row), backend
 * auth endpoints, and localStorage session persistence.
 */

import { supabase } from '@/lib/supabase';
import { API_BASE, fetchWithTimeout } from '@/lib/apiClient';

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  institution?: string;
}

export interface AccessRequestRecord {
  id: string;
  full_name: string;
  email: string;
  institution: string;
  reason: string;
  password?: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export const SYSTEM_REQ_ROW_NAME = '__ml4ps_access_requests__';

const ENV_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ENV_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';

export function isConfiguredAdminRole(
  role?: string,
  isAdminFlag?: boolean,
  email?: string
): boolean {
  if (isAdminFlag) return true;
  if (email && ENV_ADMIN_EMAILS.includes(email.trim().toLowerCase())) return true;
  const normalized = String(role || '').trim().toLowerCase();
  return ['admin', 'administrator', 'superuser', 'operator'].includes(normalized);
}

export function getCurrentUserKey(): string {
  if (typeof window === 'undefined') return 'guest';
  try {
    const raw = localStorage.getItem('ml4ps_user') || localStorage.getItem('nesi_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      return String(parsed.email || parsed.username || 'guest').toLowerCase();
    }
  } catch {}
  return 'guest';
}

export function readStoredSession(): PlatformUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('ml4ps_user') || localStorage.getItem('nesi_user');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const email = String(parsed.email || '').trim().toLowerCase();
    if (!email) return null;
    const role: 'admin' | 'user' = isConfiguredAdminRole(
      parsed.role,
      parsed.isAdmin || parsed.is_admin,
      email
    )
      ? 'admin'
      : 'user';
    return {
      id: String(parsed.id || 'usr-1'),
      name: String(parsed.name || parsed.username || email.split('@')[0]),
      email,
      role,
      institution: String(parsed.institution || 'FUT Minna'),
    };
  } catch {
    return null;
  }
}

export function persistSession(user: PlatformUser | null): void {
  if (typeof window === 'undefined') return;
  if (!user) {
    localStorage.removeItem('ml4ps_user');
    localStorage.removeItem('nesi_user');
    return;
  }
  const serialized = JSON.stringify(user);
  localStorage.setItem('ml4ps_user', serialized);
  localStorage.setItem('nesi_user', serialized);
}

function normalizeRequestRecord(r: Record<string, unknown>): AccessRequestRecord {
  const email = String(r.email || '').trim().toLowerCase();
  const statusRaw = String(r.status || 'pending').toLowerCase();
  const status: AccessRequestRecord['status'] =
    statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';

  return {
    id: String(r.id || `req-${Date.now()}`),
    full_name: String(r.full_name || r.name || email.split('@')[0] || 'User'),
    email,
    institution: String(r.institution || 'Independent'),
    reason: String(r.reason || ''),
    password: typeof r.password === 'string' ? r.password : '',
    role: isConfiguredAdminRole(String(r.role || ''), Boolean(r.is_admin), email) ? 'admin' : 'user',
    status,
    created_at: String(r.created_at || new Date().toISOString()),
  };
}

/**
 * Fetches access requests from Supabase, backend fallback store, and localStorage.
 * Returns `remoteReachable` so callers never mistake a network error for an empty database.
 */
export async function fetchAllPlatformAccessRequests(): Promise<{
  requests: AccessRequestRecord[];
  remoteReachable: boolean;
}> {
  const mapByEmail = new Map<string, AccessRequestRecord>();
  let remoteReachable = false;

  const ingest = (items: unknown[]) => {
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const rec = normalizeRequestRecord(item as Record<string, unknown>);
      if (rec.email && !mapByEmail.has(rec.email)) {
        mapByEmail.set(rec.email, rec);
      }
    });
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        remoteReachable = true;
        ingest(data);
      }
    } catch {}

    try {
      const { data: sysRow, error } = await supabase
        .from('grid_models')
        .select('*')
        .eq('name', SYSTEM_REQ_ROW_NAME)
        .maybeSingle();
      if (!error) remoteReachable = true;
      const rawPayload = sysRow?.network_payload || sysRow?.payload || sysRow?.domain;
      if (rawPayload) {
        const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
        if (Array.isArray(parsed)) ingest(parsed);
      }
    } catch {}
  }

  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/admin/requests`, {}, 10_000);
    if (res.ok) {
      remoteReachable = true;
      const list = await res.json();
      if (Array.isArray(list)) ingest(list);
    }
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      const local = JSON.parse(localStorage.getItem('ml4ps_access_requests') || '[]');
      if (Array.isArray(local)) ingest(local);
    } catch {}
  }

  return { requests: Array.from(mapByEmail.values()), remoteReachable };
}

/**
 * Persists a newly submitted or updated access request across localStorage,
 * Supabase, and the backend fallback endpoint.
 */
export async function persistPlatformAccessRequest(
  record: AccessRequestRecord,
  allRecords?: AccessRequestRecord[]
): Promise<void> {
  const existing = allRecords ?? (await fetchAllPlatformAccessRequests()).requests;
  const merged = [
    record,
    ...existing.filter((r) => r.email.toLowerCase() !== record.email.toLowerCase()),
  ];

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('ml4ps_access_requests', JSON.stringify(merged));
    } catch {}
  }

  if (supabase) {
    try {
      await supabase.from('access_requests').upsert([record], { onConflict: 'email' });
    } catch {}

    try {
      const { data: existingSys } = await supabase
        .from('grid_models')
        .select('id')
        .eq('name', SYSTEM_REQ_ROW_NAME)
        .maybeSingle();

      const serialized = JSON.stringify(merged);
      if (existingSys?.id) {
        await supabase
          .from('grid_models')
          .update({ network_payload: serialized })
          .eq('id', existingSys.id);
      } else {
        await supabase.from('grid_models').insert([
          {
            id: SYSTEM_REQ_ROW_NAME,
            name: SYSTEM_REQ_ROW_NAME,
            voltage_level: 'SYS',
            platform: 'SYSTEM',
            buses: 0,
            branches: 0,
            is_active: false,
            network_payload: serialized,
          },
        ]);
      }
    } catch {}
  }

  try {
    await fetchWithTimeout(
      `${API_BASE}/api/auth/request-access`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      },
      10_000
    );
  } catch {}
}

/**
 * Verifies user credentials across environment admin settings, Supabase Auth,
 * the cross-device access request store, and the backend `/api/auth/login` endpoint.
 */
export async function authenticateUser(
  rawEmail: string,
  password: string
): Promise<{ user?: PlatformUser; error?: string }> {
  const cleanEmail = rawEmail.trim().toLowerCase();

  if (
    ENV_ADMIN_EMAILS.includes(cleanEmail) &&
    (!ENV_ADMIN_PASSWORD || password === ENV_ADMIN_PASSWORD)
  ) {
    return {
      user: {
        id: 'env-admin',
        name: cleanEmail.split('@')[0],
        email: cleanEmail,
        role: 'admin',
      },
    };
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (!error && data?.user) {
        const meta = data.user.user_metadata || {};
        const isAdm = isConfiguredAdminRole(meta.role, meta.is_admin, cleanEmail);
        return {
          user: {
            id: data.user.id,
            name: meta.full_name || meta.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: isAdm ? 'admin' : 'user',
            institution: meta.institution || '',
          },
        };
      }
    } catch {}
  }

  const { requests } = await fetchAllPlatformAccessRequests();
  const found = requests.find((r) => r.email.toLowerCase() === cleanEmail);

  if (found) {
    if (found.status === 'pending') {
      return { error: 'Your account request is pending administrator approval.' };
    }
    if (found.status === 'rejected') {
      return { error: 'Your account request was declined by an administrator.' };
    }
    if (found.password && found.password !== password) {
      return { error: 'Incorrect password.' };
    }
    return {
      user: {
        id: found.id,
        name: found.full_name,
        email: cleanEmail,
        role: found.role,
        institution: found.institution,
      },
    };
  }

  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      },
      15_000
    );

    if (res.ok) {
      const data = await res.json();
      const userObj = data.user || data;
      const isAdm = isConfiguredAdminRole(
        userObj.role,
        userObj.is_admin || userObj.isAdmin,
        cleanEmail
      );
      return {
        user: {
          id: String(userObj.id || `usr-${Date.now()}`),
          name: userObj.name || userObj.full_name || cleanEmail.split('@')[0],
          email: cleanEmail,
          role: isAdm ? 'admin' : 'user',
          institution: userObj.institution || '',
        },
      };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      error:
        errData?.detail ||
        'Account not found or not yet approved. Use Request Access to apply.',
    };
  } catch {
    return { error: 'Could not connect to server. Check your internet connection.' };
  }
}

/**
 * Submits a new operator access request. If the remote store is reachable and
 * has zero approved admins and zero existing requests, bootstraps the first
 * account as the initial platform administrator.
 */
export async function submitAccessRequest(params: {
  fullName: string;
  email: string;
  institution: string;
  reason: string;
  password: string;
}): Promise<{ autoApprovedUser?: PlatformUser; submitted: boolean }> {
  const { requests: existing, remoteReachable } = await fetchAllPlatformAccessRequests();
  const hasApprovedAdmin = existing.some((r) => r.status === 'approved' && r.role === 'admin');
  const isFirstBootstrapAdmin = remoteReachable && !hasApprovedAdmin && existing.length === 0;

  const newRecord: AccessRequestRecord = {
    id: `req-${Date.now()}`,
    full_name: params.fullName.trim(),
    email: params.email.trim().toLowerCase(),
    institution: params.institution.trim() || 'FUT Minna',
    reason: params.reason.trim() || 'Power System Simulation',
    password: params.password,
    role: isFirstBootstrapAdmin ? 'admin' : 'user',
    status: isFirstBootstrapAdmin ? 'approved' : 'pending',
    created_at: new Date().toISOString(),
  };

  await persistPlatformAccessRequest(newRecord, existing);

  if (isFirstBootstrapAdmin) {
    return {
      submitted: true,
      autoApprovedUser: {
        id: newRecord.id,
        name: newRecord.full_name,
        email: newRecord.email,
        role: 'admin',
        institution: newRecord.institution,
      },
    };
  }

  return { submitted: true };
}
