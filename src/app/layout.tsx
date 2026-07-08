import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-sans-var",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Alex Morgan — Senior Product Manager",
  description:
    "Senior Product Manager with 8+ years building digital products across B2B and B2C. Former software engineer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable}`}>
      <body className="min-h-screen antialiased bg-[#f3f2ef]">{children}</body>
    </html>
  );
}
