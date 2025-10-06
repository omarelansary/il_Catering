import Link from "next/link";

const sections = [
  {
    title: "Upcoming events",
    description: "Browse events scheduled for today and beyond to jump into dashboards or counters.",
    href: "/"
  },
  {
    title: "Create booking",
    description: "Need a new event? Send a booking request and coordinate with the admin team.",
    href: "/book"
  },
  {
    title: "Admin approvals",
    description: "Approve pending requests and convert them into live events.",
    href: "/admin/bookings"
  }
];

export default function EventsIndexPage() {
  return (
    <div className="space-y-10 py-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Event dashboards</h1>
        <p className="max-w-2xl text-sm text-slate-300">
          Start from this hub to find live dashboards, counters, and summaries for every pizza event.
          Choose a path below or use the search and filters on the home page to jump straight into a
          specific event.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <article
            key={section.title}
            className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/70 px-5 py-6 shadow shadow-black/10"
          >
            <h2 className="text-lg font-semibold text-slate-100">{section.title}</h2>
            <p className="text-sm text-slate-300">{section.description}</p>
            <Link
              href={section.href}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-300 transition hover:text-blue-200"
            >
              Go to page
              <span aria-hidden>&rarr;</span>
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
