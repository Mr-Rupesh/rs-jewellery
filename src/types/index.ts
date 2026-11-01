export type Purity = "18K" | "22K" | "24K";
export type MakingChargeType = "PERCENT" | "FLAT";

/** All money = integer paise. All weights = integer milligrams. */
export interface PricingSettings {
  rate18kPaisePerGram: number;
  rate22kPaisePerGram: number;
  rate24kPaisePerGram: number;
  gstBps: number; // 300 = 3%
  updatedAt: number;
  updatedBy: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  purity: Purity;
  netWeightMg: number;
  makingType: MakingChargeType;
  makingValue: number; // PERCENT: basis points (800 = 8%). FLAT: paise.
  stonePaise: number;
  /** If set, overrides live pricing. Pre-GST subtotal in paise. */
  fixedPricePaise: number | null;
  description?: string;
  highlights?: string[];
  specs?: { label: string; value: string }[];
  images: string[];
  stock: number;
  active: boolean;
}

export type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export interface LinePrice {
  mode: "LIVE" | "FIXED";
  ratePaisePerGram: number | null;
  metalPaise: number;
  makingPaise: number;
  stonePaise: number;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}

export interface Address {
  name: string; phone: string; line1: string; line2: string;
  city: string; state: string; pincode: string;
}

export interface QuoteLine {
  productId: string; qty: number; name: string;
  purity?: Purity; netWeightMg?: number;
  error?: string; unit?: LinePrice; lineTotalPaise?: number;
}
