'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabaseClient";
import { buildIcs } from "../../../lib/ics";
import type { PackageId } from "../../../lib/types";

type Booking = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  event_date: string | null;
  address: string;
  package: PackageId | null;
  guests: number | null;
  status: "requested" | "approved" | "rejected" | "converted";
  notes: string | null;
  created_at: string | null;
  event_id?: string | null;
};

type StatusFilter = "all" | "requested" | "approved" | "rejected" | "converted";

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "converted", label: "Converted" }
];

// TODO: replace stub with real admin check using Supabase admins table.
async function isAdmin(): Promise<boolean> {
  return true;
}

export default function AdminBookingsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [approveForm, setApproveForm] = useState({
    name: "",
    event_date: "",
    address: ""
  });

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from("booking_requests")
        .select("*")
        .filter("status", "in", "(requested,approved,rejected,converted)")
        .order("event_date", { ascending: true });

      if (queryError) {
        throw queryError;
      }

      setBookings((data as Booking[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const admin = await isAdmin();
      setAuthorized(admin);
      if (admin) {
        await fetchBookings();
      }
    })();
  }, [fetchBookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      if (statusFilter !== "all" && booking.status !== statusFilter) {
        return false;
      }

      if (dateFilter) {
        const filterDate = new Date(dateFilter);
        const bookingDate = booking.event_date ? new Date(booking.event_date) : null;

        if (!bookingDate) {
          return false;
        }

        const sameDay =
          bookingDate.getFullYear() === filterDate.getFullYear() &&
          bookingDate.getMonth() === filterDate.getMonth() &&
          bookingDate.getDate() === filterDate.getDate();

        if (!sameDay) {
          return false;
        }
      }

      return true;
    });
  }, [bookings, statusFilter, dateFilter]);

  const toLocalDateTimeValue = (value: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const handleApproveOpen = (booking: Booking) => {
    setSelectedBooking(booking);
    setApproveForm({
      name: `${booking.customer_name} Event`,
      event_date: toLocalDateTimeValue(booking.event_date),
      address: booking.address
    });
    setApproveError(null);
    setApproveModalOpen(true);
  };

  const handleApproveClose = () => {
    setApproveModalOpen(false);
    setApproveLoading(false);
    setApproveError(null);
    setSelectedBooking(null);
  };

  const handleApproveConfirm = useCallback(async () => {
    if (!selectedBooking) return;

    if (!approveForm.name.trim()) {
      setApproveError("Event name is required.");
      return;
    }

    if (!approveForm.event_date) {
      setApproveError("Event date is required.");
      return;
    }

    if (!approveForm.address.trim()) {
      setApproveError("Event address is required.");
      return;
    }

    setApproveLoading(true);
    setApproveError(null);

    const isoEventDate = new Date(approveForm.event_date).toISOString();

    let eventId: string | null = null;

    try {
      const { data: insertedEvent, error: insertEventError } = await supabase
        .from("events")
        .insert([
          {
            name: approveForm.name.trim(),
            event_date: isoEventDate,
            address: approveForm.address.trim(),
            status: "approved",
            package_id: selectedBooking?.package ?? null,
            guests: selectedBooking?.guests ?? null
          }
        ])
        .select("id")
        .single();

      if (insertEventError || !insertedEvent) {
        throw insertEventError ?? new Error("Event creation failed.");
      }

      eventId = insertedEvent.id as unknown as string;

      const { error: updateBookingError } = await supabase
        .from("booking_requests")
        .update({
          status: "converted",
          event_id: eventId
        })
        .eq("id", selectedBooking.id);

      if (updateBookingError) {
        throw updateBookingError;
      }

      handleApproveClose();
      await fetchBookings();
    } catch (err) {
      if (eventId) {
        void supabase.from("events").delete().eq("id", eventId);
      }
      setApproveError(
        err instanceof Error ? err.message : "Unable to approve this booking. Try again."
      );
    } finally {
      setApproveLoading(false);
    }
  }, [approveForm, fetchBookings, selectedBooking]);

  const handleDownloadIcs = useCallback((booking: Booking) => {
    if (!booking.event_date) {
      return;
    }

    try {
      const ics = buildIcs({
        name: `${booking.customer_name} Event`,
        start: booking.event_date,
        address: booking.address,
        description: booking.notes ?? undefined
      });

      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = booking.customer_name.replace(/\s+/g, '_') || 'event';
      link.href = url;
      link.download = `${safeName}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (icsError) {
      console.error('Failed to generate ICS file', icsError);
    }
  }, []);

  if (authorized === false) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          Not authorized to view this page.
        </div>
      </div>
    );
  }

  if (authorized === null) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-12 text-sm text-slate-300">
        Checking access…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12 space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
            Booking requests
          </h1>
          <p className="text-sm text-slate-400">
            Review and manage incoming booking requests.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchBookings()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Status filter
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full appearance-none rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Event date
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-slate-100">
            <thead>
              <tr className="bg-white/5 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredBookings.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-slate-400"
                  >
                    {loading ? "Loading bookings…" : "No bookings found."}
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 text-sm text-slate-200">
                      {booking.event_date
                        ? new Date(booking.event_date).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200">
                      <div className="font-semibold">{booking.customer_name}</div>
                      <div className="text-xs text-slate-400">
                        {[booking.customer_email, booking.customer_phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200">
                      {booking.address}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200 capitalize">
                      {booking.package ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium capitalize text-slate-200">
                      {booking.status}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApproveOpen(booking)}
                          disabled={
                            approveLoading ||
                            booking.status === "converted" ||
                            booking.status === "rejected"
                          }
                          className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-emerald-400/60 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Approve
                        </button>
                        {booking.status === "converted" && booking.event_date && (
                          <button
                            type="button"
                            onClick={() => handleDownloadIcs(booking)}
                            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-blue-400/60 hover:text-blue-300"
                          >
                            Download .ics
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {approveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950/90 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Approve booking</h2>
            <p className="mt-1 text-sm text-slate-400">
              Create an event and convert this booking request.
            </p>

            <div className="mt-6 space-y-4 text-sm text-slate-100">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Event name
                </span>
                <input
                  value={approveForm.name}
                  onChange={(event) =>
                    setApproveForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm focus:border-blue-400/60 focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Event date &amp; time
                </span>
                <input
                  type="datetime-local"
                  value={approveForm.event_date}
                  onChange={(event) =>
                    setApproveForm((prev) => ({ ...prev, event_date: event.target.value }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm focus:border-blue-400/60 focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Address
                </span>
                <input
                  value={approveForm.address}
                  onChange={(event) =>
                    setApproveForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm focus:border-blue-400/60 focus:outline-none"
                />
              </label>

              {approveError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
                  {approveError}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleApproveClose}
                disabled={approveLoading}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-400/60 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApproveConfirm()}
                disabled={approveLoading}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {approveLoading ? "Approving…" : "Approve & create event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
