'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../lib/supabaseClient";

type NavItem = {
  href: string;
  label: string;
  requireAuth?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/events/browse", label: "Events", requireAuth: true },
  { href: "/book", label: "Book Event", requireAuth: true },
  { href: "/admin/bookings", label: "Booking Requests", requireAuth: true }
];

const PAGE_TITLES: Array<{ test: (path: string) => boolean; title: string }> = [
  { test: (path) => path === "/", title: "Welcome" },
  { test: (path) => path.startsWith("/book"), title: "Booking Request" },
  { test: (path) => path.startsWith("/admin/bookings"), title: "Admin Bookings" },
  { test: (path) => path.includes("/dashboard"), title: "Event Dashboard" },
  { test: (path) => path.includes("/summary"), title: "Event Summary" },
  { test: (path) => path.includes("/events/browse"), title: "Events" },
  { test: () => true, title: "Event Pizza Counter" }
];

const getPageTitle = (pathname: string) => {
  const match = PAGE_TITLES.find((entry) => entry.test(pathname));
  return match?.title ?? "Event Pizza Counter";
};

const isCurrent = (pathname: string, href: string) => {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname.startsWith(href);
};

export default function AppHeader() {
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleMobileMenu = useCallback(() => {
    setMobileOpen((previous) => !previous);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const fetchSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsLoggedIn(Boolean(data.session));
      setCheckingSession(false);
    };

    void fetchSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
    });

    unsubscribe = listener?.subscription.unsubscribe;

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    closeMobileMenu();
  }, [pathname, isLoggedIn, closeMobileMenu]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, closeMobileMenu]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        closeMobileMenu();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [closeMobileMenu]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const navItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => !item.requireAuth || isLoggedIn);
  }, [isLoggedIn]);

  const pageTitle = getPageTitle(pathname);

  const desktopLinkBase =
    "inline-flex items-center rounded-lg px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400";
  const mobileLinkBase =
    "block w-full rounded-lg px-3 py-2 text-base transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400";

  const renderAuthControl = (variant: "desktop" | "mobile") => {
    if (checkingSession) {
      return null;
    }

    if (isLoggedIn) {
      return (
        <button
          type="button"
          onClick={handleLogout}
          className={`rounded-lg border border-white/10 px-3 py-2 font-medium text-slate-100 transition hover:border-rose-400/60 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 ${
            variant === "desktop"
              ? "inline-flex items-center text-xs"
              : "inline-flex w-full justify-center text-sm"
          }`}
        >
          Logout
        </button>
      );
    }

    return (
      <Link
        href="/login"
        className={`rounded-lg bg-blue-500 px-3 py-2 font-semibold text-white transition hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 ${
          variant === "desktop"
            ? "inline-flex items-center text-xs"
            : "inline-flex w-full justify-center text-sm"
        }`}
      >
        Login
      </Link>
    );
  };

  return (
    <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center justify-between gap-4 md:justify-start">
            <div className="min-w-0">
              <Link href="/" className="text-lg font-semibold tracking-tight text-slate-100">
                il Catering
              </Link>
              <p className="truncate text-sm text-slate-400">{pageTitle}</p>
            </div>
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 p-2 text-slate-100 transition hover:border-blue-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 md:hidden"
              aria-expanded={mobileOpen}
              aria-controls="primary-navigation"
              aria-label="Toggle navigation"
            >
              <span className="sr-only">Toggle navigation</span>
              <span
                className={`block h-0.5 w-5 transform rounded-full bg-current transition-all duration-200 ${
                  mobileOpen ? "translate-y-1.5 rotate-45" : "-translate-y-1.5"
                }`}
              />
              <span
                className={`block h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 ${
                  mobileOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`block h-0.5 w-5 transform rounded-full bg-current transition-all duration-200 ${
                  mobileOpen ? "-translate-y-1.5 -rotate-45" : "translate-y-1.5"
                }`}
              />
            </button>
          </div>
          <nav className="hidden items-center gap-2 text-slate-300 md:flex" aria-label="Primary">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${desktopLinkBase} ${
                  isCurrent(pathname, item.href)
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {renderAuthControl("desktop")}
          </nav>
        </div>

        <div
          id="primary-navigation"
          className={`mt-4 space-y-3 md:hidden ${mobileOpen ? "block" : "hidden"}`}
        >
          <nav
            aria-label="Primary"
            className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900/90 p-4 text-slate-200 shadow-lg shadow-black/30 backdrop-blur"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${mobileLinkBase} ${
                  isCurrent(pathname, item.href)
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {renderAuthControl("mobile")}
          </nav>
        </div>
      </div>
    </header>
  );
}
