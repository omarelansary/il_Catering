"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import supabase from "../../../lib/supabaseClient";
import {
  getAllowedPizzasForEvent,
  getEventById,
  getPizzaTotals,
  upsertPizzaTotals,
} from "../../../lib/queries";
import type { EventRow, Pizza, PizzaTotal } from "../../../lib/types";

interface CounterPageProps {
  params: { eventId: string };
}

type Totals = Record<string, number>;

type Feedback = { type: "success" | "error"; text: string } | null;

interface SnapshotItem {
  pizza_id: string;
  new_qty: number;
}

interface Snapshot {
  key: string;
  at: string;
  items: SnapshotItem[];
  highlighted: string[];
  summary: string;
}

const sanitizeQty = (value: number) =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

const buildInitialTotals = (pizzas: Pizza[] = []): Totals =>
  pizzas.reduce((acc, pizza) => {
    acc[pizza.id] = 0;
    return acc;
  }, {} as Totals);

const normalizeTotals = (
  pizzas: Pizza[] = [],
  input: Partial<Totals> | Totals = {},
): Totals => {
  const result = buildInitialTotals(pizzas);
  for (const pizza of pizzas) {
    const value = (input as Totals)[pizza.id];
    result[pizza.id] = sanitizeQty(typeof value === "number" ? value : 0);
  }
  return result;
};

const totalsEqual = (pizzas: Pizza[] = [], a: Totals, b: Totals) =>
  pizzas.every((pizza) => (a[pizza.id] ?? 0) === (b[pizza.id] ?? 0));

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
    day: "numeric",
  }).format(parsed);
};

const formatDisplayDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    if (message.trim()) {
      return message;
    }
  }
  return fallback;
};

const buildSnapshotSummary = (pizzas: Pizza[], items: SnapshotItem[]) => {
  const labelById = new Map(pizzas.map((pizza) => [pizza.id, pizza.name]));
  return (
    pizzas
      .map((pizza) => {
        const match = items.find((item) => item.pizza_id === pizza.id);
        if (!match) {
          return null;
        }
        const label =
          (labelById.get(pizza.id) ?? pizza.id).split(" ")[0] ?? pizza.id;
        return `${label}:${match.new_qty}`;
      })
      .filter(Boolean)
      .join(", ") || "No data"
  );
};

const buildSnapshots = (
  rows: Array<{
    pizza_id: string | null;
    new_qty: number | null;
    at: string | null;
  }>,
  pizzas: Pizza[],
): Snapshot[] => {
  const allowedIds = new Set(pizzas.map((pizza) => pizza.id));
  const normalizedRows = rows
    .map((row) => {
      if (!row.at || typeof row.pizza_id !== "string" || row.new_qty === null) {
        return null;
      }
      if (!allowedIds.has(row.pizza_id)) {
        return null;
      }
      const atDate = new Date(row.at);
      if (Number.isNaN(atDate.getTime())) {
        return null;
      }
      return {
        pizza_id: row.pizza_id,
        new_qty: sanitizeQty(row.new_qty),
        at: atDate,
      };
    })
    .filter((row): row is { pizza_id: string; new_qty: number; at: Date } =>
      Boolean(row),
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (normalizedRows.length === 0) {
    return [];
  }

  const runningTotals = new Map<string, number>();
  for (const pizza of pizzas) {
    runningTotals.set(pizza.id, 0);
  }

  const snapshotsAsc: Snapshot[] = [];
  let bucketSecond: number | null = null;
  let bucketTime: Date | null = null;
  let changedInBucket = new Set<string>();

  const flushBucket = () => {
    if (bucketSecond === null || !bucketTime) {
      return;
    }

    const items: SnapshotItem[] = pizzas.map((pizza) => ({
      pizza_id: pizza.id,
      new_qty: runningTotals.get(pizza.id) ?? 0,
    }));

    snapshotsAsc.push({
      key: `${bucketSecond}`,
      at: bucketTime.toISOString(),
      items,
      highlighted: Array.from(changedInBucket),
      summary: buildSnapshotSummary(pizzas, items),
    });
  };

  for (const row of normalizedRows) {
    const second = Math.floor(row.at.getTime() / 1000);
    if (bucketSecond === null) {
      bucketSecond = second;
      bucketTime = row.at;
      changedInBucket = new Set<string>();
    }

    if (second !== bucketSecond) {
      flushBucket();
      bucketSecond = second;
      bucketTime = row.at;
      changedInBucket = new Set<string>();
    } else if (bucketTime && row.at.getTime() > bucketTime.getTime()) {
      bucketTime = row.at;
    }

    const previousQty = runningTotals.get(row.pizza_id) ?? 0;
    const nextQty = sanitizeQty(row.new_qty);
    runningTotals.set(row.pizza_id, nextQty);
    if (nextQty !== previousQty) {
      changedInBucket.add(row.pizza_id);
    }
  }

  flushBucket();

  return snapshotsAsc.sort((a, b) => (a.at < b.at ? 1 : -1));
};
const buildTotalsFromRows = (rows: PizzaTotal[], pizzas: Pizza[]): Totals => {
  const base = buildInitialTotals(pizzas);
  if (rows.length === 0 || pizzas.length === 0) {
    return base;
  }

  const allowedIds = new Set(pizzas.map((pizza) => pizza.id));
  for (const row of rows) {
    if (allowedIds.has(row.pizza_id)) {
      base[row.pizza_id] = sanitizeQty(row.qty);
    }
  }

  return base;
};

export default function CounterPage({ params }: CounterPageProps) {
  const [allowedPizzas, setAllowedPizzas] = useState<Pizza[]>([]);
  const [allowedLoading, setAllowedLoading] = useState<boolean>(true);
  const [allowedError, setAllowedError] = useState<string | null>(null);
  const previousAllowedRef = useRef<Pizza[]>([]);
  const packageChangeNoticeRef = useRef<{
    packageId: string | null;
    removed: number;
  } | null>(null);
  const packageIdRef = useRef<string | null | undefined>(undefined);

  const [totals, setTotals] = useState<Totals>({});
  const [draftTotals, setDraftTotals] = useState<Totals>({});
  const [previousTotals, setPreviousTotals] = useState<Totals>({});
  const totalsRef = useRef<Totals>({});
  const hasLoadedRef = useRef(false);
  const [totalsLoading, setTotalsLoading] = useState<boolean>(true);
  const [totalsError, setTotalsError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saveState, setSaveState] = useState<{ pizzaId: string | null }>({
    pizzaId: null,
  });

  const [eventDetails, setEventDetails] = useState<EventRow | null>(null);
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
    [eventDetails?.event_date],
  );

  const guestsTarget = useMemo(() => {
    const rawGuests = eventDetails?.guests;
    const parsed =
      typeof rawGuests === "number"
        ? rawGuests
        : typeof rawGuests === "string"
          ? Number.parseInt(rawGuests, 10)
          : null;

    if (typeof parsed !== "number" || Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }, [eventDetails?.guests]);

  const pizzaLabelById = useMemo(
    () =>
      Object.fromEntries(
        allowedPizzas.map((pizza) => [pizza.id, pizza.name]),
      ) as Record<string, string>,
    [allowedPizzas],
  );

  const allowedPizzaIdSet = useMemo(
    () => new Set(allowedPizzas.map((pizza) => pizza.id)),
    [allowedPizzas],
  );

  const applyTotals = useCallback(
    (incoming: Totals, pizzas: Pizza[] = allowedPizzas) => {
      const normalized = normalizeTotals(pizzas, incoming);
      if (
        hasLoadedRef.current &&
        totalsEqual(pizzas, normalized, totalsRef.current)
      ) {
        return;
      }
      const previous = hasLoadedRef.current
        ? normalizeTotals(pizzas, totalsRef.current)
        : normalized;
      setPreviousTotals(previous);
      totalsRef.current = normalized;
      setTotals(normalized);
      setDraftTotals({ ...normalized });
      hasLoadedRef.current = true;
    },
    [allowedPizzas],
  );
  const queryTotals = useCallback(
    async (pizzas: Pizza[] = allowedPizzas): Promise<Totals> => {
      const rows = await getPizzaTotals(params.eventId);
      return buildTotalsFromRows(rows, pizzas);
    },
    [allowedPizzas, params.eventId],
  );

  const applyAllowedChange = useCallback(
    (
      nextPizzas: Pizza[],
      context?: { type: "package-change"; packageId: string | null },
    ) => {
      const previous = previousAllowedRef.current;
      previousAllowedRef.current = nextPizzas;
      setAllowedPizzas(nextPizzas);

      if (context?.type === "package-change") {
        const nextIds = new Set(nextPizzas.map((pizza) => pizza.id));
        const removed = previous.filter(
          (pizza) => !nextIds.has(pizza.id),
        ).length;
        packageChangeNoticeRef.current = {
          packageId: context.packageId ?? null,
          removed,
        };
      } else {
        packageChangeNoticeRef.current = null;
      }
    },
    [],
  );

  const fetchTotals = useCallback(
    async (pizzas: Pizza[] = allowedPizzas) => {
      if (fetchLockRef.current) {
        return;
      }

      fetchLockRef.current = true;
      setTotalsLoading(true);

      setTotalsError(null);

      try {
        const nextTotals = await queryTotals(pizzas);
        applyTotals(nextTotals, pizzas);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not load totals.";
        setTotalsError(message);
      } finally {
        fetchLockRef.current = false;
        setTotalsLoading(false);
      }
    },
    [allowedPizzas, applyTotals, queryTotals],
  );

  const refreshAllowed = useCallback(
    async (context?: { type: "package-change"; packageId: string | null }) => {
      setAllowedLoading(true);
      setAllowedError(null);

      try {
        const pizzas = await getAllowedPizzasForEvent(params.eventId);
        applyAllowedChange(pizzas, context);
        await fetchTotals(pizzas);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load allowed pizzas.";
        setAllowedError(message);
      } finally {
        setAllowedLoading(false);
      }
    },
    [applyAllowedChange, fetchTotals, params.eventId],
  );

  const fetchEventDetails = useCallback(async () => {
    setEventLoading(true);
    setEventError(null);

    try {
      const event = await getEventById(params.eventId);
      setEventDetails(event);

      const newPackageId = event.package_id ?? null;
      if (packageIdRef.current === undefined) {
        packageIdRef.current = newPackageId;
        await refreshAllowed();
      } else if (packageIdRef.current !== newPackageId) {
        packageIdRef.current = newPackageId;
        await refreshAllowed({
          type: "package-change",
          packageId: newPackageId,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load event details.";
      setEventError(message);
      setEventDetails(null);
    } finally {
      setEventLoading(false);
    }
  }, [params.eventId, refreshAllowed]);

  const handleSynchronizeTotals = useCallback(async () => {
    try {
      const nextTotals = await queryTotals();
      applyTotals(nextTotals);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not refresh totals.";
      setTotalsError(message);
    }
  }, [applyTotals, queryTotals]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const { data, error } = await supabase
        .from("pizza_adjustments")
        .select("event_id, pizza_id, new_qty, at")
        .eq("event_id", params.eventId)
        .order("at", { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as Array<{
        pizza_id: string | null;
        new_qty: number | null;
        at: string | null;
      }>;
      const snapshots = buildSnapshots(rows, allowedPizzas);
      setHistorySnapshots(snapshots);
      setHistoryNeedsRefresh(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load history.";
      setHistoryError(message);
      setHistorySnapshots([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [allowedPizzas, params.eventId]);

  useEffect(() => {
    void fetchEventDetails();
  }, [fetchEventDetails]);

  useEffect(() => {
    setTotals((prev) => normalizeTotals(allowedPizzas, prev));
    setDraftTotals((prev) => normalizeTotals(allowedPizzas, prev));
    setPreviousTotals((prev) => normalizeTotals(allowedPizzas, prev));
    totalsRef.current = normalizeTotals(allowedPizzas, totalsRef.current);

    const notice = packageChangeNoticeRef.current;
    if (notice) {
      setFeedback({
        type: "success",
        text: `Package changed to ${notice.packageId ?? "updated"}. Removed ${notice.removed} pizzas not in this package.`,
      });
      packageChangeNoticeRef.current = null;
    }
  }, [allowedPizzas]);

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
          filter: `event_id=eq.${params.eventId}`,
        },
        () => {
          void handleSynchronizeTotals();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [handleSynchronizeTotals, params.eventId]);

  useEffect(() => {
    const channel = supabase
      .channel(`events:${params.eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `id=eq.${params.eventId}`,
        },
        () => {
          void fetchEventDetails();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchEventDetails, params.eventId]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const commitCount = useCallback(
    async (pizzaId: string, targetValue: number) => {
      if (!allowedPizzaIdSet.has(pizzaId)) {
        return;
      }

      const sanitized = sanitizeQty(targetValue);
      setDraftTotals((current) => ({ ...current, [pizzaId]: sanitized }));

      const currentValue = totals[pizzaId] ?? 0;
      if (sanitized === currentValue) {
        setFeedback({ type: "success", text: "All caught up." });
        return;
      }

      setSaveState({ pizzaId });
      setFeedback(null);

      try {
        await upsertPizzaTotals(params.eventId, { [pizzaId]: sanitized });

        setFeedback({
          type: "success",
          text: `Saved ${pizzaLabelById[pizzaId] ?? pizzaId} count (${sanitized}).`,
        });

        await handleSynchronizeTotals();
      } catch (error) {
        console.error("Failed to update pizza totals", error);
        const message = getErrorMessage(error, "Could not update pizzas.");
        setFeedback({ type: "error", text: message });
      } finally {
        setSaveState({ pizzaId: null });
      }
    },
    [
      allowedPizzaIdSet,
      handleSynchronizeTotals,
      params.eventId,
      pizzaLabelById,
      totals,
    ],
  );

  const handleAdjust = useCallback(
    (pizzaId: string, delta: number) => {
      if (
        !allowedPizzaIdSet.has(pizzaId) ||
        saveState.pizzaId ||
        restoringKey
      ) {
        return;
      }

      const currentValue = draftTotals[pizzaId] ?? 0;
      const nextValue = Math.max(0, currentValue + delta);
      void commitCount(pizzaId, nextValue);
    },
    [
      allowedPizzaIdSet,
      commitCount,
      draftTotals,
      restoringKey,
      saveState.pizzaId,
    ],
  );

  const handleInputChange = useCallback(
    (pizzaId: string, rawValue: string) => {
      if (!allowedPizzaIdSet.has(pizzaId)) {
        return;
      }

      const numeric = Number(rawValue);
      if (!Number.isNaN(numeric)) {
        setDraftTotals((current) => ({
          ...current,
          [pizzaId]: sanitizeQty(numeric),
        }));
      }
    },
    [allowedPizzaIdSet],
  );

  const handleInputBlur = useCallback(
    (pizzaId: string, value: number) => {
      if (!allowedPizzaIdSet.has(pizzaId)) {
        return;
      }

      void commitCount(pizzaId, value);
    },
    [allowedPizzaIdSet, commitCount],
  );

  const handleInputKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLInputElement>,
      pizzaId: string,
      value: number,
    ) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
        void commitCount(pizzaId, value);
      }
    },
    [commitCount],
  );

  const handleFinished = useCallback(async () => {
    setFeedback(null);
    await handleSynchronizeTotals();
    setFeedback({
      type: "success",
      text: "Totals synced. Ready for the next rush.",
    });
  }, [handleSynchronizeTotals]);

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
    setHistoryNeedsRefresh(true);
  }, []);

  const handleRestore = useCallback(
    async (snapshot: Snapshot) => {
      if (snapshot.items.length === 0) {
        setFeedback({
          type: "error",
          text: "Snapshot has no data to restore.",
        });
        return;
      }

      setRestoringKey(snapshot.key);
      setFeedback(null);

      try {
        const payloadEntries = snapshot.items
          .filter((entry) => allowedPizzaIdSet.has(entry.pizza_id))
          .map(
            (entry) => [entry.pizza_id, sanitizeQty(entry.new_qty)] as const,
          );

        if (payloadEntries.length === 0) {
          setFeedback({
            type: "error",
            text: "No valid pizzas to restore for this package.",
          });
          setRestoringKey(null);
          return;
        }

        const payload = Object.fromEntries(payloadEntries) as Record<
          string,
          number
        >;

        const currentTotals = normalizeTotals(allowedPizzas, totals);
        const previousItems: SnapshotItem[] = allowedPizzas.map((pizza) => ({
          pizza_id: pizza.id,
          new_qty: currentTotals[pizza.id] ?? 0,
        }));
        const snapshotMap = new Map(
          snapshot.items.map((entry) => [entry.pizza_id, entry.new_qty]),
        );
        const undoHighlights = allowedPizzas
          .map((pizza) => pizza.id)
          .filter(
            (id) => (snapshotMap.get(id) ?? 0) !== (currentTotals[id] ?? 0),
          );

        await upsertPizzaTotals(params.eventId, payload);

        setUndoSnapshot({
          key: `undo-${Date.now()}`,
          at: new Date().toISOString(),
          items: previousItems,
          highlighted: undoHighlights,
          summary: buildSnapshotSummary(allowedPizzas, previousItems),
        });

        setFeedback({ type: "success", text: "Snapshot restored." });
        setHistoryOpen(false);
        setHistoryNeedsRefresh(true);
        await handleSynchronizeTotals();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not restore snapshot.";
        setFeedback({ type: "error", text: message });
      } finally {
        setRestoringKey(null);
      }
    },
    [
      allowedPizzaIdSet,
      allowedPizzas,
      handleSynchronizeTotals,
      params.eventId,
      totals,
    ],
  );

  const handleUndo = useCallback(async () => {
    if (!undoSnapshot) {
      return;
    }

    setRestoringKey("undo");
    setFeedback(null);

    try {
      const payloadEntries = undoSnapshot.items
        .filter((entry) => allowedPizzaIdSet.has(entry.pizza_id))
        .map((entry) => [entry.pizza_id, sanitizeQty(entry.new_qty)] as const);

      if (payloadEntries.length === 0) {
        setFeedback({
          type: "error",
          text: "Nothing to undo for this package.",
        });
        setRestoringKey(null);
        return;
      }

      const payload = Object.fromEntries(payloadEntries) as Record<
        string,
        number
      >;

      await upsertPizzaTotals(params.eventId, payload);
      setFeedback({ type: "success", text: "Undo applied." });
      setUndoSnapshot(null);
      await handleSynchronizeTotals();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not undo restore.";
      setFeedback({ type: "error", text: message });
    } finally {
      setRestoringKey(null);
    }
  }, [
    allowedPizzaIdSet,
    handleSynchronizeTotals,
    params.eventId,
    undoSnapshot,
  ]);

  const isSyncing = saveState.pizzaId !== null || restoringKey !== null;
  const isDirty = allowedPizzas.some(
    (pizza) => draftTotals[pizza.id] !== totals[pizza.id],
  );
  const syncStatus = isSyncing ? "syncing" : isDirty ? "stale" : "synced";
  const syncLabel =
    syncStatus === "synced"
      ? "Synced"
      : syncStatus === "syncing"
        ? "Syncing..."
        : "Out of sync";
  const syncIndicatorClass =
    syncStatus === "synced"
      ? "bg-emerald-500"
      : syncStatus === "syncing"
        ? "bg-amber-400 animate-pulse"
        : "bg-rose-500";

  const totalPizzas = useMemo(
    () =>
      allowedPizzas.reduce((sum, pizza) => sum + (totals[pizza.id] ?? 0), 0),
    [allowedPizzas, totals],
  );

  const productionProgress = useMemo(() => {
    if (guestsTarget === null) {
      return null;
    }

    const percentRaw =
      guestsTarget === 0 ? 0 : (totalPizzas / guestsTarget) * 100;
    const percent = Math.round(percentRaw * 10) / 10;
    const barPercent = Math.max(0, Math.min(percentRaw, 100));
    const remaining = Math.round(guestsTarget - totalPizzas);
    const statusType =
      remaining > 0 ? "remaining" : remaining < 0 ? "surplus" : "met";
    const absRemaining = Math.abs(remaining);
    const plural = absRemaining === 1 ? "" : "s";
    let statusLabel = "Target met";

    if (statusType === "remaining") {
      statusLabel = absRemaining + " pizza" + plural + " to go";
    } else if (statusType === "surplus") {
      statusLabel = absRemaining + " extra pizza" + plural;
    }

    const statusClass =
      statusType === "remaining"
        ? "text-amber-300"
        : statusType === "surplus"
          ? "text-sky-300"
          : "text-emerald-300";

    const barColor =
      statusType === "remaining"
        ? "bg-amber-400"
        : statusType === "surplus"
          ? "bg-sky-400"
          : "bg-emerald-500";

    return {
      percent,
      barPercent,
      remaining,
      statusType,
      statusLabel,
      statusClass,
      barColor,
      target: guestsTarget,
    };
  }, [guestsTarget, totalPizzas]);

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Live counter
          </p>
          <h1 className="text-3xl font-semibold text-slate-100">
            {eventLoading
              ? "Loading event..."
              : (eventDetails?.name ?? "Event")}
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
          <p
            className="text-sm font-semibold text-slate-100"
            aria-live="polite"
            aria-atomic="true"
          >
            Total:{" "}
            <span className="font-semibold text-slate-100">{totalPizzas}</span>
          </p>
          <div className="flex items-center gap-2">
            {syncStatus !== "synced" && (
              <span
                className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-200`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${syncIndicatorClass}`}
                />
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

        {allowedError && (
          <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {allowedError}
          </p>
        )}

        {allowedLoading && allowedPizzas.length === 0 ? (
          <p className="text-sm text-slate-300">
            Loading pizzas for this package...
          </p>
        ) : allowedPizzas.length === 0 ? (
          <p className="text-sm text-slate-300">
            No pizzas allowed for this package yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {allowedPizzas.map((pizza) => {
              const draftValue = draftTotals[pizza.id] ?? 0;
              const isSaving = saveState.pizzaId === pizza.id;

              return (
                <div
                  key={pizza.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-inner shadow-black/30"
                >
                  <header className="flex flex-col gap-1">
                    <p className="text-lg font-semibold text-slate-100">
                      {pizzaLabelById[pizza.id]}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Previous count:{" "}
                      {totalsLoading ? "--" : (previousTotals[pizza.id] ?? 0)}
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
                      onChange={(event) =>
                        handleInputChange(pizza.id, event.target.value)
                      }
                      onBlur={(event) =>
                        handleInputBlur(pizza.id, Number(event.target.value))
                      }
                      onKeyDown={(event) =>
                        handleInputKeyDown(
                          event,
                          pizza.id,
                          Number(event.currentTarget.value),
                        )
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
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Session summary
            </h2>
            <p className="text-xs text-slate-400">
              Total pizzas produced:{" "}
              <span className="font-semibold text-slate-100">
                {totalPizzas}
              </span>
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

        <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
            <span>Production progress</span>
            {productionProgress ? (
              <span className="text-sm font-semibold text-slate-100">
                {productionProgress.percent}%
              </span>
            ) : null}
          </div>
          {productionProgress ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>
                  {totalPizzas} / {productionProgress.target} pizzas
                </span>
                <span
                  className={
                    "text-xs font-medium " + productionProgress.statusClass
                  }
                >
                  {productionProgress.statusLabel}
                </span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-800/70">
                <div
                  className={
                    "h-full rounded-full " + productionProgress.barColor
                  }
                  style={{ width: productionProgress.barPercent + "%" }}
                />
                {productionProgress.percent > 100 ? (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 text-[10px] font-semibold text-sky-200">
                    {Math.round(productionProgress.percent)}%
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              Add a guest count for this event to track production progress.
            </p>
          )}
        </div>

        {showBreakdown && (
          <ul className="grid grid-cols-1 gap-2 text-sm text-slate-200 sm:grid-cols-2">
            {[...allowedPizzas]
              .map((pizza) => ({ ...pizza, total: totals[pizza.id] ?? 0 }))
              .sort((a, b) => b.total - a.total)
              .map((pizza) => (
                <li
                  key={pizza.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2"
                >
                  <span>{pizzaLabelById[pizza.id]}</span>
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
                <h2 className="text-lg font-semibold text-slate-100">
                  History
                </h2>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Restore previous totals
                </p>
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
                <p className="text-sm text-slate-400">
                  No snapshots yet. Adjust counts to create history.
                </p>
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
                        {restoringKey === snapshot.key
                          ? "Restoring..."
                          : "Restore"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      {snapshot.items.map((entry) => (
                        <div
                          key={entry.pizza_id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                            snapshot.highlighted.includes(entry.pizza_id)
                              ? "border-blue-400/60 bg-blue-500/10 text-blue-200"
                              : "border-white/10 text-slate-300"
                          }`}
                        >
                          <span className="font-medium">
                            {pizzaLabelById[entry.pizza_id]}
                          </span>
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
