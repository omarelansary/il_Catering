'use client';

import { useState } from "react";
import supabase from "../../lib/supabaseClient";

type FormState = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  event_date: string;
  address: string;
  package: string;
  notes: string;
};

const packages = [
  { value: "", label: "Select a package" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
  { value: "vip", label: "VIP" }
];

const initialForm: FormState = {
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  event_date: "",
  address: "",
  package: "",
  notes: ""
};

export default function BookPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.customer_name.trim()) return "Name is required.";
    if (!form.customer_email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email.trim())) return "Enter a valid email.";
    if (!form.customer_phone.trim()) return "Phone is required.";
    if (!form.event_date.trim()) return "Event date and time are required.";
    if (!form.address.trim()) return "Address is required.";
    if (!form.package.trim()) return "Please select a package.";
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSuccess(false);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("booking_requests").insert({
        customer_name: form.customer_name.trim(),
        customer_email: form.customer_email.trim(),
        customer_phone: form.customer_phone.trim(),
        event_date: form.event_date,
        address: form.address.trim(),
        package: form.package,
        notes: form.notes.trim(),
        status: "requested"
      });

      if (insertError) {
        throw insertError;
      }

      setSuccess(true);
      setForm(initialForm);
    } catch (err) {
      setSuccess(false);
      setError(err instanceof Error ? err.message : "Unable to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
          Book Your Event
        </h1>
        <p className="text-sm text-slate-400">
          Tell us about your event and we&apos;ll reach out with availability and details.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {success && (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
            We received your request. Our team will contact you shortly.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-200">
            <span>Name *</span>
            <input
              name="customer_name"
              value={form.customer_name}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-200">
            <span>Email *</span>
            <input
              name="customer_email"
              type="email"
              value={form.customer_email}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-200">
            <span>Phone *</span>
            <input
              name="customer_phone"
              value={form.customer_phone}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-200">
            <span>Event date &amp; time *</span>
            <input
              name="event_date"
              type="datetime-local"
              value={form.event_date}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
            />
          </label>
        </div>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          <span>Event address *</span>
          <input
            name="address"
            value={form.address}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          <span>Package *</span>
          <select
            name="package"
            value={form.package}
            onChange={handleChange}
            required
            className="w-full appearance-none rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
          >
            {packages.map((pkg) => (
              <option key={pkg.value} value={pkg.value} disabled={pkg.value === ""}>
                {pkg.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          <span>Notes</span>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-blue-400/60 focus:outline-none"
            placeholder="Share dietary restrictions, service requests, or other details."
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Sending..." : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}
