// ──────────────────────────────────────────────
// API client — wraps fetch with auth & refresh logic
// ──────────────────────────────────────────────

import { useAuthStore } from '@/store/authStore';
import { useSocketStore } from '@/store/socketStore';
import type { ApiResponse } from '@messenger/shared';

const getApiUrl = () => {
  const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
};

export const API_URL = getApiUrl();

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.map((cb) => cb(token));
  refreshSubscribers = [];
};

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

  if (body && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const url = `${API_URL}${endpoint}`;

  const fetchOptions: RequestInit = {
    ...rest,
    headers,
    body: isFormData ? (body as any) : body ? JSON.stringify(body) : undefined,
    credentials: 'include', // Important for httpOnly cookies
  };

  let response = await fetch(url, fetchOptions);

  // ── Auto-refresh on 401 ──
  if (response.status === 401 && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
    if (!isRefreshing) {
      isRefreshing = true;
      const refreshed = await tryRefresh();
      if (refreshed) {
        const newToken = useAuthStore.getState().accessToken!;
        isRefreshing = false;
        onTokenRefreshed(newToken);
      } else {
        isRefreshing = false;
        useAuthStore.getState().logout();
        throw new Error('Session expired');
      }
    }

    // Return a promise that resolves when the token is refreshed
    return new Promise((resolve) => {
      subscribeTokenRefresh(async (newToken: string) => {
        // Retry with new token
        const newHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        const newOptions = { ...fetchOptions, headers: newHeaders };
        const retryResponse = await fetch(url, newOptions);
        resolve((await retryResponse.json()) as ApiResponse<T>);
      });
    });
  }

  // Handle errors like 500 or 404 that might not return JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as ApiResponse<T>;
  } else {
    return { data: null, error: response.statusText } as any;
  }
}

async function tryRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const json = (await response.json()) as ApiResponse<{
      accessToken: string;
    }>;

    if (json.data?.accessToken) {
      const { accessToken } = json.data;
      useAuthStore.getState().setTokens(accessToken);
      
      // Update socket token
      const socket = useSocketStore.getState().socket;
      if (socket) {
        socket.auth = { token: accessToken };
        // We don't necessarily need to reconnect immediately, 
        // but the next reconnection will use the new token.
      }

      return true;
    }

    return false;
  } catch (err) {
    console.error('[API] Refresh error:', err);
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
