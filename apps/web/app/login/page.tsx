"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { clearClientAuthState } from "@/lib/auth/pos-session";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    let shouldResetLoading = true;
    try {
      // Supabase requires an email, so we append a dummy domain to the username
      const email = username.includes("@") ? username : `${username}@pos.local`;

      clearClientAuthState();
      await fetch("/api/auth/clear-session", {
        method: "POST",
        cache: "no-store",
      }).catch(() => undefined);
      await supabase.auth.signOut().catch(() => undefined);
      clearClientAuthState();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      shouldResetLoading = false;
      window.location.replace("/pos");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      if (shouldResetLoading) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/images/icon.png" alt="Icon" className="w-16 h-16 mb-4 object-contain drop-shadow-lg" />
          <img src="/images/word-logo.png" alt="POS System" className="h-8 object-contain mb-2" />
          <p className="text-slate-400 text-sm">Masuk untuk melanjutkan</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Nama Pengguna
              </label>
              <input
                id="login-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="kasir1"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white
                  placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2
                  focus:ring-brand-500/40 focus:border-brand-500/40 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Kata Sandi
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white
                  placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2
                  focus:ring-brand-500/40 focus:border-brand-500/40 transition-all"
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white
                font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                shadow-lg shadow-brand-900/30"
            >
              {loading ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          POS System © {year ?? ""}
        </p>
      </div>
    </div>
  );
}
