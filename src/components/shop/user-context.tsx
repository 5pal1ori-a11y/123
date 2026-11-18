"use client";

import {
  createContext,
  useCallback, useRef,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/types";
import { shopHeaders } from "@/lib/shop-client";
import { SessionIdleGuard } from "@/components/session-idle-guard";

type Ctx = {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Apply user from login/register response immediately (before cookie round-trip). */
  setUser: (user: PublicUser | null) => void;
  logout: () => Promise<void>;
};

const UserContext = createContext<Ctx>({
  user: null,
  loading: true,
  refresh: async () => {},
  setUser: () => {},
  logout: async () => {},
});

export function ShopUserProvider({
  shopSlug,
  children,
}: {
  shopSlug: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const liveRef = useRef<{ userId: string; points: number; at: number } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/user/me", {
        credentials: "include",
        headers: shopHeaders(shopSlug),
      });
      const data = (await res.json()) as { user?: PublicUser | null };
      const fetched = data.user ?? null;
      // 방금 실시간으로 받은 잔액보다 낮은 옛 값이 오면 (저장소 반영이 늦을 때) 실시간 값을 유지한다
      const live = liveRef.current;
      if (fetched && live && live.userId === fetched.id && Date.now() - live.at < 120_000 && fetched.points < live.points) {
        setUser({ ...fetched, points: live.points });
      } else {
        setUser(fetched);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 충전 완료 실시간 알림 → 잔액을 바로 바꾼다
  useEffect(() => {
    const onCharge = (e: Event) => {
      const d = (e as CustomEvent<{ points?: number }>).detail;
      if (typeof d?.points !== "number") return;
      setUser((prev) => {
        if (!prev) return prev;
        liveRef.current = { userId: prev.id, points: d.points!, at: Date.now() };
        return { ...prev, points: d.points! };
      });
    };
    window.addEventListener("does-live:charge", onCharge);
    return () => window.removeEventListener("does-live:charge", onCharge);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/user/me", {
      method: "DELETE",
      credentials: "include",
      headers: shopHeaders(shopSlug),
    });
    setUser(null);
    router.refresh();
  }, [shopSlug, router]);

  const sessionPing = useCallback(() => {
    void fetch("/api/auth/user/me", {
      credentials: "include",
      headers: shopHeaders(shopSlug),
    });
  }, [shopSlug]);

  return (
    <UserContext.Provider value={{ user, loading, refresh, setUser, logout }}>
      {/* 로그인 유지: 미활동으로 로그아웃하지 않고, 활동 시 세션만 자동 연장한다 */}
      <SessionIdleGuard enabled={Boolean(user)} onIdle={() => {}} onPing={sessionPing} />
      {children}
    </UserContext.Provider>
  );
}

export function useShopUser() {
  return useContext(UserContext);
}
