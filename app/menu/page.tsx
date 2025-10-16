import { createClient } from "@supabase/supabase-js";
import FeatureComparison from "../components/FeatureComparison";
import PricingCalculator from "../components/PricingCalculator";

type MenuPizza = {
  id: string;
  name: string;
  description: string | null;
  vegetarian: boolean;
  vegan: boolean;
};

type PackageSummary = {
  id: "standard" | "premium";
  label: string;
  blurb: string | null;
  description: string | null;
  min_guests: number | null;
  pricing_note: string | null;
};

const getEnv = (value: string | undefined, key: string) => {
  if (!value) {
    throw new Error(
      `Missing ${key}. Add it to your environment configuration.`,
    );
  }
  return value;
};

const supabaseUrl = getEnv(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);
const supabaseAnonKey = getEnv(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

async function fetchMenuData() {
  const [
    { data: pizzaRows, error: pizzasError },
    { data: packageRows, error: packagesError },
  ] = await Promise.all([
    supabase
      .from("pizzas")
      .select(
        "id, name, description, vegetarian, vegan, package_pizzas!inner(package_id)",
      )
      .eq("package_pizzas.package_id", "standard")
      .order("name", { ascending: true }),
    supabase
      .from("packages")
      .select("id, label, blurb, description, min_guests, pricing_note")
      .in("id", ["standard", "premium"])
      .order("id", { ascending: true }),
  ]);

  if (pizzasError) {
    throw pizzasError;
  }
  if (packagesError) {
    throw packagesError;
  }

  const pizzas: MenuPizza[] = (pizzaRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    vegetarian: Boolean(row.vegetarian),
    vegan: Boolean(row.vegan),
  }));

  const packages: PackageSummary[] = (packageRows ?? []).map((row) => ({
    id: row.id as "standard" | "premium",
    label: row.label,
    blurb: row.blurb,
    description: row.description,
    min_guests: row.min_guests,
    pricing_note: row.pricing_note,
  }));

  return { pizzas, packages };
}

export default async function MenuPage() {
  let pizzas: MenuPizza[] = [];
  let packages: PackageSummary[] = [];
  let error: string | null = null;

  try {
    const data = await fetchMenuData();
    pizzas = data.pizzas;
    packages = data.packages;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load menu data.";
  }

  const packageMap = packages.reduce<Record<string, PackageSummary>>(
    (acc, pkg) => {
      acc[pkg.id] = pkg;
      return acc;
    },
    {},
  );

  const premium = packageMap["premium"];
  const subtitle =
    premium?.blurb ??
    "Wood-fired pizzas, antipasti, and dolci for every gathering.";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Our menu
        </p>
        <h1 className="text-3xl font-semibold text-slate-100">Menu</h1>
        <p className="text-sm text-slate-300">{subtitle}</p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : pizzas.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
          No pizzas available yet. Check back soon for our full menu.
        </div>
      ) : (
        <section aria-labelledby="menu-pizzas" className="space-y-4">
          <div>
            <h2
              id="menu-pizzas"
              className="text-lg font-semibold text-slate-100"
            >
              Wood-fired pizzas
            </h2>
            <p className="text-sm text-slate-400">
              Eight signature pies served across every package.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {pizzas.map((pizza) => (
              <article
                key={pizza.id}
                className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/70 p-3 sm:p-5"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100 sm:text-base">
                      {pizza.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 text-[10px] sm:text-xs">
                      {pizza.vegetarian && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">
                          Vegetarian
                        </span>
                      )}
                      {pizza.vegan && (
                        <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-300">
                          Vegan
                        </span>
                      )}
                      {!pizza.vegetarian && !pizza.vegan && (
                        <span className="rounded-full bg-slate-800/80 px-1.5 py-0.5 font-semibold text-slate-300">
                          Contains meat
                        </span>
                      )}
                    </div>
                  </div>
                  {pizza.description ? (
                    <>
                      <p className="mt-1 hidden text-sm leading-snug text-slate-300 md:block">
                        {pizza.description}
                      </p>
                      <details className="group mt-1 md:hidden">
                        <summary
                          className="inline-flex cursor-pointer select-none items-center gap-1 text-xs text-slate-300/80 hover:text-slate-200"
                          aria-label={`Toggle description for ${pizza.name}`}
                        >
                          <svg
                            className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M7 5l6 5-6 5V5z" />
                          </svg>
                          <span className="group-open:hidden ">Read more</span>
                          <span className="hidden group-open:inline underline decoration-dotted">Read less</span>
                        </summary>
                        <p className="mt-1 text-xs leading-snug text-slate-300">{pizza.description}</p>
                      </details>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 sm:text-sm">
                      Description coming soon.
                    </p>
                  )}
                </div>
                
              </article>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="menu-extras" className="space-y-4">
        <div>
          <h2 id="menu-extras" className="text-lg font-semibold text-slate-100">
            Antipasti & Dolci
          </h2>
          <p className="text-sm text-slate-400">
            Not just pizzas, we also offer light starters (antipasti) and sweet finishes (dolci).
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 sm:p-4">
            <h3 className="text-sm font-semibold text-slate-100 sm:text-base">Antipasti</h3>
            <p className="mt-1 text-sm leading-snug text-slate-300">
              Italian appetizers served before the meal to spark the appetite. Expect a shareable mix of cured meats, regional cheeses, olives, marinated and grilled vegetables, plus breads like grissini.
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 sm:p-4">
            <h3 className="text-sm font-semibold text-slate-100 sm:text-base">Dolci</h3>
            <p className="mt-1 text-sm leading-snug text-slate-300">
              Our sweet pizzas and bites. Examples include Pizza alla Nutella, Pizza al Lotus, and Bites alla Nutella.
            </p>
          </article>
        </div>
      </section>

      <section aria-labelledby="menu-comparison" className="space-y-4">
        <div>
          <h2
            id="menu-comparison"
            className="text-lg font-semibold text-slate-100"
          >
            Standard vs Premium
          </h2>
          <p className="text-sm text-slate-400">
            Every package includes the full pizza lineup. Premium adds a few
            extras for elevated service.
          </p>
        </div>
        <FeatureComparison packages={packages} />
      </section>

      
      <PricingCalculator packages={packages} />
    </div>
  );
}
