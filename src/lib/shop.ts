// Shop details shown on the invoice, footer and legal pages. Set the NEXT_PUBLIC_SHOP_* values in .env.local.
export const SHOP = {
  name: process.env.NEXT_PUBLIC_SHOP_NAME || "RS Jewellers",
  address: process.env.NEXT_PUBLIC_SHOP_ADDRESS || "[Shop address]",
  state: process.env.NEXT_PUBLIC_SHOP_STATE || "Maharashtra",
  gstin: process.env.NEXT_PUBLIC_SHOP_GSTIN || "",
  phone: process.env.NEXT_PUBLIC_SHOP_PHONE || "[Shop phone]",
  email: process.env.NEXT_PUBLIC_SHOP_EMAIL || "[Shop email]",
};
