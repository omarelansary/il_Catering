'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import supabase from "../../../lib/supabaseClient";
import { PIZZA_TYPES, type PizzaId } from "../../../lib/pizzaConfig";

interface CounterPageProps {
  params: { eventId: string };
}

interface EventDetails {
  name: string | null;
  event_date: string | null;
}

type Totals = Record<PizzaId, number>;

type Feedback = { type: "success" | "error"; text: string } | null;

type SaveState = { item: PizzaId | null };

const pizzaIdSet = new Set<PizzaId>(PIZZA_TYPES.map((pizza) => pizza.id));

const isPizzaId = (value: string): value is PizzaId => pizzaIdSet.has(value as PizzaId);

const buildInitialTotals = (): Totals =>
  PIZZA_TYPES.reduce((acc, pizza) => {
    acc[pizza.id] = 0;
    return acc;
  }, {} as Totals);

const getLocalISODate = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 10);
};

const isDateOnlyString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  if (isDateOnlyString(value)) {
    return `${value}T00:00:00`;
  }
  return value.includes("T") ? value : value.replace(" ", "T");
};

const formatDisplayDate = (value: string | null | undefined) => {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return value ?? null;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(parsed);
};

export default function CounterPage({ params }: CounterPageProps) {
  const [totals, setTotals] = useState<Totals>(() => buildInitialTotals());
  const [draftTotals, setDraftTotals] = useState<Totals>(() => buildInitialTotals());
  const [totalsLoading, setTotalsLoading] = useState<boolean>(true);
  const [totalsError, setTotalsError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saveState, setSaveState] = useState<SaveState>({ item: null });

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [eventLoading, setEventLoading] = useState<boolean>(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const fetchLockRef = useRef(false);

  const eventDay = useMemo(
    () => formatDisplayDate(eventDetails?.event_date),
    [eventDetails?.event_date]
  );

  const queryTotals = useCallback(async (): Promise<Totals> => {
    const { data, error } = await supabase
      .from("pizzas")
      .select("item, qty")
      .eq("event_id", params.eventId);

    if (error) {
      throw error;
    }

    const nextTotals = buildInitialTotals();

    for (const row of data ?? []) {
      const item = typeof row.item === "string" ? row.item : null;
      const qty = Number(row.qty ?? 0);

      if (item && isPizzaId(item)) {
        nextTotals[item] += Number.isFinite(qty) ? qty : 0;
      }
    }

    return nextTotals;
  }, [params.eventId]);

  const fetchTotals = useCallback(async () => {
    if (fetchLockRef.current) {
      return;
    }

    fetchLockRef.current = true;
    setTotalsLoading(true);
    setTotalsError(null);

    try {
      const nextTotals = await queryTotals();
      setTotals(nextTotals);
      setDraftTotals(nextTotals);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load totals.";
      setTotalsError(message);
    } finally {
      fetchLockRef.current = false;
      setTotalsLoading(false);
    }
  }, [queryTotals]);

  const fetchEventDetails = useCallback(async () => {
    setEventLoading(true);
    setEventError(null);

    try {
      const { data, error } = await supabase
        .from("events")
        .select("name, event_date")
        .eq("id", params.eventId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      setEventDetails(data ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load event details.";
      setEventError(message);
      setEventDetails(null);
    } finally {
      setEventLoading(false);
    }
  }, [params.eventId]);

  useEffect(() => {
    void fetchTotals();
  }, [fetchTotals]);

  useEffect(() => {
    void fetchEventDetails();
  }, [fetchEventDetails]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const handleSynchronizeTotals = useCallback(async () => {
    try {
      const nextTotals = await queryTotals();
      setTotals(nextTotals);
      setDraftTotals(nextTotals);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not refresh totals.";
      setTotalsError(message);
    }
  }, [queryTotals]);

  const commitCount = useCallback(
    async (item: PizzaId, targetValue: number) => {
      const sanitized = Math.max(0, Math.floor(targetValue));
      setDraftTotals((current) => ({ ...current, [item]: sanitized }));

      const currentValue = totals[item] ?? 0;
      const delta = sanitized - currentValue;

      if (delta === 0) {
        setFeedback({ type: "success", text: "All caught up." });
        return;
      }

      setSaveState({ item });
      setFeedback(null);

      try {
        const { error } = await supabase.from("pizzas").insert({
          event_id: params.eventId,
          item,
          qty: delta,
          ts: new Date().toISOString()
        });

        if (error) {
          throw error;
        }

        setFeedback({
          type: "success",
          text:
            delta > 0
              ? `Logged ${delta} ${delta === 1 ? "pizza" : "pizzas"}.`
              : `Removed ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "pizza" : "pizzas"}.`
        });

        await handleSynchronizeTotals();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update pizzas.";
        setFeedback({ type: "error", text: message });
      } finally {
        setSaveState({ item: null });
      }
    },
    [handleSynchronizeTotals, params.eventId, totals]
  );

  const handleAdjust = useCallback(
    (item: PizzaId, delta: number) => {
      if (saveState.item && saveState.item !== item) {
        return;
      }

      const currentValue = draftTotals[item] ?? 0;
      const nextValue = Math.max(0, currentValue + delta);
      void commitCount(item, nextValue);
    },
    [commitCount, draftTotals, saveState.item]
  );

  const handleInputChange = useCallback((item: PizzaId, rawValue: string) => {
    const numeric = Number(rawValue);
    if (!Number.isNaN(numeric)) {
      setDraftTotals((current) => ({ ...current, [item]: Math.max(0, numeric) }));
    }
  }, []);

  const handleInputBlur = useCallback(
    (item: PizzaId, value: number) => {
      void commitCount(item, value);
    },
    [commitCount]
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, item: PizzaId, value: number) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
        void commitCount(item, value);
      }
    },
    [commitCount]
  );

  const handleFinished = useCallback(async () => {
    setFeedback(null);
    await handleSynchronizeTotals();
    setFeedback({ type: "success", text: "Totals synced. Ready for the next rush." });
  }, [handleSynchronizeTotals]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">Live counter</p>
          <h1 className="text-3xl font-semibold text-slate-100">
            {eventLoading ? "Loading event..." : eventDetails?.name ?? "Event"}
          </h1>
        </div>
        {eventError ? (
          <p className="text-sm text-rose-300">{eventError}</p>
        ) : (
          <p className="text-sm text-slate-300">
            {eventDay ? `Scheduled for ${eventDay}` : "Keep pizzas flowing and we'll tally the pies."}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleFinished()}
          className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:w-auto"
        >
          Finished
        </button>
      </header>

      {feedback && (
        <p
          className={
            feedback.type === "success"
              ? "rounded-xl border border-emerald-400/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
              : "rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200"
          }
        >
          {feedback.text}
        </p>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Adjust pizzas
          </h2>
          <button
            type="button"
            onClick={() => void fetchTotals()}
            disabled={totalsLoading}
            className="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {totalsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {totalsError && (
          <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {totalsError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PIZZA_TYPES.map((pizza) => {
            const draftValue = draftTotals[pizza.id] ?? 0;
            const isSaving = saveState.item === pizza.id;

            return (
              <div
                key={pizza.id}
                className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-inner shadow-black/30"
              >
                <header className="flex flex-col gap-1">
                  <p className="text-lg font-semibold text-slate-100">{pizza.label}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Live count: {totalsLoading ? "--" : totals[pizza.id] ?? 0}
                  </p>
                </header>

                <div className="mt-4 grid grid-cols-[auto,1fr,auto] items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAdjust(pizza.id, -1)}
                    disabled={isSaving || (draftTotals[pizza.id] ?? 0) <= 0}
                    className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-slate-950/70 text-5xl font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draftValue}
                    onChange={(event) => handleInputChange(pizza.id, event.target.value)}
                    onBlur={(event) => handleInputBlur(pizza.id, Number(event.target.value))}
                    onKeyDown={(event) => handleInputKeyDown(event, pizza.id, Number(event.currentTarget.value))}
                    className="h-12 w-full min-w-0 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-center text-2xl font-semibold text-slate-100 focus:border-blue-400/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleAdjust(pizza.id, 1)}
                    disabled={isSaving}
                    className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-slate-950/70 text-2xl font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    +
                  </button>
                </div>

                {isSaving && (
                  <p className="mt-3 text-center text-xs uppercase tracking-wide text-blue-300">
                    Syncing...
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Live totals overview
          </h2>
          <button
            type="button"
            onClick={() => void fetchTotals()}
            disabled={totalsLoading}
            className="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {totalsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIZZA_TYPES.map((pizza) => (
            <li
              key={pizza.id}
              className="rounded-xl bg-slate-900/80 px-4 py-3 shadow-inner shadow-black/30"
            >
              <p className="text-sm font-semibold text-slate-100">{pizza.label}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{pizza.id}</p>
              <p className="mt-3 text-3xl font-bold text-slate-100">
                {totalsLoading ? "--" : totals[pizza.id] ?? 0}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
