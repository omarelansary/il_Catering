import { PIZZA_TYPES } from "../../../../lib/pizzaConfig";

interface SummaryPageProps {
  params: { eventId: string };
}

export default function EventSummaryPage({ params }: SummaryPageProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">Event summary</p>
        <h1 className="text-3xl font-semibold text-slate-100">Event: {params.eventId}</h1>
        <p className="text-slate-300">Static placeholder for pizza counts and attendee stats.</p>
      </header>

      <section className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Pizza types</h2>
        <ul className="mt-4 space-y-2">
          {PIZZA_TYPES.map((pizza) => (
            <li key={pizza.id} className="flex items-center justify-between rounded-lg bg-slate-900/80 px-4 py-3">
              <span className="font-medium text-slate-100">{pizza.label}</span>
              <span className="text-xs uppercase tracking-wide text-slate-500">{pizza.id}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
