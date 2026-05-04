// ──────────────────────────────────────────────
// API client — wraps fetch with auth & refresh logic
// ──────────────────────────────────────────────

import { useAuthStore } from '@/store/authStore';
import type { ApiResponse } from '@messenger/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { body, headers: customHeaders, ...rest } = options;
  const accessToken = useAuthStore.getState().accessToken;

  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const url = `${API_URL}${endpoint}`;

  let response = await fetch(url, {
    ...rest,
    headers,
    body: isFormData ? (body as any) : body ? JSON.stringify(body) : undefined,
  });

  // ── Auto-refresh on 401 ──
  if (response.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry with new token
      headers['Authorization'] = `Bearer ${useAuthStore.getState().accessToken}`;
      response = await fetch(url, {
        ...rest,
        headers,
        body: isFormData ? (body as any) : body ? JSON.stringify(body) : undefined,
      });
    }
  }

  const json = (await response.json()) as ApiResponse<T>;
  return json;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    useAuthStore.getState().logout();
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      useAuthStore.getState().logout();
      return false;
    }

    const json = (await response.json()) as ApiResponse<{
      accessToken: string;
      refreshToken: string;
    }>;

    if (json.data) {
      useAuthStore.getState().setTokens(json.data.accessToken, json.data.refreshToken);
      return true;
    }

    useAuthStore.getState().logout();
    return false;
  } catch {
    useAuthStore.getState().logout();
    return false;
  }
}

// ── Convenience methods ──

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body }),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
