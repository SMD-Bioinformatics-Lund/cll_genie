import { createContext, useContext } from "react";
import type { Session } from "./types";

type SessionContextValue = {
  session: Session;
  signOut: () => Promise<void>;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used inside SessionContext");
  return context;
}
