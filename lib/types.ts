export type PackageId = "standard" | "premium";

export type Package = {
  id: PackageId;
  label: string;
};

export type Pizza = {
  id: string;
  name: string;
  vegetarian: boolean;
  vegan: boolean;
};

export type EventRow = {
  id: string;
  name: string;
  event_date: string;
  address: string | null;
  package_id: PackageId | null;
  guests: number | null;
};

export type PizzaTotal = {
  event_id: string;
  pizza_id: string;
  qty: number;
  updated_at: string;
};
