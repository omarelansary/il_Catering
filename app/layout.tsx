import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Pizza Counter",
  description: "Track pizza orders and slices served in real time."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
              <span className="text-lg font-semibold tracking-tight">Pizza Counter</span>
              <span className="text-sm text-slate-300">MVP</span>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
