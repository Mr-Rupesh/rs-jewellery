"use client";
import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChatPanel } from "@/components/chat";

interface Thread { id: string; name?: string; status: string; lastMessageAt: number; lastMessageText?: string; unreadAdmin?: boolean }

export default function SupportAdmin() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => onSnapshot(query(collection(db, "support_threads"), orderBy("lastMessageAt", "desc"), limit(100)),
    (s) => setThreads(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Thread, "id">) }))), () => setErr("Could not load conversations.")), []);

  const current = threads.find((t) => t.id === sel);
  async function setStatus(status: string) {
    if (!current) return;
    try { await updateDoc(doc(db, "support_threads", current.id), { status }); } catch { setErr("Could not update the conversation."); }
  }

  return (
    <div>
      <h1 className="text-4xl font-semibold">Support inbox</h1>
      {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]">
        <ul className="max-h-[32rem] overflow-y-auto border border-line bg-white">
          {threads.length === 0 && <li className="p-4 text-sm text-muted">No conversations yet.</li>}
          {threads.map((t) => (
            <li key={t.id}>
              <button onClick={() => setSel(t.id)} className={`block w-full border-b border-line p-3 text-left text-sm hover:bg-ivory ${sel === t.id ? "bg-ivory" : ""}`}>
                <span className="flex justify-between"><strong>{t.name || "Customer"}</strong>{t.unreadAdmin && <span className="rounded-full bg-gold px-2 text-xs text-ink">new</span>}</span>
                <span className="block truncate text-muted">{t.lastMessageText}</span>
                <span className="text-xs text-muted">{t.status}</span>
              </button>
            </li>))}
        </ul>
        <div>
          {current ? (<>
            <div className="mb-2 flex items-center justify-between text-sm"><strong>{current.name || "Customer"}</strong>
              <button className="btn-quiet" onClick={() => void setStatus(current.status === "OPEN" ? "CLOSED" : "OPEN")}>{current.status === "OPEN" ? "Close conversation" : "Reopen"}</button></div>
            <ChatPanel threadId={current.id} role="admin" />
          </>) : <p className="text-sm text-muted">Select a conversation.</p>}
        </div>
      </div>
    </div>
  );
}
