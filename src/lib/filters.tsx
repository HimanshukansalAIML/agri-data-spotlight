import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Filters = {
  state: string;
  crop: string;
  days: number;
};

type Ctx = Filters & {
  setState: (v: string) => void;
  setCrop: (v: string) => void;
  setDays: (v: number) => void;
};

const FiltersContext = createContext<Ctx | null>(null);

export const ALL = "All";

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<string>(ALL);
  const [crop, setCrop] = useState<string>(ALL);
  const [days, setDays] = useState<number>(90);

  const value = useMemo(
    () => ({ state, crop, days, setState, setCrop, setDays }),
    [state, crop, days],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used inside FiltersProvider");
  return ctx;
}
