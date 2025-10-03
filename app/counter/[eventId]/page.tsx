import { PIZZA_TYPES } from "../../../lib/pizzaConfig";

interface CounterPageProps {
  params: { eventId: string };
}

export default function CounterPage({ params }: CounterPageProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">Live counter</p>
        <h1 className="text-3xl font-semibold text-slate-100">Event: {params.eventId}</h1>
        <p className="text-slate-300">Static placeholder while we wire up real-time tracking.</p>
      </header>

      <section className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Pizza types</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {PIZZA_TYPES.map((pizza) => (
            <li key={pizza.id} className="rounded-lg bg-slate-900/80 px-4 py-3">
              <p className="text-sm font-medium text-slate-100">{pizza.label}</p>
              <p className="text-xs uppercase tracking-wide text-slate-500">{pizza.id}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
