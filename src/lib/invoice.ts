/** Indian financial year (Apr-Mar) of a timestamp, in IST, as "2526" for 2025-26. */
export function financialYear(ms: number): string {
  const d = new Date(ms + 5.5 * 3600 * 1000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(); // 0 = Jan
  const start = m >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

export const formatInvoiceNo = (fy: string, seq: number): string => `RS/${fy}/${String(seq).padStart(6, "0")}`;

export type GstSplit = { type: "INTRA"; cgstPaise: number; sgstPaise: number } | { type: "INTER"; igstPaise: number };

/** Same state as the seller => CGST + SGST (halves, summing exactly). Otherwise IGST. */
export function gstSplit(gstPaise: number, sellerState: string, buyerState: string): GstSplit {
  const norm = (s: string) => s.trim().toLowerCase();
  if (norm(sellerState) !== "" && norm(sellerState) === norm(buyerState)) {
    const cgstPaise = Math.floor(gstPaise / 2);
    return { type: "INTRA", cgstPaise, sgstPaise: gstPaise - cgstPaise };
  }
  return { type: "INTER", igstPaise: gstPaise };
}
