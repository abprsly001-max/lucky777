// Player display preferences: stored on the device, applied instantly.
import { useEffect, useState } from "react";

export type OddsFmt = "american" | "decimal" | "both";

export const getOddsFmt = (): OddsFmt =>
  (localStorage.getItem("lucky777_odds_fmt") as OddsFmt) || "american";

export const setOddsFmt = (f: OddsFmt) => {
  localStorage.setItem("lucky777_odds_fmt", f);
  window.dispatchEvent(new Event("l77prefs"));
};

export function useOddsFmt(): OddsFmt {
  const [f, setF] = useState<OddsFmt>(getOddsFmt());
  useEffect(() => {
    const h = () => setF(getOddsFmt());
    window.addEventListener("l77prefs", h);
    return () => window.removeEventListener("l77prefs", h);
  }, []);
  return f;
}

export const APP_VERSION = "1.0.0";
