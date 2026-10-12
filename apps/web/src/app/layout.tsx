import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SuiteASD", template: "%s | SuiteASD" },
  description: "Ordine. Efficienza. Una sola app. La gestione completa della tua società sportiva.",
};

export const viewport: Viewport = {
  themeColor: "#3b5bff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={jakarta.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
