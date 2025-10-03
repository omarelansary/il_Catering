import Link from "next/link";
import { PIZZA_TYPES } from "../lib/pizzaConfig";

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

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-4 md:grid-cols-2">
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
        </div>
        <aside className="rounded-xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Supported pizzas</p>
          <ul className="mt-4 space-y-2">
            {PIZZA_TYPES.map((pizza) => (
              <li key={pizza.id} className="flex items-center justify-between rounded-lg bg-slate-900/80 px-3 py-2">
                <span className="font-medium text-slate-100">{pizza.label}</span>
                <span className="text-xs uppercase tracking-wide text-slate-500">{pizza.id}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
