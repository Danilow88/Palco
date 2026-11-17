import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const sans = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Palco — karaokê",
  description: "Karaokê no celular: instrumental, letra na tela e nota da cantoria.",
  applicationName: "Palco",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Palco", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#12080d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
