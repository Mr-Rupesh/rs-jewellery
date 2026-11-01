"use client";
import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Msg { id: string; from: "customer" | "admin"; text: string; at: number }

/** Shared by the customer (Account > Support) and the admin (Support inbox). Realtime via Firestore. */
export function ChatPanel({ threadId, role, customerName = "" }: { threadId: string; role: "customer" | "admin"; customerName?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMsgs([]);
    return onSnapshot(query(collection(db, "support_threads", threadId, "messages"), orderBy("at", "asc"), limit(200)),
      (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Msg, "id">) }))), () => setErr("Could not load messages."));
  }, [threadId]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  useEffect(() => { if (role === "admin") void updateDoc(doc(db, "support_threads", threadId), { unreadAdmin: false }).catch(() => {}); }, [role, threadId, msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true); setErr("");
    try {
      const now = Date.now();
      await addDoc(collection(db, "support_threads", threadId, "messages"), { from: role, text: t, at: now });
      if (role === "customer")
        await setDoc(doc(db, "support_threads", threadId), { uid: threadId, name: customerName, status: "OPEN", lastMessageAt: now, lastMessageText: t.slice(0, 100), unreadAdmin: true }, { merge: true });
      else
        await updateDoc(doc(db, "support_threads", threadId), { lastMessageAt: now, lastMessageText: t.slice(0, 100), unreadAdmin: false });
      setText("");
    } catch { setErr("Could not send. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex h-[28rem] flex-col border border-line bg-white">
      <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {msgs.length === 0 && <p className="text-sm text-muted">{role === "customer" ? "Ask us anything about your order or a design. We will reply here." : "No messages yet."}</p>}
        {msgs.map((m) => {
          const mine = m.from === role;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap px-3 py-2 text-sm ${mine ? "bg-gold text-ink" : "bg-ivory"}`}>
                {m.text}
                <span className="mt-1 block text-[10px] opacity-60">{new Date(m.at).toLocaleString("en-IN")}</span>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {err && <p role="alert" className="px-4 text-sm text-red-700">{err}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <input className="field" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Type a message" aria-label="Message" />
        <button className="btn-primary" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
