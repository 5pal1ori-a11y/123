"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { VendixLogo } from "@/components/ui/vendix-logo";

export function PlatformAdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/platform/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "로그인 실패");
      router.push("/platform-admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="glass-thick landing-shadow p-8">
        <VendixLogo size={48} className="mb-4" />
        <p className="text-xs uppercase tracking-widest text-neutral-500">Platform Admin</p>
        <h1 className="mt-2 text-2xl font-bold">DOES 관리</h1>
        <p className="mt-1 text-sm text-neutral-400">플랫폼 관리자 로그인</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block space-y-2">
            <span className="flex items-center gap-1 text-sm text-neutral-400">
              <User className="size-4" /> 아이디
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="admin-input"
              autoComplete="username"
              required
            />
          </label>
          <label className="block space-y-2">
            <span className="flex items-center gap-1 text-sm text-neutral-400">
              <Lock className="size-4" /> 비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-input"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button type="submit" disabled={loading} className="landing-btn w-full disabled:opacity-40">
            {loading ? <Loader2 className="mx-auto size-4 animate-spin" /> : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
