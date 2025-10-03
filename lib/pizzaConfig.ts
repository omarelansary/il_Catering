export const PIZZA_TYPES = [
  { id: "margherita", label: "Margherita" },
  { id: "pepperoni", label: "Pepperoni" },
  { id: "veggie", label: "Veggie" }
] as const;

export type PizzaId = (typeof PIZZA_TYPES)[number]["id"];
