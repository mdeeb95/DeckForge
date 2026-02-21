const BASE = '/api/v1/admin';

function getCsrfToken(): string {
  const match = document.cookie.match(/deckforge_csrf=([^;]+)/);
  return match ? match[1] : '';
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  // Add CSRF token to state-changing requests
  if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  if (res.status === 401) {
    window.location.hash = '#/login';
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export const adminApi = {
  // Auth
  login: (password: string) => api<{ ok: boolean; csrf_token: string }>('/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => api('/logout', { method: 'POST' }),
  checkSession: () => api<{ authenticated: boolean }>('/me'),

  // Dashboard
  getStats: () => api<{ total_users: number; active_users: number; total_invites: number; total_predictions: number }>('/stats'),
  getRecentUsers: () => api<UserData[]>('/recent-users'),
  getAuditLog: () => api<AuditEntry[]>('/audit-log'),

  // Users (paginated)
  getUsers: (page = 1, perPage = 50) => api<PaginatedResponse<UserData>>(`/users?page=${page}&per_page=${perPage}`),
  toggleActive: (id: string) => api<UserData>(`/users/${id}/toggle-active`, { method: 'POST' }),
  toggleAdmin: (id: string) => api<UserData>(`/users/${id}/toggle-admin`, { method: 'POST' }),

  // Invites (paginated)
  getInvites: (page = 1, perPage = 50) => api<PaginatedResponse<InviteData>>(`/invites?page=${page}&per_page=${perPage}`),
  generateInvites: (count: number, maxUses: number, note: string) =>
    api<InviteData[]>('/invites/generate', {
      method: 'POST',
      body: JSON.stringify({ count, max_uses: maxUses, note }),
    }),
  toggleInviteActive: (id: string) => api<InviteData>(`/invites/${id}/toggle-active`, { method: 'POST' }),
};

export interface UserData {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_admin: boolean;
  invite_code_used: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  app_version: string | null;
}

export interface InviteData {
  id: string;
  code: string;
  max_uses: number;
  times_used: number;
  is_active: boolean;
  expires_at: string | null;
  note: string | null;
  created_at: string | null;
}

export interface AuditEntry {
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string | null;
  created_at: string;
}
