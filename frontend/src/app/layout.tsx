import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import ThreeBackground from "@/components/ThreeBackground";
import PHProvider from "@/components/PHProvider";

// Single unified font
const inter = Inter({
  variable: "--font-primary",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Xpochat - Lightning Fast AI Conversations",
  description: "Experience the future of AI chat with lightning-fast responses and beautifully simple interface",
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased text-[17px]`}
      >
        <ClerkProvider>
          <PHProvider>
            <ThreeBackground />
            {children}
          </PHProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

// Required Clerk environment variables:
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
// CLERK_SECRET_KEY=your-clerk-secret-key
// See Clerk dashboard for your keys.
