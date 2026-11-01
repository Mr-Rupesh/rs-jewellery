"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type AuthCtx = { user: User | null; loading: boolean; signOut: () => Promise<void>; wishlist: string[]; toggleWishlist: (id: string) => Promise<void> };
const AuthContext = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {}, wishlist: [], toggleWishlist: async () => {} });
export const useAuth = () => useContext(AuthContext);

export type CartItem = { productId: string; qty: number };
type CartCtx = {
  items: CartItem[]; count: number; ready: boolean;
  add: (id: string) => void; setQty: (id: string, qty: number) => void; remove: (id: string) => void; clear: () => void;
};
const CartContext = createContext<CartCtx>({ items: [], count: 0, ready: false, add() {}, setQty() {}, remove() {}, clear() {} });
export const useCart = () => useContext(CartContext);
const KEY = "rs_cart_v1";
const MAX = 10;

export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<string[]>([]);
  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u); setLoading(false);
    if (u) {
      const profile: Record<string, unknown> = { uid: u.uid, lastLoginAt: Date.now(), joinedAt: Date.parse(u.metadata.creationTime ?? "") || Date.now() };
      if (u.email) profile.email = u.email;
      if (u.phoneNumber) profile.phone = u.phoneNumber; // never overwritten with an empty value
      void setDoc(doc(db, "users", u.uid), profile, { merge: true }).catch(() => {});
    }
    else setWishlist([]);
  }), []);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => { const w = s.data()?.wishlist; setWishlist(Array.isArray(w) ? w.filter((x): x is string => typeof x === "string") : []); }, () => {});
  }, [user]);
  const signOut = useCallback(() => fbSignOut(auth), []);
  const toggleWishlist = useCallback(async (id: string) => {
    const u = auth.currentUser;
    if (!u) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
    const has = wishlist.includes(id);
    await setDoc(doc(db, "users", u.uid), { wishlist: has ? arrayRemove(id) : arrayUnion(id) }, { merge: true });
  }, [wishlist]);

  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(raw)) setItems(raw.filter((i) => typeof i?.productId === "string" && Number.isInteger(i?.qty) && i.qty > 0).slice(0, 20));
    } catch { /* storage unavailable or corrupt: start empty */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, ready]);

  const cart = useMemo<CartCtx>(() => ({
    items, ready, count: items.reduce((a, i) => a + i.qty, 0),
    add: (id) => setItems((cur) => {
      const f = cur.find((i) => i.productId === id);
      return f ? cur.map((i) => (i.productId === id ? { ...i, qty: Math.min(MAX, i.qty + 1) } : i)) : [...cur, { productId: id, qty: 1 }];
    }),
    setQty: (id, qty) => setItems((cur) => cur.map((i) => (i.productId === id ? { ...i, qty: Math.max(1, Math.min(MAX, qty)) } : i))),
    remove: (id) => setItems((cur) => cur.filter((i) => i.productId !== id)),
    clear: () => setItems([]),
  }), [items, ready]);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, wishlist, toggleWishlist }}>
      <CartContext.Provider value={cart}>{children}</CartContext.Provider>
    </AuthContext.Provider>
  );
}
