"use client";

import { useMemo, useState } from "react";

type PackageSummary = {
  id: "standard" | "premium";
  label: string;
  min_guests: number | null;
  pricing_note: string | null;
};

type PricingCalculatorProps = {
  packages: PackageSummary[];
};

const STANDARD_TIERS = [
  { min: 100, price: 300 },
  { min: 50, price: 320 },
  { min: 25, price: 340 },
];

const PREMIUM_PRICE_PER_GUEST = 750;

const PricingCalculator: React.FC<PricingCalculatorProps> = ({ packages }) => {
  const [packageId, setPackageId] = useState<"standard" | "premium">(
    "standard",
  );
  const [guestCount, setGuestCount] = useState<number>(50);

  const packageMap = useMemo(
    () =>
      packages.reduce<Record<string, PackageSummary>>((acc, pkg) => {
        acc[pkg.id] = pkg;
        return acc;
      }, {}),
    [packages],
  );

  const selectedPackage = packageMap[packageId];

  const standardPricePerGuest = useMemo(() => {
    if (packageId !== "standard") {
      return null;
    }

    const tier = STANDARD_TIERS.find((entry) => guestCount >= entry.min);
    return (
      tier?.price ?? STANDARD_TIERS[STANDARD_TIERS.length - 1]?.price ?? null
    );
  }, [guestCount, packageId]);

  const pricePerGuest =
    packageId === "standard" ? standardPricePerGuest : PREMIUM_PRICE_PER_GUEST;
  const estimatedTotal =
    pricePerGuest !== null && Number.isFinite(pricePerGuest)
      ? pricePerGuest * Math.max(guestCount, 0)
      : null;

  return (
    <section aria-labelledby="pricing-calculator" className="space-y-4">
      <div>
        <h2
          id="pricing-calculator"
          className="text-lg font-semibold text-slate-100"
        >
          Pricing calculator
        </h2>
        <p className="text-sm text-slate-400">
          Estimate your event cost by package and guest count. Transportation is
          quoted separately.
        </p>
      </div>

      <form className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-sm text-slate-200">
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wide text-slate-400">
            Select package
          </legend>
          <div className="flex flex-wrap gap-3">
            {(["standard", "premium"] as const).map((id) => {
              const isActive = packageId === id;
              return (
                <label
                  key={id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition ${
                    isActive
                      ? "border-blue-400/60 bg-blue-500/10 text-blue-200"
                      : "border-white/10 text-slate-200 hover:border-blue-400/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="package"
                    value={id}
                    checked={isActive}
                    onChange={() => setPackageId(id)}
                    className="h-4 w-4 accent-blue-400"
                  />
                  <span className="font-medium capitalize">
                    {packageMap[id]?.label ?? id}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            Guests
          </span>
          <input
            type="number"
            min={0}
            value={Number.isNaN(guestCount) ? "" : guestCount}
            onChange={(event) => {
              const next = Number(event.target.value);
              setGuestCount(Number.isFinite(next) ? next : 0);
            }}
            className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-slate-100 focus:border-blue-400/60 focus:outline-none"
            placeholder="50"
            aria-describedby="package-min-note"
          />
        </label>

        {selectedPackage?.min_guests ? (
          <p id="package-min-note" className="text-xs text-slate-400">
            Minimum recommended guests for {selectedPackage.label}:{" "}
            {selectedPackage.min_guests}.
          </p>
        ) : null}

        <dl className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/80 p-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-300">Price per guest</dt>
            <dd className="font-semibold text-slate-100">
              {pricePerGuest !== null
                ? `${pricePerGuest.toLocaleString("en-US")} EGP`
                : "�"}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 pt-2">
            <dt className="text-slate-300">Estimated total</dt>
            <dd className="text-lg font-semibold text-slate-100">
              {estimatedTotal !== null
                ? `${estimatedTotal.toLocaleString("en-US")} EGP`
                : "�"}
            </dd>
          </div>
        </dl>

        {packageId === "premium" ? (
          <p className="text-xs text-blue-200">
            Premium pricing includes full service at 750 EGP per guest.
            Transportation is quoted separately.
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            Standard pricing scales down for larger guest counts. Transportation
            is quoted separately.
          </p>
        )}

        {selectedPackage?.pricing_note && (
          <p className="text-xs text-slate-400">
            {selectedPackage.pricing_note}
          </p>
        )}
      </form>
    </section>
  );
};

export default PricingCalculator;
