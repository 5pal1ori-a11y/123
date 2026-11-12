"use client";

import {
  createContext,
  useCallback,
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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/user/me", {
        credentials: "include",
        headers: shopHeaders(shopSlug),
      });
      const data = (await res.json()) as { user?: PublicUser | null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      <SessionIdleGuard enabled={Boolean(user)} onIdle={() => void logout()} onPing={sessionPing} />
      {children}
    </UserContext.Provider>
  );
}

export function useShopUser() {
  return useContext(UserContext);
}
