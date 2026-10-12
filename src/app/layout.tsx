import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Nomade — Italy Digital Nomad Visa",
  description:
    "Your personalized checklist for the Italy Visto per Nomadi Digitali. Answer 5 questions. Get a step-by-step plan tailored to your situation.",
  icons: {
    icon: [
      { url: "/landing/favicon.ico", sizes: "48x48" },
      { url: "/landing/favicon.svg", type: "image/svg+xml" },
      { url: "/landing/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/landing/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/landing/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
