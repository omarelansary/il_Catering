import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppHeader from "./components/AppHeader";

export const metadata: Metadata = {
  title: "Event Pizza Counter",
  description: "Track pizza orders and slices served in real time."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
