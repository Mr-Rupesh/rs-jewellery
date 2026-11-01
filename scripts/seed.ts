export {}; // marks this file as a module so its `main` does not clash with the other scripts
// Seeds the LOCAL Firestore emulator only. Rates below are PLACEHOLDERS, not market rates.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-rs-jewellers";

async function main() {
  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(initializeApp({ projectId }));

  await db.doc("settings/pricing").set({
    rate24kPaisePerGram: 1_300_000, rate22kPaisePerGram: 1_190_000, rate18kPaisePerGram: 975_000,
    gstBps: 300, updatedAt: Date.now(), updatedBy: "seed",
  });

  // Documents show PIN 400002 (Kalbadevi). The others are nearby suggestions: verify with your courier, then edit in Admin > Store pages.
  await db.doc("settings/service").set({ pincodes: ["400001", "400002", "400003", "400004", "400007", "400008"], updatedAt: Date.now() });

  const base = {
    images: [], stonePaise: 0, fixedPricePaise: null, active: true,
    description: "A lightweight gold piece for everyday wear.",
    highlights: ["Lightweight everyday design", "Priced by weight at today's gold rate"],
    specs: [{ label: "Brand", value: "R S Jewellers" }, { label: "Occasion", value: "Daily wear" }],
  };
  const products = [
    { id: "ring-petal", name: "Petal Ring", slug: "petal-ring", category: "Rings", purity: "22K", netWeightMg: 620, makingType: "PERCENT", makingValue: 1200, stock: 8 },
    { id: "stud-dot", name: "Dot Studs", slug: "dot-studs", category: "Earrings", purity: "22K", netWeightMg: 480, makingType: "PERCENT", makingValue: 1000, stock: 12 },
    { id: "pendant-leaf", name: "Leaf Pendant", slug: "leaf-pendant", category: "Pendants", purity: "18K", netWeightMg: 750, makingType: "FLAT", makingValue: 90_000, stock: 5 },
    { id: "nose-pin", name: "Nose Pin", slug: "nose-pin", category: "Nose pins", purity: "22K", netWeightMg: 320, makingType: "PERCENT", makingValue: 1500, stock: 20 },
    { id: "chain-fine", name: "Fine Chain", slug: "fine-chain", category: "Chains", purity: "22K", netWeightMg: 980, makingType: "PERCENT", makingValue: 800, stock: 6 },
    // TEST ITEM: total = Rs 1.00 incl. 3% GST (97 + 3 paise). Remove or set active:false before launch.
    { id: "test-rupee-1", name: "TEST ITEM Rs 1", slug: "test-item-1", category: "Test", purity: "22K", netWeightMg: 100, makingType: "FLAT", makingValue: 0, stock: 100, fixedPricePaise: 97 },
    { id: "coin-festive", name: "Festive Coin (fixed price)", slug: "festive-coin", category: "Coins", purity: "24K", netWeightMg: 500, makingType: "FLAT", makingValue: 0, stock: 30, fixedPricePaise: 700_000 },
  ];
  for (const { id, ...p } of products) await db.collection("products").doc(id).set({ ...base, ...p });
  console.log(`Seeded settings/pricing and ${products.length} products into emulator (${projectId}).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
