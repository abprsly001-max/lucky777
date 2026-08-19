/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // near-black with a violet undertone -- the midnight-casino look
        base: {
          950: "#060409",
          900: "#0b0812",
          800: "#141020",
          700: "#1d1730",
          600: "#2b2145",
        },
        // green means MONEY here -- balances, wins, profit. Never decoration.
        accent: "#4ade80",
        // "gold" is the PRIMARY-ACTION token (name kept so no call site moves):
        // now the electric violet that runs the whole floor
        gold: { DEFAULT: "#a97ef7", 400: "#c4a5ff", 600: "#8b5cf6" },
      },
      fontFamily: {
        sans: ["InterVariable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        // "mono" in this app means NUMERIC DATA (money, odds, dates). Inter's
        // tabular figures align columns like a monospace font but read like a
        // ledger, not a terminal. Real code/hashes use .font-code instead.
        mono: ["InterVariable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        code: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.4), 0 4px 16px -8px rgba(0,0,0,.5)",
        pop: "0 4px 12px rgba(0,0,0,.5), 0 12px 40px -12px rgba(0,0,0,.6)",
        gold: "0 2px 12px -2px rgba(169,126,247,.55)",
      },
    },
  },
  plugins: [],
};
