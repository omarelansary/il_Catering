import supabase from "./supabaseClient";
import type { EventRow, Pizza, PizzaTotal } from "./types";

const sanitizeQty = (value: number): number =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

export async function getEventById(eventId: string): Promise<EventRow> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, event_date, address, package_id, guests")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Event not found");
  }

  const { id, name, event_date, address, package_id, guests } =
    data as EventRow;

  return {
    id,
    name,
    event_date,
    address,
    package_id,
    guests,
  };
}

export async function getAllowedPizzasForEvent(
  eventId: string,
): Promise<Pizza[]> {
  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select("package_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw eventError;
  }

  const packageId = (eventRow as { package_id: string | null } | null)
    ?.package_id;

  if (!packageId) {
    return [];
  }

  const { data: pizzaRows, error: pizzasError } = await supabase
    .from("package_pizzas")
    .select("pizza:pizza_id ( id, name, vegetarian, vegan )")
    .eq("package_id", packageId);

  if (pizzasError) {
    throw pizzasError;
  }

  const pizzas = pizzaRows ?? [];

  return pizzas
    .map((row) => (row as { pizza?: unknown }).pizza)
    .filter(
      (pizza): pizza is Pizza => typeof pizza === "object" && pizza !== null,
    ) as Pizza[];
}

export async function getPizzaTotals(eventId: string): Promise<PizzaTotal[]> {
  const { data, error } = await supabase
    .from("pizza_totals")
    .select("event_id, pizza_id, qty, updated_at")
    .eq("event_id", eventId);

  if (error) {
    throw error;
  }

  return (data ?? []).map(
    (row) =>
      ({
        event_id: row.event_id as string,
        pizza_id: row.pizza_id as string,
        qty: sanitizeQty(Number(row.qty ?? 0)),
        updated_at: row.updated_at as string,
      }) satisfies PizzaTotal,
  );
}

export async function upsertPizzaTotals(
  eventId: string,
  counts: Record<string, number>,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const entries = Object.entries(counts)
    .map(([pizzaId, qty]) => ({
      event_id: eventId,
      pizza_id: pizzaId,
      qty: sanitizeQty(qty),
      updated_at: timestamp,
    }))
    .filter((entry) => Number.isFinite(entry.qty));

  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("pizza_totals")
    .upsert(entries, { onConflict: "event_id,pizza_id" });

  if (error) {
    throw error;
  }
}
