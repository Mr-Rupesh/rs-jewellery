"use client";
import { Heart, MessageCircle } from "lucide-react";
import { useAuth } from "./providers";

export function WishlistButton({ productId, className = "" }: { productId: string; className?: string }) {
  const { wishlist, toggleWishlist } = useAuth();
  const saved = wishlist.includes(productId);
  return (
    <button type="button" aria-pressed={saved} aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      onClick={() => void toggleWishlist(productId)}
      className={`rounded-full bg-white/90 p-2 text-ink shadow-sm hover:text-gold ${className}`}>
      <Heart size={18} className={saved ? "fill-gold text-gold" : ""} />
    </button>
  );
}

export function WhatsAppFab() {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919322392769";
  return (
    <a href={`https://wa.me/${number}?text=${encodeURIComponent("Hello RS Jewellers, I have a question.")}`} target="_blank" rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-medium text-white shadow-lg print:hidden">
      <MessageCircle size={20} /><span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
