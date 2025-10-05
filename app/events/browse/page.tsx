'use client';

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import supabase from "../../../lib/supabaseClient";

type EventRecord = {
  id: string;
  name: string;
  event_date: string;
};

const getLocalISODate = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 10);
};

const isDateOnlyString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeTimestamp = (value: string) => {
  if (!value) {
    return value;
  }
  if (isDateOnlyString(value)) {
    return `${value}T00:00:00`;
  }
  return value.includes("T") ? value : value.replace(" ", "T");
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toUTCISO = (localDate: Date) => {
  const offsetMs = localDate.getTimezoneOffset() * 60_000;
  return new Date(localDate.getTime() - offsetMs).toISOString();
};

const formatDisplayDate = (value: string) => {
  const normalized = normalizeTimestamp(value);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(parsed);
};

const getDayRangeUTC = (value: string) => {
  const localStart = new Date(`${value}T00:00:00`);
  const offsetMs = localStart.getTimezoneOffset() * 60_000;
  const utcStartMs = localStart.getTime() - offsetMs;
  const utcEndMs = utcStartMs + 24 * 60 * 60 * 1000;
  return { start: new Date(utcStartMs).toISOString(), end: new Date(utcEndMs).toISOString() };
};

const getUpcomingRangeUTC = (startDayISO: string, daysAhead = 30) => {
  const localStart = new Date(`${startDayISO}T00:00:00`);
  const startISO = toUTCISO(localStart);
  const endLocal = new Date(localStart.getTime() + daysAhead * DAY_MS);
  const endISO = toUTCISO(endLocal);
  return { startISO, endISO };
};

const getNextWeekendRangeUTC = (todayLocalISO: string) => {
  const localStart = new Date(`${todayLocalISO}T00:00:00`);
  const dayOfWeek = localStart.getDay();
  let daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    daysUntilSaturday += 7;
  }
  const saturdayStartLocal = new Date(localStart.getTime() + daysUntilSaturday * DAY_MS);
  const mondayStartLocal = new Date(saturdayStartLocal.getTime() + 2 * DAY_MS);
  return { startISO: toUTCISO(saturdayStartLocal), endISO: toUTCISO(mondayStartLocal) };
};

const toLocalDayKey = (value: string) => {
  const normalized = normalizeTimestamp(value);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return getLocalISODate(parsed);
};

const filterEventsByDay = (rows: EventRecord[], dayKey: string) =>
  rows.filter((row) => toLocalDayKey(row.event_date) === dayKey);

export default function EventsBrowsePage() {
  const today = useMemo(() => getLocalISODate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"today" | "tomorrow" | "weekend" | "date" | "auto">("today");
  const [fallbackMode, setFallbackMode] = useState<boolean>(false);
  const [weekendRange, setWeekendRange] = useState<{ startISO: string; endISO: string } | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const filterButtonBase =
    "inline-flex h-10 items-center rounded-lg border border-white/10 px-3 text-sm font-medium transition hover:border-blue-400/60 hover:text-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400";

  const isTodaySelected = useMemo(() => {
    return activeFilter === "today" || (activeFilter === "auto" && selectedDate === today);
  }, [activeFilter, selectedDate, today]);

  const handleSelectToday = useCallback(() => {
    const currentToday = getLocalISODate(new Date());
    setSelectedDate(currentToday);
    setActiveFilter("today");
    setFallbackMode(false);
    setWeekendRange(null);
  }, []);

  const handleSelectTomorrow = useCallback(() => {
    const currentToday = new Date();
    const tomorrowLocal = new Date(currentToday.getTime() + DAY_MS);
    const tomorrowISO = getLocalISODate(tomorrowLocal);
    setSelectedDate(tomorrowISO);
    setActiveFilter("tomorrow");
    setFallbackMode(false);
    setWeekendRange(null);
  }, []);

  const handleSelectWeekend = useCallback(() => {
    const baseTodayISO = getLocalISODate(new Date());
    const range = getNextWeekendRangeUTC(baseTodayISO);
    setSelectedDate(baseTodayISO);
    setWeekendRange(range);
    setActiveFilter("weekend");
    setFallbackMode(false);
  }, []);

  const handleFocusDateInput = useCallback(() => {
    dateInputRef.current?.focus();
  }, []);

  const fetchEvents = useCallback(
    async (
      eventDate: string,
      options?: {
        mode?: "day" | "weekend" | "upcoming";
        range?: { startISO: string; endISO: string };
      }
    ) => {
      const mode = options?.mode ?? "day";
      const rangeOverride = options?.range;

      if (!eventDate && mode === "day") {
        return;
      }

      if (mode !== "upcoming") {
        setFallbackMode(false);
      }

      setLoading(true);
      setError(null);

      try {
        const runQuery = async (startISO: string, endISO: string, limit?: number) => {
          let query = supabase
            .from("events")
            .select("id, name, event_date")
            .gte("event_date", startISO)
            .lt("event_date", endISO)
            .order("event_date", { ascending: true });

          if (typeof limit === "number") {
            query = query.limit(limit);
          }

          return query;
        };

        let queryStart: string | null = null;
        let queryEnd: string | null = null;
        let dayKey: string | null = null;

        if (mode === "day") {
          const { start, end } = getDayRangeUTC(eventDate);
          queryStart = start;
          queryEnd = end;
          dayKey = getLocalISODate(new Date(`${eventDate}T00:00:00`));
        } else if (rangeOverride) {
          queryStart = rangeOverride.startISO;
          queryEnd = rangeOverride.endISO;
        }

        if (!queryStart || !queryEnd) {
          setEvents([]);
          return;
        }

        const { data, error: supabaseError } = await runQuery(
          queryStart,
          queryEnd,
          mode === "upcoming" ? 50 : undefined
        );

        if (supabaseError) {
          throw supabaseError;
        }

        let rows = data ?? [];
        let filtered = mode === "day" && dayKey ? filterEventsByDay(rows, dayKey) : rows;

        const todayLocalISO = getLocalISODate(new Date());

        if (
          mode === "day" &&
          filtered.length === 0 &&
          eventDate === todayLocalISO &&
          !rangeOverride
        ) {
          const upcomingRange = getUpcomingRangeUTC(eventDate);
          const {
            data: upcomingData,
            error: upcomingError
          } = await runQuery(upcomingRange.startISO, upcomingRange.endISO, 50);

          if (upcomingError) {
            throw upcomingError;
          }

          filtered = upcomingData ?? [];
          setFallbackMode(true);
          setActiveFilter("auto");
        } else if (mode === "upcoming") {
          setFallbackMode(true);
        } else {
          setFallbackMode(false);
        }

        setEvents(filtered);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load events.";
        setError(message);
        setEvents([]);
        setFallbackMode(false);
      } finally {
        setLoading(false);
      }
    },
    [setActiveFilter]
  );

  const handleRefresh = useCallback(() => {
    if (activeFilter === "weekend" && weekendRange) {
      void fetchEvents(selectedDate, { mode: "weekend", range: weekendRange });
      return;
    }

    if (fallbackMode || activeFilter === "auto") {
      const baseDate = selectedDate || getLocalISODate(new Date());
      const upcomingRange = getUpcomingRangeUTC(baseDate);
      void fetchEvents(baseDate, { mode: "upcoming", range: upcomingRange });
      return;
    }

    void fetchEvents(selectedDate, { mode: "day" });
  }, [activeFilter, weekendRange, fetchEvents, selectedDate, fallbackMode]);

  useEffect(() => {
    if (activeFilter === "weekend" || activeFilter === "auto") {
      return;
    }
    void fetchEvents(selectedDate, { mode: "day" });
  }, [fetchEvents, selectedDate, activeFilter]);

  useEffect(() => {
    if (activeFilter !== "weekend" || !weekendRange) {
      return;
    }
    void fetchEvents(selectedDate, { mode: "weekend", range: weekendRange });
  }, [fetchEvents, selectedDate, activeFilter, weekendRange]);

  const decoratedEvents = useMemo(() => {
    const nowMs = Date.now();
    return events.map((event) => {
      const eventDate = new Date(normalizeTimestamp(event.event_date));
      const deltaMs = eventDate.getTime() - nowMs;
      return { event, deltaMs };
    });
  }, [events]);

  const nextUpEventId = useMemo(() => {
    let candidate: string | null = null;
    let minDelta = Number.POSITIVE_INFINITY;

    for (const item of decoratedEvents) {
      if (Number.isNaN(item.deltaMs)) {
        continue;
      }
      if (item.deltaMs > 0 && item.deltaMs < minDelta) {
        minDelta = item.deltaMs;
        candidate = item.event.id;
      }
    }

    return candidate;
  }, [decoratedEvents]);

  const getProximityChip = useCallback((deltaMs: number) => {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return null;
    }

    if (deltaMs < DAY_MS) {
      return {
        label: "Starts soon",
        className: "bg-amber-500/15 text-amber-300 border border-amber-400/30 animate-pulse"
      } as const;
    }

    if (deltaMs < 3 * DAY_MS) {
      const days = Math.ceil(deltaMs / DAY_MS);
      const unit = days === 1 ? "day" : "days";
      return {
        label: `In ${days} ${unit}`,
        className: "bg-blue-500/15 text-blue-300 border border-blue-400/30"
      } as const;
    }

    if (deltaMs <= 7 * DAY_MS) {
      return {
        label: "Next week",
        className: "bg-slate-500/15 text-slate-300 border border-slate-400/30"
      } as const;
    }

    return null;
  }, []);

  const contextDescription = useMemo(() => {
    const countText = `(${events.length} found)`;
    if (fallbackMode) {
      const formattedDate = formatDisplayDate(selectedDate);
      return `No events on ${formattedDate} - showing upcoming events. ${countText}`;
    }
    if (activeFilter === "weekend") {
      return `Showing events for Next weekend (local time). ${countText}`;
    }
    const formattedDate = formatDisplayDate(selectedDate);
    return `Showing events for ${formattedDate} (local time). ${countText}`;
  }, [events.length, fallbackMode, activeFilter, selectedDate]);

  return (
    <div className="space-y-10 py-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Browse events</h1>
        <p className="text-sm text-slate-300">
          Select a date to find scheduled events, then jump into the live counter or summary for each
          one.
        </p>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectToday}
              className={`${filterButtonBase} ${
                isTodaySelected ? "bg-slate-800 text-slate-100" : "text-slate-300"
              }`}
              aria-pressed={isTodaySelected}
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleSelectTomorrow}
              className={`${filterButtonBase} ${
                activeFilter === "tomorrow" ? "bg-slate-800 text-slate-100" : "text-slate-300"
              }`}
              aria-pressed={activeFilter === "tomorrow"}
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={handleSelectWeekend}
              className={`${filterButtonBase} ${
                activeFilter === "weekend" ? "bg-slate-800 text-slate-100" : "text-slate-300"
              }`}
              aria-pressed={activeFilter === "weekend"}
            >
              Next weekend
            </button>
          </div>
          <div>
            <label
              htmlFor="event-date"
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              <span>Event date (local timezone)</span>
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-slate-500">
                Pick a date
              </span>
            </label>
            <input
              id="event-date"
              type="date"
              value={selectedDate}
              ref={dateInputRef}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setActiveFilter("date");
                setFallbackMode(false);
                setWeekendRange(null);
              }}
              className="mt-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
              max="9999-12-31"
            />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex h-10 items-center rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <p className="text-sm text-slate-400" aria-live="polite">
            {contextDescription}
          </p>
        </div>

        {fallbackMode && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-400/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-200">
            <span>
              No events on {formatDisplayDate(selectedDate)}. Showing upcoming events.
            </span>
            <button
              type="button"
              onClick={handleFocusDateInput}
              className="text-xs font-semibold text-blue-300 underline decoration-dotted underline-offset-4 hover:text-blue-200"
            >
              Change date
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {fallbackMode && !error && !loading && events.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
            No upcoming events in the next 30 days.
          </p>
        )}

        {!fallbackMode && !error && !loading && events.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
            No events scheduled for this date. Pick another day to explore past or upcoming events.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {decoratedEvents.map(({ event, deltaMs }) => {
            const proximity = getProximityChip(deltaMs);
            const isNextUp = nextUpEventId === event.id && deltaMs > 0;

            return (
              <article
                key={event.id}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/20"
              >
                {isNextUp && (
                  <span className="absolute inset-y-4 left-0 w-1 rounded-full bg-amber-400" aria-hidden="true" />
                )}
                <div className={isNextUp ? "pl-3" : undefined}>
                  {isNextUp && (
                    <span className="mb-3 inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
                      Next up
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-100">{event.name}</h2>
                      <p className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                        {formatDisplayDate(event.event_date)}
                        {proximity && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${proximity.className}`}
                          >
                            {proximity.label}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wide text-blue-300">Live counter</span>
                  </div>
                  <div className="mt-6 flex flex-col gap-2 text-sm">
                    <Link
                      href={`/counter/${event.id}`}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-400"
                    >
                      Open pizza counter
                    </Link>
                    <Link
                      href={`/events/${event.id}/summary`}
                      className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300"
                    >
                      View event summary
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}

          {loading && (
            <article className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-sm text-slate-300">
              Fetching events...
            </article>
          )}
        </div>
      </section>
    </div>
  );
}
