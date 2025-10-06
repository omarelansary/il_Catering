import {
  getAllowedPizzasForEvent,
  getEventById,
  getPizzaTotals,
} from "../../../../lib/queries";
import type { PizzaTotal } from "../../../../lib/types";

interface SummaryPageProps {
  params: { eventId: string };
}

const PACKAGE_LABELS: Record<string, string> = {
  standard: "Standard",
  premium: "Premium",
};

const toTotalsMap = (totals: PizzaTotal[]) => {
  const map = new Map<string, number>();
  for (const row of totals) {
    map.set(row.pizza_id, row.qty);
  }
  return map;
};

export default async function EventSummaryPage({ params }: SummaryPageProps) {
  let error: string | null = null;

  try {
    const [event, allowedPizzas, totals] = await Promise.all([
      getEventById(params.eventId),
      getAllowedPizzasForEvent(params.eventId),
      getPizzaTotals(params.eventId),
    ]);

    const totalsByPizzaId = toTotalsMap(totals);

    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Event summary
          </p>
          <h1 className="text-3xl font-semibold text-slate-100">
            {event.name}
          </h1>
          <dl className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Date
              </dt>
              <dd>{new Date(event.event_date).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Guests
              </dt>
              <dd>{event.guests ?? "�"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Package
              </dt>
              <dd>
                {event.package_id
                  ? (PACKAGE_LABELS[event.package_id] ?? event.package_id)
                  : "Not assigned"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Venue
              </dt>
              <dd>{event.address ?? "�"}</dd>
            </div>
          </dl>
        </header>

        <section className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Allowed pizzas
            </h2>
            <span className="text-xs text-slate-500">
              {allowedPizzas.length} types
            </span>
          </div>

          {allowedPizzas.length === 0 ? (
            <p className="text-sm text-slate-300">
              No pizzas are currently linked to this event&apos;s package.
            </p>
          ) : (
            <ul className="space-y-2">
              {allowedPizzas.map((pizza) => (
                <li
                  key={pizza.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/80 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-100">{pizza.name}</p>
                    <p className="text-xs text-slate-500">
                      {pizza.vegan
                        ? "Vegan"
                        : pizza.vegetarian
                          ? "Vegetarian"
                          : "Contains meat"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-200">
                    {totalsByPizzaId.get(pizza.id) ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load event data.";
  }

  return (
    <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-6 text-sm text-rose-200">
      {error ?? "Unknown error."}
    </div>
  );
}
