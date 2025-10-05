import Link from "next/link";

const features = [
  {
    title: "Browse events",
    description: "Pick a day to enter dashboards, counters, and summaries for active events.",
    href: "/events/browse",
    locked: true
  },
  {
    title: "Book catering",
    description: "Submit event requests with guest counts and package preferences.",
    href: "/book",
    locked: true
  },
  {
    title: "Admin dashboard",
    description: "Review requests, approve events, and export calendars.",
    href: "/admin/bookings",
    locked: true
  }
];

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-16 py-16">
      <section className="space-y-6 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
          Event Pizza Counter platform
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-100 sm:text-5xl">
          Bring order to high-volume pizza events
        </h1>
        <p className="mx-auto max-w-2xl text-base text-slate-300 sm:text-lg">
          Coordinate staff, log pizzas in real time, and keep guests happy. Login to access booking
          forms, admin approvals, and live dashboards tailored to your team.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/book"
            className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-400"
          >
            Request a booking
          </Link>
          <Link
            href="/menu"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300"
          >
            menu
          </Link>
        </div>
      </section>

      <section className="grid gap-6 rounded-2xl border border-white/10 bg-slate-900/60 p-8 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <article
            key={feature.title}
            className="space-y-3 rounded-xl border border-white/10 bg-slate-900/70 px-5 py-6 shadow-lg shadow-black/10"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">{feature.title}</h2>
              {feature.locked && (
                <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-0.5 text-xs font-medium text-amber-200">
                  Login required
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300">{feature.description}</p>
            <Link
              href={feature.href}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-300 transition hover:text-blue-200"
            >
              Go to page
              <span aria-hidden>&rarr;</span>
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-6 rounded-2xl border border-white/10 bg-slate-900/60 p-8 sm:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">How it works</h2>
          <ol className="space-y-3 text-sm text-slate-300">
            <li className="rounded-lg border border-white/10 bg-slate-900/70 px-4 py-3">
              <span className="font-medium text-slate-100">1. Login or request access.</span>
              <p>Securely authenticate before accessing booking or admin tools.</p>
            </li>
            <li className="rounded-lg border border-white/10 bg-slate-900/70 px-4 py-3">
              <span className="font-medium text-slate-100">2. Plan the event.</span>
              <p>Submit booking details, assign staff, and export an event calendar.</p>
            </li>
            <li className="rounded-lg border border-white/10 bg-slate-900/70 px-4 py-3">
              <span className="font-medium text-slate-100">3. Track the action live.</span>
              <p>Use dashboards and counters to see pizza totals and keep the team aligned.</p>
            </li>
          </ol>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Need access?</h2>
          <p className="text-sm text-slate-300">
            This tool is designed for event coordinators running pizza experiences. If you need an
            account or want to integrate additional automations, reach out to your platform admin.
          </p>
          <Link
            href="mailto:events@example.com"
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300"
          >
            Contact support
          </Link>
        </div>
      </section>
    </div>
  );
}
