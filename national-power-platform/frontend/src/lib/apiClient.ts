/**
 * Centralized HTTP client for the FastAPI simulation backend.
 * Handles cold-start gateway retries (502/503/504), request timeouts, and
 * structured error extraction across all frontend views.
 */

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || 'https://national-power-backend.onrender.com'
).replace(/\/+$/, '');

export const REQUEST_TIMEOUT_MS = 45_000;
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const NO_MODEL_RE =
  /no\s+(active\s+)?model|model\s+(is\s+)?not\s+(loaded|active)|no\s+network\s+(loaded|active)|select\s+(a|the)\s+model/i;

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  body: T;
  message: string;
  noModel: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(
  path: string,
  options?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  let lastError: unknown = null;
  let lastGatewayRes: Response | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}${cleanPath}`, options, timeoutMs);
      if (!GATEWAY_STATUSES.has(res.status)) return res;
      lastGatewayRes = res;
    } catch (err) {
      lastError = err;
    }
    if (attempt === 0) await sleep(2000);
  }

  if (lastGatewayRes) return lastGatewayRes;
  throw lastError || new Error('Connection to solver backend failed.');
}

async function readResponseBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function extractBodyMessage(body: Record<string, unknown>): string {
  const raw = body?.detail ?? body?.message ?? body?.error;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map((item) => (item as { msg?: string })?.msg || JSON.stringify(item)).join('; ');
  }
  return raw ? JSON.stringify(raw) : '';
}

export async function callApi<T = Record<string, unknown>>(
  path: string,
  options?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<ApiResult<T>> {
  const res = await apiFetch(path, options, timeoutMs);
  const body = await readResponseBody(res);
  const message = extractBodyMessage(body);
  const statusTag = typeof body?.system_status === 'string' ? body.system_status : typeof body?.status === 'string' ? body.status : '';

  return {
    ok: res.ok,
    status: res.status,
    body: body as T,
    message,
    noModel: NO_MODEL_RE.test(message) || statusTag === 'NO_MODEL',
  };
}

export function describeNetworkError(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
    return 'The solver took too long to respond (backend waking up). Click Solve to retry.';
  }
  return 'Cannot reach the solver backend. Check your connection and retry.';
}
