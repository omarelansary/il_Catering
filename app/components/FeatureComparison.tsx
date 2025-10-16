import type { FC } from "react";

type PackageSummary = {
  id: "standard" | "premium";
  label: string;
  min_guests: number | null;
  pricing_note: string | null;
};

type FeatureComparisonProps = {
  packages: PackageSummary[];
};

const FEATURES = [
  { label: "Pizzas (8 types)", standard: true, premium: true },
  { label: "Antipasti", standard: false, premium: true },
  { label: "Dolci", standard: true, premium: true },
  { label: "Drinks", standard: false, premium: true },
  { label: "Live pizza show", standard: true, premium: true },
  { label: "Pizza slice holders", standard: true, premium: true },
  { label: "Servers", standard: true, premium: true },
  { label: "Seamless setup", standard: false, premium: true },
] as const;

const TICK = "✓";
const CROSS = "-";

const FeatureComparison: FC<FeatureComparisonProps> = ({ packages }) => {
  const packageMap = packages.reduce<Record<string, PackageSummary>>(
    (acc, pkg) => {
      acc[pkg.id] = pkg;
      return acc;
    },
    {},
  );

  const standard = packageMap["standard"];
  const premium = packageMap["premium"];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
      <table className="w-full text-left text-sm text-slate-200">
        <caption className="sr-only">Package feature comparison</caption>
        <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Feature
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-center">
              {standard?.label ?? "Standard"}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-center">
              {premium?.label ?? "Premium"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {FEATURES.map((feature) => (
            <tr key={feature.label}>
              <th scope="row" className="px-4 py-3 text-slate-100">
                {feature.label}
              </th>
              <td className="px-4 py-3 text-center">
                <span
                  className={
                    feature.standard ? "text-emerald-300" : "text-slate-500"
                  }
                >
                  {feature.standard ? TICK : CROSS}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={
                    feature.premium ? "text-emerald-300" : "text-slate-500"
                  }
                >
                  {feature.premium ? TICK : CROSS}
                </span>
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="px-4 py-3 text-slate-100">
              Min guests
            </th>
            <td className="px-4 py-3 text-center">
              <span className="font-medium text-slate-100">
                {standard?.min_guests ?? "�"}
              </span>
            </td>
            <td className="px-4 py-3 text-center">
              <span className="font-medium text-slate-100">
                {premium?.min_guests ?? "�"}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default FeatureComparison;
