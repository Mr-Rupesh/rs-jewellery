export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const extFor = (type: string): string => (type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg");

/** Returns an error message for the customer, or null if valid. Mirrors the Storage/Firestore rules. */
export function validateInquiry(i: { name: string; phone: string; description: string; files: { type: string; size: number }[] }): string | null {
  const name = i.name.trim(), desc = i.description.trim();
  if (name.length < 2 || name.length > 80) return "Please enter your name.";
  if (!/^[6-9]\d{9}$/.test(i.phone.trim())) return "Please enter a valid 10-digit mobile number so we can send your quote.";
  if (desc.length < 10) return "Please describe the design in at least 10 characters.";
  if (desc.length > 2000) return "Description is too long (maximum 2000 characters).";
  if (i.files.length > MAX_IMAGES) return `You can attach at most ${MAX_IMAGES} images.`;
  for (const f of i.files) {
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) return "Only JPG, PNG or WebP images are allowed.";
    if (f.size >= MAX_IMAGE_BYTES) return "Each image must be smaller than 5 MB.";
  }
  return null;
}
