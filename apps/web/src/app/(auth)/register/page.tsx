'use client';

// ──────────────────────────────────────────────
// Register page — /register
// ──────────────────────────────────────────────

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput, type User } from '@messenger/shared';
import { useAuthStore } from '@/store/authStore';
import { setAuthCookie } from '@/lib/cookies';
import { api } from '@/lib/api';

interface RegisterResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);

    const result = await api.post<RegisterResponse>('/auth/register', data);

    if (result.error) {
      setServerError(result.error);
      return;
    }

    if (result.data) {
      setAuth(result.data.user, result.data.accessToken, result.data.refreshToken);
      setAuthCookie(result.data.accessToken);
      router.push('/');
    }
  };

  return (
    <div className="rounded-2xl bg-secondary border border-border p-8">
      {/* ── Header ── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-accent">
            <path
              d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
            <line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Create account</h1>
        <p className="text-text-muted text-sm mt-1">Join the conversation</p>
      </div>

      {/* ── Server error ── */}
      {serverError && (
        <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-danger text-sm animate-fade-in">
          {serverError}
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Username */}
        <div>
          <label htmlFor="register-username" className="block text-sm font-medium text-text-muted mb-1.5">
            Username
          </label>
          <input
            id="register-username"
            type="text"
            placeholder="johndoe"
            autoComplete="username"
            className="input-field"
            {...register('username')}
          />
          {errors.username && <p className="error-text">{errors.username.message}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="register-email" className="block text-sm font-medium text-text-muted mb-1.5">
            Email
          </label>
          <input
            id="register-email"
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
          <label htmlFor="register-password" className="block text-sm font-medium text-text-muted mb-1.5">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            placeholder="Min. 6 characters"
            autoComplete="new-password"
            className="input-field"
            {...register('password')}
          />
          {errors.password && <p className="error-text">{errors.password.message}</p>}
        </div>

        {/* Submit */}
        <button
          id="register-submit"
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
              Creating account...
            </span>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      {/* ── Footer ── */}
      <p className="text-center text-text-muted text-sm mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
