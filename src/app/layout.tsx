import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FoundSC",
  description: "Lost & found for USC.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#990000" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <header className="bg-cardinal text-white">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Found<span className="text-gold">SC</span>
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-md px-4 pb-16 pt-5">{children}</main>
      </body>
    </html>
  );
}
