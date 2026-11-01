import "./globals.css";
import type { ReactNode } from "react";
import { Playfair_Display, DM_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { GoldTicker } from "@/components/gold-ticker";
import { Footer } from "@/components/footer";
import { WhatsAppFab } from "@/components/store-ui";

const display = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata = { title: "RS Jewellers", description: "Lightweight gold jewellery, priced by weight at today's rate." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <GoldTicker />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <Footer />
          <WhatsAppFab />
        </Providers>
      </body>
    </html>
  );
}
