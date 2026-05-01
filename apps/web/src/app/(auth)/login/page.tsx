'use client';

// ──────────────────────────────────────────────
// Login page — /login
// ──────────────────────────────────────────────

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput, type User } from '@messenger/shared';
import { useAuthStore } from '@/store/authStore';
import { setAuthCookie } from '@/lib/cookies';
import { api } from '@/lib/api';

interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);

    const result = await api.post<LoginResponse>('/auth/login', data);

    if (result.error) {
      setServerError(result.error);
      return;
    }

    if (result.data) {
      setAuth(result.data.user, result.data.accessToken, result.data.refreshToken);
      setAuthCookie(result.data.accessToken);
      router.push(redirect);
    }
  };

  return (
    <div className="rounded-2xl bg-secondary border border-border p-8">
      {/* ── Header ── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-accent">
            <path
              d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
        <p className="text-text-muted text-sm mt-1">Sign in to your account</p>
      </div>

      {/* ── Server error ── */}
      {serverError && (
        <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-danger text-sm animate-fade-in">
          {serverError}
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-text-muted mb-1.5">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="input-field"
            {...register('email')}
          />
          {errors.email && <p className="error-text">{errors.email.message}</p>}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-text-muted mb-1.5">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            className="input-field"
            {...register('password')}
          />
          {errors.password && <p className="error-text">{errors.password.message}</p>}
        </div>

        {/* Submit */}
        <button
          id="login-submit"
          type="submit"
          disabled={isSubmitting}
          className="btn-primary mt-2"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Signing in...
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {/* ── Footer ── */}
      <p className="text-center text-text-muted text-sm mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-accent hover:underline font-medium">
          Create one
        </Link>
      </p>
    </div>
  );
}
