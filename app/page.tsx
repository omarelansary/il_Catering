'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../lib/supabaseClient";

interface EventRecord {
  id: string;
  name: string;
  event_date: string;
}

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

export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const today = useMemo(() => getLocalISODate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(
    async (eventDate: string) => {
      if (!eventDate) {
        return;
      }

      const { start, end } = getDayRangeUTC(eventDate);
      const dayKey = getLocalISODate(new Date(`${eventDate}T00:00:00`));

      setLoading(true);
      setError(null);

      try {
        const { data, error: supabaseError } = await supabase
          .from("events")
          .select("id, name, event_date")
          .gte("event_date", start)
          .lt("event_date", end)
          .order("event_date", { ascending: true });
        console.log({ start, end, data, supabaseError });
        if (supabaseError) {
          throw supabaseError;
        }

        let rows = data ?? [];
        let filtered = filterEventsByDay(rows, dayKey);

        if (filtered.length === 0) {
          const fallback = await supabase
            .from("events")
            .select("id, name, event_date")
            .order("event_date", { ascending: true })
            .limit(50);

          if (!fallback.error && fallback.data) {
            rows = fallback.data;
            filtered = filterEventsByDay(rows, dayKey);
          }
        }

        setEvents(filtered);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load events.";
        setError(message);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchEvents(selectedDate);
  }, [fetchEvents, selectedDate]);

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Event pizza tracking made simple</h1>
        <p className="max-w-2xl text-slate-300">
          Choose an event date to jump into the live counter or review the pizza summary once the
          party wraps.
        </p>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Event date (local timezone)
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="mt-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
              max="9999-12-31"
            />
          </div>
          <button
            type="button"
            onClick={() => void fetchEvents(selectedDate)}
            disabled={loading || !authorized}
            className="inline-flex h-10 items-center rounded-lg border border-white/10 px-4 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <span className="text-sm text-slate-400">
            Showing events for {formatDisplayDate(selectedDate)}
          </span>
        </div>

        {error && (
          <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {!error && !loading && events.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
            No events scheduled for this date. Pick another day to explore past or upcoming events.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <article
              key={event.id}
              className="rounded-xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/20"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{event.name}</h2>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {formatDisplayDate(event.event_date)}
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
                  View pizza summary
                </Link>
              </div>
            </article>
          ))}

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
