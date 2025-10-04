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

interface SnapshotItem {
  item: PizzaId;
  new_qty: number;
}

interface Snapshot {
  key: string;
  at: string;
  items: SnapshotItem[];
  highlighted: PizzaId[];
  summary: string;
}
const pizzaIdSet = new Set<PizzaId>(PIZZA_TYPES.map((pizza) => pizza.id));
const pizzaLabelById = Object.fromEntries(
  PIZZA_TYPES.map((pizza) => [pizza.id, pizza.label])
) as Record<PizzaId, string>;

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

const formatDisplayDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
};

const sanitizeQty = (value: number) =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

const normalizeTotals = (input: Partial<Record<PizzaId, number>> | Totals): Totals => {
  const result = buildInitialTotals();
  for (const pizza of PIZZA_TYPES) {
    const value = (input as Totals)[pizza.id];
    result[pizza.id] = sanitizeQty(typeof value === "number" ? value : 0);
  }
  return result;
};

const totalsEqual = (a: Totals, b: Totals) =>
  PIZZA_TYPES.every((pizza) => (a[pizza.id] ?? 0) === (b[pizza.id] ?? 0));


const buildSnapshotSummary = (items: SnapshotItem[]) =>
  PIZZA_TYPES.map((pizza) => {
    const match = items.find((item) => item.item === pizza.id);
    if (!match) {
      return null;
    }
    const label = pizza.label.split(" ")[0] ?? pizza.label;
    return `${label}:${match.new_qty}`;
  })
    .filter(Boolean)
    .join(", ") || "No data";

const buildSnapshots = (
  rows: Array<{ item: string | null; new_qty: number | null; at: string | null }>
): Snapshot[] => {
  const normalizedRows = rows
    .map((row) => {
      if (!row.at || typeof row.item !== "string" || row.new_qty === null) {
        return null;
      }
      if (!isPizzaId(row.item)) {
        return null;
      }
      const atDate = new Date(row.at);
      if (Number.isNaN(atDate.getTime())) {
        return null;
      }
      return {
        item: row.item as PizzaId,
        new_qty: sanitizeQty(row.new_qty),
        at: atDate
      };
    })
    .filter((row): row is { item: PizzaId; new_qty: number; at: Date } => Boolean(row))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (normalizedRows.length === 0) {
    return [];
  }

  const runningTotals = new Map<PizzaId, number>();
  for (const pizza of PIZZA_TYPES) {
    runningTotals.set(pizza.id, 0);
  }

  const snapshotsAsc: Snapshot[] = [];
  let bucketSecond: number | null = null;
  let bucketTime: Date | null = null;
  let changedInBucket = new Set<PizzaId>();

  const flushBucket = () => {
    if (bucketSecond === null || !bucketTime) {
      return;
    }

    const items: SnapshotItem[] = PIZZA_TYPES.map((pizza) => ({
      item: pizza.id,
      new_qty: runningTotals.get(pizza.id) ?? 0
    }));

    snapshotsAsc.push({
      key: `${bucketSecond}`,
      at: bucketTime.toISOString(),
      items,
      highlighted: Array.from(changedInBucket),
      summary: buildSnapshotSummary(items)
    });
  };

  for (const row of normalizedRows) {
    const second = Math.floor(row.at.getTime() / 1000);
    if (bucketSecond === null) {
      bucketSecond = second;
      bucketTime = row.at;
      changedInBucket = new Set<PizzaId>();
    }

    if (second !== bucketSecond) {
      flushBucket();
      bucketSecond = second;
      bucketTime = row.at;
      changedInBucket = new Set<PizzaId>();
    } else if (bucketTime && row.at.getTime() > bucketTime.getTime()) {
      bucketTime = row.at;
    }

    const previousQty = runningTotals.get(row.item) ?? 0;
    const nextQty = sanitizeQty(row.new_qty);
    runningTotals.set(row.item, nextQty);
    if (nextQty !== previousQty) {
      changedInBucket.add(row.item);
    }
  }

  flushBucket();

  return snapshotsAsc.sort((a, b) => (a.at < b.at ? 1 : -1));
};

export default function CounterPage({ params }: CounterPageProps) {
  const [totals, setTotals] = useState<Totals>(() => buildInitialTotals());
  const [draftTotals, setDraftTotals] = useState<Totals>(() => buildInitialTotals());
  const [previousTotals, setPreviousTotals] = useState<Totals>(() => buildInitialTotals());
  const totalsRef = useRef<Totals>(buildInitialTotals());
  const hasLoadedRef = useRef(false);
  const [totalsLoading, setTotalsLoading] = useState<boolean>(true);
  const [totalsError, setTotalsError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saveState, setSaveState] = useState<{ item: PizzaId | null }>({ item: null });

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [eventLoading, setEventLoading] = useState<boolean>(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNeedsRefresh, setHistoryNeedsRefresh] = useState(true);
  const [historySnapshots, setHistorySnapshots] = useState<Snapshot[]>([]);

  const [undoSnapshot, setUndoSnapshot] = useState<Snapshot | null>(null);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const fetchLockRef = useRef(false);

  const eventDay = useMemo(
    () => formatDisplayDate(eventDetails?.event_date),
    [eventDetails?.event_date]
  );

  const applyTotals = useCallback((incoming: Totals) => {
    const normalized = normalizeTotals(incoming);
      if (hasLoadedRef.current && totalsEqual(normalized, totalsRef.current)) {
    return;
    }
    const previous = hasLoadedRef.current ? normalizeTotals(totalsRef.current) : normalized;
    setPreviousTotals(previous);
    totalsRef.current = normalized;
    setTotals(normalized);
    setDraftTotals({ ...normalized });
    hasLoadedRef.current = true;
  }, []);
  const queryTotals = useCallback(async (): Promise<Totals> => {
    const { data, error } = await supabase
      .from("pizza_totals")
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
        nextTotals[item] = sanitizeQty(qty);
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
      applyTotals(nextTotals);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load totals.";
      setTotalsError(message);
    } finally {
      fetchLockRef.current = false;
      setTotalsLoading(false);
    }
  }, [applyTotals, queryTotals]);

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

  const handleSynchronizeTotals = useCallback(async () => {
    try {
      const nextTotals = await queryTotals();
      applyTotals(nextTotals);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not refresh totals.";
      setTotalsError(message);
    }
  }, [applyTotals, queryTotals]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const { data, error } = await supabase
        .from("pizza_adjustments")
        .select("event_id, item, new_qty, at")
        .eq("event_id", params.eventId)
        .order("at", { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      const snapshots = buildSnapshots(data ?? []);
      setHistorySnapshots(snapshots);
      setHistoryNeedsRefresh(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load history.";
      setHistoryError(message);
      setHistorySnapshots([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [params.eventId]);

  useEffect(() => {
    void fetchTotals();
  }, [fetchTotals]);

  useEffect(() => {
    void fetchEventDetails();
  }, [fetchEventDetails]);

  useEffect(() => {
    if (!historyOpen || !historyNeedsRefresh || historyLoading) {
      return;
    }

    void fetchHistory();
  }, [fetchHistory, historyLoading, historyNeedsRefresh, historyOpen]);

  useEffect(() => {
    const channel = supabase
      .channel(`pizza_totals:${params.eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pizza_totals",
          filter: `event_id=eq.${params.eventId}`
        },
        () => {
          void handleSynchronizeTotals();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [handleSynchronizeTotals, params.eventId]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const commitCount = useCallback(
    async (item: PizzaId, targetValue: number) => {
      const sanitized = sanitizeQty(targetValue);
      setDraftTotals((current) => ({ ...current, [item]: sanitized }));

      const currentValue = totals[item] ?? 0;
      if (sanitized === currentValue) {
        setFeedback({ type: "success", text: "All caught up." });
        return;
      }

      setSaveState({ item });
      setFeedback(null);

      try {
        const { error } = await supabase
          .from("pizza_totals")
          .upsert(
            [
              {
                event_id: params.eventId,
                item,
                qty: sanitized,
                updated_at: new Date().toISOString()
              }
            ],
            { onConflict: "event_id,item" }
          );

        if (error) {
          throw error;
        }

        setFeedback({
          type: "success",
          text: `Saved ${pizzaLabelById[item]} count (${sanitized}).`
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
      if (saveState.item || restoringKey) {
        return;
      }

      const currentValue = draftTotals[item] ?? 0;
      const nextValue = Math.max(0, currentValue + delta);
      void commitCount(item, nextValue);
    },
    [commitCount, draftTotals, restoringKey, saveState.item]
  );

  const handleInputChange = useCallback((item: PizzaId, rawValue: string) => {
    const numeric = Number(rawValue);
    if (!Number.isNaN(numeric)) {
      setDraftTotals((current) => ({ ...current, [item]: sanitizeQty(numeric) }));
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

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
    setHistoryNeedsRefresh(true);
  }, []);


  const handleRestore = useCallback(
    async (snapshot: Snapshot) => {
      if (snapshot.items.length === 0) {
        setFeedback({ type: "error", text: "Snapshot has no data to restore." });
        return;
      }

      setRestoringKey(snapshot.key);
      setFeedback(null);

      const payload = snapshot.items.map((entry) => ({
        event_id: params.eventId,
        item: entry.item,
        qty: sanitizeQty(entry.new_qty),
        updated_at: new Date().toISOString()
      }));

      const currentTotals = normalizeTotals(totals);
      const previousItems: SnapshotItem[] = PIZZA_TYPES.map((pizza) => ({
        item: pizza.id,
        new_qty: currentTotals[pizza.id] ?? 0
      }));
      const snapshotMap = new Map(snapshot.items.map((entry) => [entry.item, entry.new_qty]));
      const undoHighlights = previousItems
        .filter((entry) => entry.new_qty !== (snapshotMap.get(entry.item) ?? 0))
        .map((entry) => entry.item);

      try {
        const { error } = await supabase
          .from("pizza_totals")
          .upsert(payload, { onConflict: "event_id,item" });

        if (error) {
          throw error;
        }

        setUndoSnapshot({
          key: `undo-${Date.now()}`,
          at: new Date().toISOString(),
          items: previousItems,
          highlighted: undoHighlights,
          summary: buildSnapshotSummary(previousItems)
        });

        setFeedback({ type: "success", text: "Snapshot restored." });
        setHistoryOpen(false);
        setHistoryNeedsRefresh(true);
        await handleSynchronizeTotals();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not restore snapshot.";
        setFeedback({ type: "error", text: message });
      } finally {
        setRestoringKey(null);
      }
    },
    [handleSynchronizeTotals, params.eventId, totals]
  );

  const handleUndo = useCallback(async () => {
    if (!undoSnapshot) {
      return;
    }

    setRestoringKey("undo");
    setFeedback(null);

    const payload = undoSnapshot.items.map((entry) => ({
      event_id: params.eventId,
      item: entry.item,
      qty: sanitizeQty(entry.new_qty),
      updated_at: new Date().toISOString()
    }));

    try {
      const { error } = await supabase
        .from("pizza_totals")
        .upsert(payload, { onConflict: "event_id,item" });

      if (error) {
        throw error;
      }

      setUndoSnapshot(null);
      setFeedback({ type: "success", text: "Rollback undone." });
      await handleSynchronizeTotals();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not undo rollback.";
      setFeedback({ type: "error", text: message });
    } finally {
      setRestoringKey(null);
    }
  }, [handleSynchronizeTotals, params.eventId, undoSnapshot]);

  const isSyncing = saveState.item !== null || restoringKey !== null;
  const isDirty = PIZZA_TYPES.some((pizza) => draftTotals[pizza.id] !== totals[pizza.id]);
  const syncStatus = isSyncing ? "syncing" : isDirty ? "stale" : "synced";
  const syncLabel =
    syncStatus === "synced" ? "Synced" : syncStatus === "syncing" ? "Syncing..." : "Out of sync";
  const syncIndicatorClass =
    syncStatus === "synced"
      ? "bg-emerald-500"
      : syncStatus === "syncing"
        ? "bg-amber-400 animate-pulse"
        : "bg-rose-500";

  const totalPizzas = useMemo(
    () => PIZZA_TYPES.reduce((sum, pizza) => sum + (totals[pizza.id] ?? 0), 0),
    [totals]
  );

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">Live counter</p>
          <h1 className="text-3xl font-semibold text-slate-100">
            {eventLoading ? "Loading event..." : eventDetails?.name ?? "Event"}
          </h1>
          {eventError ? (
            <p className="text-sm text-rose-300">{eventError}</p>
          ) : (
            <p className="text-sm text-slate-300">
              {eventDay
                ? `Scheduled for ${eventDay}`
                : "Keep pizzas flowing and we will tally the pies."}
            </p>
          )}
        </div>

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

        {undoSnapshot && (
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={restoringKey !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {restoringKey === "undo" ? "Undoing..." : "Undo rollback"}
          </button>
        )}
      </header>

      <div className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <p className="text-sm font-semibold text-slate-100" aria-live="polite" aria-atomic="true">
            Total: <span className="font-semibold text-slate-100">{totalPizzas}</span>
          </p>
          <div className="flex items-center gap-2">
            {syncStatus !== "synced" && (
              <span className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-200`}>
                <span className={`h-2 w-2 rounded-full ${syncIndicatorClass}`} />
                {syncLabel}
              </span>
            )}
            <button
              type="button"
              onClick={handleOpenHistory}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300"
            >
              History
            </button>
          </div>
        </div>
      </div>

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
                    Previous count: {totalsLoading ? "--" : previousTotals[pizza.id] ?? 0}
                  </p>
                </header>



                <div className="mt-4 grid grid-cols-[auto,1fr,auto] items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAdjust(pizza.id, -1)}
                    disabled={
                      isSaving ||
                      restoringKey !== null ||
                      (draftTotals[pizza.id] ?? 0) <= 0
                    }
                    className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-slate-950/70 text-2xl font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
                    onKeyDown={(event) =>
                      handleInputKeyDown(event, pizza.id, Number(event.currentTarget.value))
                    }
                    className="h-12 w-full min-w-0 rounded-xl border border-white/10 bg-slate-950/80 px-3 text-center text-2xl font-semibold text-slate-100 focus:border-blue-400/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleAdjust(pizza.id, 1)}
                    disabled={isSaving || restoringKey !== null}
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

      <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Session summary</h2>
            <p className="text-xs text-slate-400">
              Total pizzas produced: <span className="font-semibold text-slate-100">{totalPizzas}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowBreakdown((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300"
          >
            {showBreakdown ? "Hide breakdown" : "View breakdown"}
          </button>
        </div>

        {showBreakdown && (
          <ul className="grid grid-cols-1 gap-2 text-sm text-slate-200 sm:grid-cols-2">
            {[...PIZZA_TYPES]
              .map((pizza) => ({ ...pizza, total: totals[pizza.id] ?? 0 }))
              .sort((a, b) => b.total - a.total)
              .map((pizza) => (
                <li
                  key={pizza.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2"
                >
                  <span>{pizza.label}</span>
                  <span className="font-semibold">{pizza.total}</span>
                </li>
              ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => void handleFinished()}
          className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          Finish & lock counts
        </button>
      </section>

      {historyOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/60"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-slate-950/95 backdrop-blur">
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">History</h2>
                <p className="text-xs uppercase tracking-wide text-slate-500">Restore previous totals</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-blue-400/60 hover:text-blue-300"
              >
                Close
              </button>
            </header>



            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {historyLoading ? (
                <p className="text-sm text-slate-300">Loading history...</p>
              ) : historyError ? (
                <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
                  {historyError}
                </p>
              ) : historySnapshots.length === 0 ? (
                <p className="text-sm text-slate-400">No snapshots yet. Adjust counts to create history.</p>
              ) : (
                historySnapshots.map((snapshot) => (
                  <article
                    key={snapshot.key}
                    className="space-y-3 rounded-xl border border-white/10 bg-slate-900/70 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-100">
                        {formatDisplayDateTime(snapshot.at)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleRestore(snapshot)}
                        disabled={restoringKey !== null}
                        className="rounded-lg border border-blue-400/60 px-3 py-1 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {restoringKey === snapshot.key ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      {snapshot.items.map((entry) => (
                        <div
                          key={entry.item}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                            snapshot.highlighted.includes(entry.item)
                              ? "border-blue-400/60 bg-blue-500/10 text-blue-200"
                              : "border-white/10 text-slate-300"
                          }`}
                        >
                          <span className="font-medium">{pizzaLabelById[entry.item]}</span>
                          <span>{entry.new_qty}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}









































