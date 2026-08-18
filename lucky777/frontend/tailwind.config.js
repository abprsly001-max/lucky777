/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#06080d",
          900: "#0b0e14",
          800: "#121722",
          700: "#1a2130",
          600: "#243044",
        },
        // green means MONEY here -- balances, wins, profit. Never decoration.
        accent: "#4ade80",
        // gold is the brand: wordmark, active tab, primary actions.
        gold: { DEFAULT: "#f0b429", 400: "#f5c451", 600: "#d99e12" },
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
        gold: "0 2px 10px -2px rgba(240,180,41,.45)",
      },
    },
  },
  plugins: [],
};
