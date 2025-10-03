import Link from "next/link";

const featuredEvents = [
  { id: "demo", name: "Demo Event" },
  { id: "team-lunch", name: "Team Lunch" }
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Event pizza tracking made simple</h1>
        <p className="max-w-2xl text-slate-300">
          Spin up a real-time pizza counter for any gathering in seconds. Choose an event to
          jump into the live counter or review the slice summary after the party.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {featuredEvents.map((event) => (
          <article
            key={event.id}
            className="rounded-xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/20"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{event.name}</h2>
              <span className="text-xs uppercase tracking-wide text-slate-400">Sample</span>
            </div>
            <div className="mt-6 flex flex-col gap-2 text-sm">
              <Link
                href={`/counter/${event.id}`}
                className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-400"
              >
                Open counter
              </Link>
              <Link
                href={`/events/${event.id}/summary`}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300"
              >
                View summary
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
