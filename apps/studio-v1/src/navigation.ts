import { createContext, useContext } from "react";

export type PageId =
  | "overview"
  | "agent"
  | "validator"
  | "console"
  | "glossary"
  | "rules"
  | "ontology"
  | "sources"
  | "documents"
  | "graph";

type NavigationContextValue = { navigate: (id: PageId) => void };

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider = NavigationContext.Provider;

/** Pages rendered outside AppShell (e.g. isolated component tests) get a
 *  no-op navigate rather than a crash — cross-page links just do nothing. */
export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  return ctx ?? { navigate: () => {} };
}
