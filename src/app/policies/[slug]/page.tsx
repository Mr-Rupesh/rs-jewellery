import { notFound } from "next/navigation";
import { getLegalText } from "@/server/catalog";
import { LEGAL_TITLES, isLegalKey } from "@/lib/legal-defaults";
import { parseLegal, splitBold } from "@/lib/admin-logic";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: isLegalKey(slug) ? `${LEGAL_TITLES[slug]} | RS Jewellers` : "Policy | RS Jewellers" };
}

function Inline({ text }: { text: string }) {
  return <>{splitBold(text).map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}</>;
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalKey(slug)) notFound();
  const blocks = parseLegal(await getLegalText(slug));
  return (
    <article className="max-w-2xl space-y-4 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === "h1") return <h1 key={i} className="text-4xl font-semibold">{b.text}</h1>;
        if (b.type === "h2") return <h2 key={i} className="pt-2 text-2xl font-semibold">{b.text}</h2>;
        if (b.type === "ul") return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((t, k) => <li key={k}><Inline text={t} /></li>)}</ul>;
        if (b.type === "ol") return <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((t, k) => <li key={k}><Inline text={t} /></li>)}</ol>;
        return <p key={i}><Inline text={b.text} /></p>;
      })}
    </article>
  );
}
