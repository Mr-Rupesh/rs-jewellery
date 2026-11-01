"use client";
import { useState } from "react";
import { useCart } from "./providers";

export function AddToCart({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  return (
    <button
      className="btn-primary"
      disabled={disabled}
      onClick={() => { add(productId); setAdded(true); setTimeout(() => setAdded(false), 1500); }}
    >
      {disabled ? "Out of stock" : added ? "Added to cart" : "Add to cart"}
    </button>
  );
}
