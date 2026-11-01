"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { notify, playChime } from "@/lib/chime";

const TABS = [
  ["/admin/dashboard", "Orders"], ["/admin/products", "Products"], ["/admin/customers", "Customers"], ["/admin/inquiries", "Inquiries"],
  ["/admin/returns", "Returns"], ["/admin/support", "Support"], ["/admin/settings", "Gold rates"], ["/admin/store", "Store pages"],
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [state, setState] = useState<"checking" | "yes" | "no">("checking");
  const [badge, setBadge] = useState({ inquiries: 0, returns: 0, support: 0 });

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login?next=/admin/dashboard"); return; }
    (async () => {
      try {
        const first = await user.getIdTokenResult(true);
        // The owner's email may be on the server's private admin list: ask the server to grant (or withdraw) the permission.
        let changed = false;
        try {
          const res = await fetch("/api/auth/sync-admin", { method: "POST", headers: { Authorization: `Bearer ${first.token}` } });
          changed = Boolean(((await res.json().catch(() => ({}))) as { changed?: boolean }).changed);
        } catch { /* offline: keep what the token says */ }
        const latest = changed ? await user.getIdTokenResult(true) : first;
        setState(latest.claims.admin === true ? "yes" : "no");
      } catch { setState("no"); }
    })();
  }, [user, loading, router]);

  // Live badges, plus a chime on any admin page for a new inquiry or support message
  useEffect(() => {
    if (state !== "yes") return;
    let firstInq = true, firstSup = true, prevSup = 0;
    const off = [
      onSnapshot(query(collection(db, "custom_inquiries"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
        setBadge((b) => ({ ...b, inquiries: snap.docs.filter((d) => d.data().status === "NEW").length }));
        if (!firstInq) {
          const added = snap.docChanges().find((c) => c.type === "added");
          if (added) { playChime(); notify("New custom design inquiry", String(added.doc.data().name ?? "")); }
        }
        firstInq = false;
      }, () => {}),
      onSnapshot(query(collection(db, "returns"), where("status", "==", "REQUESTED")), (s) => setBadge((b) => ({ ...b, returns: s.size })), () => {}),
      onSnapshot(query(collection(db, "support_threads"), where("unreadAdmin", "==", true)), (s) => {
        setBadge((b) => ({ ...b, support: s.size }));
        if (!firstSup && s.size > prevSup) { playChime(); notify("New support message", "A customer wrote to you"); }
        prevSup = s.size; firstSup = false;
      }, () => {}),
    ];
    return () => off.forEach((f) => f());
  }, [state]);

  if (loading || state === "checking") return <p className="text-muted">Checking admin access…</p>;
  if (state === "no")
    return <p role="alert" className="max-w-lg text-sm">This account is not an admin. The shop owner can grant access by adding this email to the server&rsquo;s ADMIN_EMAILS list (or locally with <code>npm run set-admin -- &lt;email&gt;</code>), then reloading this page.</p>;

  const count = (href: string) => (href === "/admin/inquiries" ? badge.inquiries : href === "/admin/returns" ? badge.returns : href === "/admin/support" ? badge.support : 0);
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-5 border-b border-line text-sm">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={`pb-2 ${path.startsWith(href) ? "border-b-2 border-gold font-medium" : "text-muted hover:text-ink"}`}>
            {label}{count(href) > 0 ? ` (${count(href)})` : ""}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
