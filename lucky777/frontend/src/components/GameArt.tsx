/** Hand-drawn SVG art for the casino tiles. No stock images, no licensing —
 * every scene is a few dozen shapes with the Lucky777 gold running through it. */

export const SYMBOL_GLYPH: Record<string, { g: string; cls?: string }> = {
  seven: { g: "7", cls: "slot-gold" },
  bar: { g: "BAR", cls: "slot-bar" },
  bell: { g: "🔔" },
  cherry: { g: "🍒" },
  blank: { g: "—", cls: "slot-blank" },
  melon: { g: "🍉" },
  grapes: { g: "🍇" },
  orange: { g: "🍊" },
  lemon: { g: "🍋" },
  diamond: { g: "💎" },
  ring: { g: "💍" },
  coin: { g: "🪙" },
  crown: { g: "👑" },
  clover: { g: "🍀" },
  horseshoe: { g: "Ω", cls: "slot-gold" },
  star: { g: "⭐" },
  moon: { g: "🌙" },
  wild: { g: "W", cls: "slot-gold" },
  scatter: { g: "⭐" },
  bar3: { g: "BAR", cls: "slot-bar" },
  mask: { g: "🗿" },
  jaguar: { g: "🐆" },
  snake: { g: "🐍" },
  idol: { g: "🏺" },
  berry: { g: "🍓" },
  plum: { g: "🍑" },
  reaper: { g: "💀" },
  coffin: { g: "⚰️" },
  candle: { g: "🕯️" },
  potion: { g: "🧪" },
  sun: { g: "🌅" },
  palm: { g: "🌴" },
  cassette: { g: "📼" },
  shades: { g: "🕶️" },
  buffalo: { g: "🦬" },
  eagle: { g: "🦅" },
  wolf: { g: "🐺" },
  cactus: { g: "🌵" },
  A: { g: "A", cls: "slot-gold" },
  K: { g: "K", cls: "slot-gold" },
  Q: { g: "Q", cls: "slot-gold" },
  J: { g: "J", cls: "slot-gold" },
};

/* ------------------------------------------------------------------------ *
 * SymbolFace: drawn vector slot symbols — beveled royals, faceted gems,
 * classic bells and sevens — so the reels read like a real machine instead
 * of a row of emoji. Anything without a bespoke drawing falls back to its
 * glyph inside the premium plate.
 * ------------------------------------------------------------------------ */
const ROYAL_COLORS: Record<string, [string, string]> = {
  A: ["#ff8a8a", "#b91c1c"], K: ["#d8b4fe", "#7c3aed"],
  Q: ["#93c5fd", "#1d4ed8"], J: ["#86efac", "#15803d"],
  seven: ["#ffe08a", "#d99e12"], horseshoe: ["#ffe08a", "#b45309"],
};

function RoyalFace({ ch, from, to }: { ch: string; from: string; to: string }) {
  const gid = `roy-${ch}-${from.slice(1)}`;
  return (
    <svg viewBox="0 0 48 48" className="h-[90%] w-[90%]">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <text x="24" y="37" textAnchor="middle" fontSize="34" fontWeight="900"
        fontFamily="Arial Black, Inter, sans-serif" fill="#000" opacity="0.55"
        transform="translate(2,2.5)">{ch}</text>
      <text x="24" y="37" textAnchor="middle" fontSize="34" fontWeight="900"
        fontFamily="Arial Black, Inter, sans-serif" fill={`url(#${gid})`}
        stroke="rgba(255,255,255,0.55)" strokeWidth="0.8">{ch}</text>
    </svg>
  );
}

function GemFace({ from, mid, to }: { from: string; mid: string; to: string }) {
  return (
    <svg viewBox="0 0 48 48" className="h-[88%] w-[88%]">
      {/* body bright so the cut reads on a dark plate; facets shade darker */}
      <polygon points="24,4 40,16 24,44 8,16" fill={mid} />
      <polygon points="24,4 8,16 24,22" fill={from} />
      <polygon points="24,4 40,16 24,22" fill={from} opacity="0.65" />
      <polygon points="40,16 24,22 24,44" fill={to} opacity="0.9" />
      <polygon points="8,16 24,22 24,44" fill={to} opacity="0.55" />
      <polygon points="24,4 40,16 24,44 8,16" fill="none"
        stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" />
      <path d="M8 16h32" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
      <circle cx="18" cy="11" r="2.2" fill="#fff" opacity="0.9" />
    </svg>
  );
}

function BellFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[86%] w-[86%]">
      <defs>
        <linearGradient id="bellg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#c47f0e" />
        </linearGradient>
      </defs>
      <path d="M24 6c1.8 0 3 1.2 3 3v1.4C33 12 37 17.4 37 24v6l4 5H7l4-5v-6
        c0-6.6 4-12 10-13.6V9c0-1.8 1.2-3 3-3z" fill="url(#bellg)"
        stroke="rgba(120,60,0,0.6)" strokeWidth="1" />
      <circle cx="24" cy="39.5" r="3.4" fill="#8a5a00" />
      <ellipse cx="19" cy="16" rx="3" ry="6" fill="#fff" opacity="0.35"
        transform="rotate(-18 19 16)" />
    </svg>
  );
}

function CherryFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[86%] w-[86%]">
      <path d="M17 25C20 14 27 8 38 7" fill="none" stroke="#2f8f3a" strokeWidth="3"
        strokeLinecap="round" />
      <path d="M30 26C30 17 33 11 38 7" fill="none" stroke="#2f8f3a" strokeWidth="3"
        strokeLinecap="round" />
      <path d="M36 8c3-1 5-1 7 1-2 2-5 2-7-1z" fill="#3aa845" />
      <circle cx="15.5" cy="31" r="8.5" fill="#d81f3d" />
      <circle cx="15.5" cy="31" r="8.5" fill="none" stroke="#7d0f22" strokeWidth="1" />
      <circle cx="12.5" cy="28" r="2.6" fill="#ff8fa3" opacity="0.9" />
      <circle cx="31" cy="33.5" r="8" fill="#e63253" />
      <circle cx="31" cy="33.5" r="8" fill="none" stroke="#7d0f22" strokeWidth="1" />
      <circle cx="28" cy="30.5" r="2.4" fill="#ff9fb0" opacity="0.9" />
    </svg>
  );
}

function StarFace({ glow = false }: { glow?: boolean }) {
  return (
    <svg viewBox="0 0 48 48"
      className={`h-[80%] w-[80%] ${glow ? "[filter:drop-shadow(0_0_9px_rgba(196,165,255,0.95))]" : ""}`}>
      <defs>
        <linearGradient id="starg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" /><stop offset="1" stopColor="#eab308" />
        </linearGradient>
      </defs>
      <path d="M24 3l6.2 13.4L45 18.3 34.5 28.5l2.6 14.7L24 36.4 10.9 43.2
        l2.6-14.7L3 18.3l14.8-1.9z" fill="url(#starg)"
        stroke="rgba(120,70,0,0.55)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M24 3l6.2 13.4L45 18.3l-9 8.7L24 12z" fill="#fff" opacity="0.28" />
    </svg>
  );
}

function CoinFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[74%] w-[74%]">
      <circle cx="24" cy="24" r="19" fill="#d99e12" />
      <circle cx="24" cy="24" r="19" fill="none" stroke="#8a5a00" strokeWidth="2" />
      <circle cx="24" cy="24" r="13.5" fill="#f5c451" stroke="#b97b09" strokeWidth="1.4" />
      <text x="24" y="30.5" textAnchor="middle" fontSize="17" fontWeight="900"
        fontFamily="Arial Black, sans-serif" fill="#8a5a00">$</text>
      <ellipse cx="17" cy="14" rx="6" ry="3" fill="#fff" opacity="0.4"
        transform="rotate(-24 17 14)" />
    </svg>
  );
}

function CrownFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[86%] w-[86%]">
      <defs>
        <linearGradient id="crng" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#c47f0e" />
        </linearGradient>
      </defs>
      <path d="M8 34l-3-18 10 7 9-13 9 13 10-7-3 18z" fill="url(#crng)"
        stroke="rgba(120,60,0,0.6)" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="8" y="35" width="32" height="5.5" rx="2" fill="url(#crng)"
        stroke="rgba(120,60,0,0.6)" strokeWidth="1" />
      <circle cx="24" cy="26" r="3" fill="#e63253" stroke="#7d0f22" />
      <circle cx="13.5" cy="28" r="2" fill="#2563eb" stroke="#1e3a8a" />
      <circle cx="34.5" cy="28" r="2" fill="#16a34a" stroke="#14532d" />
    </svg>
  );
}

function FruitFace({ kind }: { kind: string }) {
  if (kind === "lemon" || kind === "orange") {
    const c = kind === "lemon" ? ["#fde68a", "#eab308"] : ["#fdba74", "#ea580c"];
    return (
      <svg viewBox="0 0 48 48" className="h-[74%] w-[74%]">
        <ellipse cx="24" cy="26" rx="16" ry="13.5" fill={c[1]} />
        <ellipse cx="24" cy="26" rx="16" ry="13.5" fill="none"
          stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
        <ellipse cx="18" cy="20" rx="5.5" ry="3.4" fill={c[0]} opacity="0.75"
          transform="rotate(-20 18 20)" />
        <path d="M24 12c0-3 2-5 5-6" fill="none" stroke="#2f8f3a" strokeWidth="2.6"
          strokeLinecap="round" />
        <path d="M28 7c3-1 5 0 6 2-2 1.6-4.6 1-6-2z" fill="#3aa845" />
      </svg>
    );
  }
  if (kind === "grapes" || kind === "plum" || kind === "berry") {
    const fill = kind === "berry" ? "#e63253" : "#7c3aed";
    const pos = kind === "grapes"
      ? [[17, 20], [24, 18], [31, 20], [20, 27], [28, 27], [24, 34]]
      : [[24, 27]];
    return (
      <svg viewBox="0 0 48 48" className="h-[86%] w-[86%]">
        <path d="M24 13c0-3.5 2-6 5-7" fill="none" stroke="#2f8f3a" strokeWidth="2.6"
          strokeLinecap="round" />
        <path d="M28 6c3-1 5 0 6 2-2 1.6-4.6 1-6-2z" fill="#3aa845" />
        {pos.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={kind === "grapes" ? 5.6 : 12} fill={fill} />
            <circle cx={x} cy={y} r={kind === "grapes" ? 5.6 : 12} fill="none"
              stroke="rgba(0,0,0,0.35)" strokeWidth="0.9" />
            <circle cx={x - 2} cy={y - 2} r={kind === "grapes" ? 1.6 : 3.4}
              fill="#fff" opacity="0.4" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "melon") {
    return (
      <svg viewBox="0 0 48 48" className="h-[86%] w-[86%]">
        <path d="M6 20a18 18 0 0 0 36 0z" fill="#16a34a" />
        <path d="M9 20a15 15 0 0 0 30 0z" fill="#dcfce7" />
        <path d="M11.5 20a12.5 12.5 0 0 0 25 0z" fill="#e63253" />
        {[[18, 26], [24, 29], [30, 26]].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y} rx="1.3" ry="2" fill="#1c1917" />
        ))}
      </svg>
    );
  }
  return null;
}

function SkullFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[88%] w-[88%]">
      <defs>
        <linearGradient id="skullg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f5f9" /><stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
      </defs>
      <path d="M24 5c-9.4 0-16 6.6-16 15 0 5.4 2.6 9.6 6.4 12v5c0 1.7 1.3 3 3 3h13.2
        c1.7 0 3-1.3 3-3v-5c3.8-2.4 6.4-6.6 6.4-12 0-8.4-6.6-15-16-15z"
        fill="url(#skullg)" stroke="#334155" strokeWidth="1" />
      <ellipse cx="17" cy="21" rx="4.6" ry="5.4" fill="#0f172a" />
      <ellipse cx="31" cy="21" rx="4.6" ry="5.4" fill="#0f172a" />
      <circle cx="18.2" cy="19.6" r="1.2" fill="#67e8f9" opacity="0.9" />
      <circle cx="32.2" cy="19.6" r="1.2" fill="#67e8f9" opacity="0.9" />
      <path d="M24 26l-2.6 5h5.2z" fill="#1e293b" />
      {[18.5, 22.2, 25.9, 29.6].map((x, i) => (
        <rect key={i} x={x} y="34" width="2.6" height="5.2" rx="1.1"
          fill="#e2e8f0" stroke="#475569" strokeWidth="0.5" />
      ))}
    </svg>
  );
}

function CoffinFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[88%] w-[88%]">
      <defs>
        <linearGradient id="cofg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c4a1e" /><stop offset="1" stopColor="#3b2007" />
        </linearGradient>
      </defs>
      <path d="M19 4h10l6 12-4 28h-14l-4-28z" fill="url(#cofg)"
        stroke="#1c0f04" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M19 4h5l-3.5 40h-2.5l-4-28z" fill="#fff" opacity="0.08" />
      <rect x="22.6" y="14" width="2.8" height="14" rx="1" fill="#e7c368" />
      <rect x="18.5" y="18" width="11" height="2.8" rx="1" fill="#e7c368" />
    </svg>
  );
}

function CandleFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[88%] w-[88%]">
      <ellipse cx="24" cy="15" rx="6" ry="9" fill="#fbbf24" opacity="0.25" />
      <path d="M24 8c2.6 3 3.8 5 3.8 7a3.8 3.8 0 1 1-7.6 0c0-2 1.2-4 3.8-7z"
        fill="#fbbf24" />
      <path d="M24 11.5c1.2 1.6 1.8 2.7 1.8 3.8a1.8 1.8 0 1 1-3.6 0c0-1.1.6-2.2 1.8-3.8z"
        fill="#fff7d6" />
      <rect x="22.9" y="18" width="2.2" height="4" fill="#78350f" />
      <path d="M17 22h14v18a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2z" fill="#f5ead1"
        stroke="#b8a37e" strokeWidth="1" />
      <path d="M17 22c1.5 3 .5 5 2.5 5s1.5-3 3-3 1 4 3 4 2-4 3.5-4 .8 2.5 2 3V22z"
        fill="#fffaf0" />
      <rect x="17" y="22" width="3.4" height="20" fill="#fff" opacity="0.25" />
    </svg>
  );
}

function FlaskFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[88%] w-[88%]">
      <rect x="21" y="5" width="6" height="6" rx="1" fill="#9aa8b8" />
      <path d="M21 10h6v6l7 16a6 6 0 0 1-5.5 8.4h-9A6 6 0 0 1 14 32l7-16z"
        fill="rgba(190,220,235,0.35)" stroke="#9fb6c6" strokeWidth="1.2" />
      <path d="M17.2 28.5h13.6l3.2 7.2a4.5 4.5 0 0 1-4.2 6.3h-11.6a4.5 4.5 0 0 1-4.2-6.3z"
        fill="#4ade80" opacity="0.85" />
      <circle cx="21" cy="34" r="1.5" fill="#bbf7d0" opacity="0.9" />
      <circle cx="27" cy="37.5" r="1.1" fill="#bbf7d0" opacity="0.8" />
      <rect x="22" y="12" width="1.6" height="14" fill="#fff" opacity="0.35" />
    </svg>
  );
}

/* royals engraved on cracked stone tiles — the graveyard-machine look */
export function StoneRoyal({ ch }: { ch: string }) {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <defs>
        <linearGradient id="stoneg" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#c7cdd6" /><stop offset="0.6" stopColor="#9aa3b0" />
          <stop offset="1" stopColor="#6d7684" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="5" fill="url(#stoneg)"
        stroke="#3f4753" strokeWidth="1.4" />
      <path d="M8 10l6 5M38 34l-6 4M40 12l-5 3" stroke="#5b636f"
        strokeWidth="0.9" fill="none" opacity="0.8" />
      <path d="M12 40l4-3M30 6l3 4" stroke="#5b636f" strokeWidth="0.8"
        fill="none" opacity="0.6" />
      <text x="24" y="36" textAnchor="middle" fontSize="30" fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif" fill="#3a414c">{ch}</text>
      <text x="24" y="36" textAnchor="middle" fontSize="30" fontWeight="700"
        fontFamily="Georgia, 'Times New Roman', serif" fill="none"
        stroke="rgba(255,255,255,0.35)" strokeWidth="0.6"
        transform="translate(-0.7,-0.9)">{ch}</text>
    </svg>
  );
}

/* ------------------------------------------------------------------------ *
 * SlotScene: the layered world behind a machine's reels — sky, celestial
 * body, silhouettes, drifting fog, vignette. Parametric per theme.
 * ------------------------------------------------------------------------ */
export type SceneKind = "graveyard" | "vault" | "jungle" | "city" | "prairie" | "candy";

const SCENE_COLORS: Record<SceneKind, { sky: [string, string]; orb: string;
  sil: string; fog: string }> = {
  graveyard: { sky: ["#123332", "#040b0b"], orb: "#dbe7e4", sil: "#03100e", fog: "#9fd8cf" },
  vault: { sky: ["#3a2a08", "#0d0801"], orb: "#ffe9a3", sil: "#160e02", fog: "#f0d99a" },
  jungle: { sky: ["#0d3319", "#03110a"], orb: "#fde68a", sil: "#02150c", fog: "#a7f3d0" },
  city: { sky: ["#0f1440", "#05041a"], orb: "#f0abfc", sil: "#070325", fog: "#a5b4fc" },
  prairie: { sky: ["#4a1d06", "#140502"], orb: "#fdba74", sil: "#1a0a03", fog: "#fdba74" },
  candy: { sky: ["#3a0a3f", "#12021a"], orb: "#f9a8d4", sil: "#1c0522", fog: "#f0abfc" },
};

function sceneSilhouette(kind: SceneKind, c: string) {
  switch (kind) {
    case "graveyard":
      return (
        <g fill={c}>
          {/* rolling ground */}
          <path d="M0 96 Q40 88 80 94 T160 92 T240 96 L240 120 L0 120z" />
          {/* dead tree */}
          <path d="M18 96V70l-7-9 3-1 5 7v-9l-5-6 2-2 4 5V44h3v13l5-6 2 2-6 8v10l6-8 3 2-9 11v20z" />
          {/* crypt + stones */}
          <path d="M196 96V78h6v-4l7-6 7 6v4h6v18z" />
          <path d="M96 96v-9a5 5 0 0 1 10 0v9zM130 96v-7a4 4 0 0 1 8 0v7zM62 96v-6a3.5 3.5 0 0 1 7 0v6z" />
          {/* fence */}
          {[148, 156, 164, 172, 180].map((x) => (
            <rect key={x} x={x} y="84" width="2.4" height="12" />
          ))}
          <rect x="146" y="87" width="38" height="1.8" />
        </g>
      );
    case "vault":
      return (
        <g fill={c}>
          <path d="M0 96h240v24H0z" />
          {[20, 60, 160, 200].map((x) => (
            <g key={x}><rect x={x} y="58" width="10" height="38" />
              <rect x={x - 3} y="54" width="16" height="6" rx="1" /></g>
          ))}
          <circle cx="120" cy="86" r="26" />
          <circle cx="120" cy="86" r="18" fill="none" stroke="#2c1c04" strokeWidth="3" />
        </g>
      );
    case "jungle":
      return (
        <g fill={c}>
          <path d="M0 96h240v24H0z" />
          <path d="M80 96l20-34 4 6 8-14 8 14 4-6 20 34z" />
          <path d="M30 96V74m0 0c-8-8-16-9-20-8 6-6 14-5 20 0 6-5 14-6 20 0-4-1-12 0-20 8z"
            stroke={c} strokeWidth="4" fill="none" />
          <path d="M205 96V70m0 0c-9-9-18-10-23-9 7-7 16-6 23 0 7-6 16-7 23 0-5-1-14 0-23 9z"
            stroke={c} strokeWidth="4" fill="none" />
        </g>
      );
    case "city":
      return (
        <g fill={c}>
          <path d="M0 96h240v24H0z" />
          {[[8, 60, 22], [36, 72, 16], [58, 50, 26], [90, 66, 18], [114, 44, 24],
            [144, 70, 20], [170, 56, 22], [198, 64, 18], [222, 52, 16]].map(([x, y, w], i) => (
            <rect key={i} x={x} y={y} width={w} height={96 - (y as number)} />
          ))}
        </g>
      );
    case "prairie":
      return (
        <g fill={c}>
          <path d="M0 96h240v24H0z" />
          <path d="M20 96V70h30v8h12v18zM180 96V64h26v10h14v22z" />
          <path d="M120 96V78m0 0v-8m0 8h-8v-10m8 10h8v-6" stroke={c}
            strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      );
    case "candy":
      return (
        <g fill={c}>
          <path d="M0 96 Q60 70 120 92 T240 88 L240 120 L0 120z" />
          <circle cx="46" cy="78" r="14" />
          <circle cx="196" cy="72" r="18" />
        </g>
      );
  }
}

export function SlotScene({ kind }: { kind: SceneKind }) {
  const c = SCENE_COLORS[kind];
  const gid = `scene-${kind}`;
  return (
    <svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.sky[0]} /><stop offset="1" stopColor={c.sky[1]} />
        </linearGradient>
        <radialGradient id={`${gid}-orb`}>
          <stop offset="0" stopColor={c.orb} stopOpacity="0.9" />
          <stop offset="0.5" stopColor={c.orb} stopOpacity="0.25" />
          <stop offset="1" stopColor={c.orb} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="120" fill={`url(#${gid})`} />
      <circle cx="186" cy="26" r="30" fill={`url(#${gid}-orb)`} />
      <circle cx="186" cy="26" r="11" fill={c.orb} opacity="0.9" />
      {/* stars */}
      {[[22, 14], [58, 26], [96, 10], [140, 20], [210, 52], [36, 44]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="#fff"
          opacity={0.25 + (i % 3) * 0.2} />
      ))}
      {sceneSilhouette(kind, c.sil)}
      {/* drifting fog banks */}
      <g className="fog-a" opacity="0.16">
        <ellipse cx="60" cy="98" rx="70" ry="12" fill={c.fog} />
        <ellipse cx="180" cy="104" rx="60" ry="10" fill={c.fog} />
      </g>
      <g className="fog-b" opacity="0.10">
        <ellipse cx="130" cy="92" rx="80" ry="10" fill={c.fog} />
      </g>
      {/* vignette */}
      <rect width="240" height="120" fill="url(#scene-vig)" />
      <radialGradient id="scene-vig" cx="0.5" cy="0.42" r="0.75">
        <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.55" />
      </radialGradient>
    </svg>
  );
}

/* ------------------------------------------------------------------------ *
 * Bonus characters: the house mascots that come out when free games hit.
 * Original sprites, one per machine mood — they slide in on the trigger,
 * hover beside the reels for the whole feature, and cast on every spin.
 * ------------------------------------------------------------------------ */
export type CharKind = "reaper" | "buffalo" | "idol" | "cat";

function ReaperSprite() {
  return (
    <svg viewBox="0 0 80 100" className="h-full w-full">
      {/* wisps */}
      <ellipse cx="20" cy="88" rx="10" ry="3.5" fill="#a78bfa" opacity="0.18" />
      <ellipse cx="58" cy="92" rx="12" ry="4" fill="#a78bfa" opacity="0.12" />
      {/* scythe */}
      <path d="M60 12 C74 16 78 30 74 42 C74 28 66 20 56 19 z" fill="#cbd5e1"
        stroke="#475569" strokeWidth="1" />
      <rect x="57" y="16" width="3.4" height="70" rx="1.6" fill="#3f2d1d"
        transform="rotate(6 58 16)" />
      {/* cloak */}
      <path d="M40 10 C24 10 16 26 17 44 C18 62 12 76 10 92
        C18 86 22 92 28 88 C34 94 40 88 46 93 C52 88 58 94 66 88
        C62 74 60 60 61 44 C62 26 56 10 40 10z" fill="#17102b"
        stroke="#3b2a63" strokeWidth="1.5" />
      {/* hood opening + face */}
      <path d="M40 16 C30 16 25 26 26 36 C30 42 50 42 54 36 C55 26 50 16 40 16z"
        fill="#05030c" />
      <ellipse cx="34.5" cy="31" rx="3" ry="3.8" fill="#67e8f9" />
      <ellipse cx="46" cy="31" rx="3" ry="3.8" fill="#67e8f9" />
      <ellipse cx="34.5" cy="31" rx="1.2" ry="1.6" fill="#fff" opacity="0.9" />
      <ellipse cx="46" cy="31" rx="1.2" ry="1.6" fill="#fff" opacity="0.9" />
      {/* bony hand on the staff */}
      <circle cx="58.5" cy="52" r="4.4" fill="#e2e8f0" stroke="#64748b" />
    </svg>
  );
}

function BuffaloSprite() {
  return (
    <svg viewBox="0 0 110 100" className="h-full w-full">
      {/* dust */}
      <ellipse cx="28" cy="92" rx="16" ry="4" fill="#fdba74" opacity="0.15" />
      {/* body */}
      <path d="M18 62 C16 42 34 30 56 32 C74 33 88 42 92 54 C96 64 92 76 84 80
        L82 90 L74 90 L73 82 L48 82 L46 90 L38 90 L36 80 C24 78 19 72 18 62z"
        fill="#4a2c14" stroke="#241105" strokeWidth="2" />
      {/* hump + mane */}
      <path d="M30 44 C30 30 48 24 60 28 C50 28 40 34 38 46z" fill="#33200a" />
      <path d="M20 60 C22 48 30 40 42 38 C32 46 28 54 28 64z" fill="#33200a" />
      {/* head */}
      <path d="M84 48 C96 50 104 58 104 68 C104 78 96 84 88 83
        C80 82 76 74 76 64 C76 56 79 50 84 48z" fill="#33200a"
        stroke="#241105" strokeWidth="2" />
      {/* horns */}
      <path d="M88 52 C94 44 102 44 106 48 C100 48 96 52 94 58z" fill="#e7d8b8"
        stroke="#9c8a63" strokeWidth="1" />
      {/* eye + nostril */}
      <circle cx="90" cy="62" r="2.6" fill="#fbbf24" />
      <circle cx="90" cy="62" r="1.1" fill="#111" />
      <ellipse cx="98" cy="74" rx="2" ry="1.4" fill="#111" opacity="0.7" />
      {/* tail */}
      <path d="M18 60 C10 58 8 66 12 72" fill="none" stroke="#241105"
        strokeWidth="3" strokeLinecap="round" />
      <circle cx="12" cy="73" r="3" fill="#33200a" />
    </svg>
  );
}

function IdolSprite() {
  return (
    <svg viewBox="0 0 90 100" className="h-full w-full">
      {/* crest */}
      <path d="M45 4 L58 18 L45 14 L32 18z" fill="#e7c368" stroke="#8a5a00" />
      <path d="M20 20 L45 10 L70 20 L66 30 L24 30z" fill="#2e9e6b"
        stroke="#14532d" strokeWidth="1.5" />
      {/* stone head */}
      <rect x="22" y="26" width="46" height="58" rx="8" fill="#8a949f"
        stroke="#3f4753" strokeWidth="2" />
      <rect x="22" y="26" width="46" height="58" rx="8" fill="none"
        stroke="#c7cdd6" strokeWidth="0.8" opacity="0.5"
        transform="translate(-1,-1)" />
      {/* carved brow + nose */}
      <path d="M28 44 h34 M45 44 v18 M38 66 h14" stroke="#3f4753"
        strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {/* glowing eyes */}
      <ellipse cx="35" cy="51" rx="4" ry="3" fill="#34d399" />
      <ellipse cx="55" cy="51" rx="4" ry="3" fill="#34d399" />
      <ellipse cx="35" cy="51" rx="1.4" ry="1.1" fill="#fff" opacity="0.9" />
      <ellipse cx="55" cy="51" rx="1.4" ry="1.1" fill="#fff" opacity="0.9" />
      {/* mouth slab */}
      <rect x="36" y="72" width="18" height="6" rx="2" fill="#3f4753" />
      {/* ear plugs */}
      <circle cx="20" cy="52" r="5" fill="#e7c368" stroke="#8a5a00" />
      <circle cx="70" cy="52" r="5" fill="#e7c368" stroke="#8a5a00" />
      {/* cracks */}
      <path d="M28 34 l6 6 M62 76 l-5 -4" stroke="#5b636f" strokeWidth="1" />
    </svg>
  );
}

function CatSprite() {
  return (
    <svg viewBox="0 0 90 100" className="h-full w-full">
      {/* body */}
      <path d="M45 34 C24 34 16 52 18 70 C19 84 30 92 45 92 C60 92 71 84 72 70
        C74 52 66 34 45 34z" fill="#f5c451" stroke="#b97b09" strokeWidth="2" />
      {/* head */}
      <circle cx="45" cy="26" r="17" fill="#f5c451" stroke="#b97b09" strokeWidth="2" />
      {/* ears */}
      <path d="M31 16 L28 4 L38 10z" fill="#f5c451" stroke="#b97b09" strokeWidth="2" />
      <path d="M59 16 L62 4 L52 10z" fill="#f5c451" stroke="#b97b09" strokeWidth="2" />
      <path d="M31.5 14 L30 8 L35 11z" fill="#e0506e" />
      <path d="M58.5 14 L60 8 L55 11z" fill="#e0506e" />
      {/* face */}
      <circle cx="39" cy="24" r="2" fill="#1c1917" />
      <circle cx="51" cy="24" r="2" fill="#1c1917" />
      <path d="M43 29 q2 2 4 0" stroke="#1c1917" strokeWidth="1.6" fill="none"
        strokeLinecap="round" />
      <path d="M30 27 h-7 M30 30 h-6 M60 27 h7 M60 30 h6" stroke="#b97b09"
        strokeWidth="1.2" strokeLinecap="round" />
      {/* the waving paw (animated by parent class) */}
      <g className="cat-paw" style={{ transformOrigin: "68px 44px" }}>
        <path d="M66 44 C74 38 78 30 76 22 C72 20 66 24 64 32z" fill="#f5c451"
          stroke="#b97b09" strokeWidth="2" />
        <circle cx="74" cy="24" r="4.5" fill="#fde8b8" stroke="#b97b09" />
      </g>
      {/* collar + coin */}
      <path d="M33 38 h24" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
      <circle cx="45" cy="52" r="9" fill="#e7c368" stroke="#8a5a00" strokeWidth="1.5" />
      <text x="45" y="56" textAnchor="middle" fontSize="9" fontWeight="900"
        fontFamily="Arial Black, sans-serif" fill="#8a5a00">$</text>
      {/* belly */}
      <ellipse cx="45" cy="74" rx="13" ry="11" fill="#fde8b8" />
    </svg>
  );
}

/** the mascot that owns the feature: slides in, bobs, casts while spinning */
export function BonusCharacter({ kind, casting }: {
  kind: CharKind; casting: boolean;
}) {
  const sprite = kind === "reaper" ? <ReaperSprite />
    : kind === "buffalo" ? <BuffaloSprite />
    : kind === "idol" ? <IdolSprite /> : <CatSprite />;
  return (
    <div className={`char-in pointer-events-none absolute right-2 top-0 z-20 h-20 w-20 drop-shadow-[0_6px_14px_rgba(0,0,0,0.65)] sm:h-24 sm:w-24 ${
      casting ? "char-cast" : "char-bob"}`}>
      {sprite}
    </div>
  );
}

// ---- theme premium symbols: compact original vector art per machine mood
function MaskFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[90%] w-[90%]">
      <path d="M24 4c10 0 15 6 15 16 0 12-7 24-15 24S9 32 9 20C9 10 14 4 24 4z"
        fill="#e7c368" stroke="#8a5a00" strokeWidth="1.5" />
      <path d="M24 4c6 0 9 4 9 5-3 1-6 1-9 1s-6 0-9-1c0-1 3-5 9-5z" fill="#2e9e6b" />
      <path d="M13 20l8-3 3 3-3 3z" fill="#0f3d2a" />
      <path d="M35 20l-8-3-3 3 3 3z" fill="#0f3d2a" />
      <ellipse cx="17.5" cy="20" rx="2.4" ry="3" fill="#111" />
      <ellipse cx="30.5" cy="20" rx="2.4" ry="3" fill="#111" />
      <path d="M18 32c3 3 9 3 12 0" stroke="#8a1a1a" strokeWidth="2.4"
        fill="none" strokeLinecap="round" />
      <path d="M20 12h8M22 40l2 3 2-3" stroke="#8a5a00" strokeWidth="1.4" fill="none" />
    </svg>
  );
}
function JaguarFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <path d="M10 14l6 4h16l6-4-2 8 3 6-5 3-3 8H17l-3-8-5-3 3-6z"
        fill="#e0913a" stroke="#5c3410" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 12l4 6-6-1zM34 12l-4 6 6-1z" fill="#5c3410" />
      <ellipse cx="18" cy="24" rx="2.6" ry="3.2" fill="#f5e6c8" />
      <ellipse cx="30" cy="24" rx="2.6" ry="3.2" fill="#f5e6c8" />
      <circle cx="18" cy="24" r="1.3" fill="#111" /><circle cx="30" cy="24" r="1.3" fill="#111" />
      <path d="M22 30h4l-2 3z" fill="#3b1d06" />
      <path d="M20 34c2 1.6 6 1.6 8 0" stroke="#3b1d06" strokeWidth="1.6" fill="none" />
      {[[15,20],[33,20],[16,30],[32,30],[24,16]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r="1.5" fill="#3b1d06" opacity="0.7" />))}
    </svg>
  );
}
function SnakeFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <path d="M12 40c0-10 8-10 8-18 0-5-6-5-6-10 0-4 4-6 8-6"
        fill="none" stroke="#2e9e6b" strokeWidth="6" strokeLinecap="round" />
      <path d="M12 40c0-10 8-10 8-18 0-5-6-5-6-10 0-4 4-6 8-6"
        fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round"
        strokeDasharray="2 4" />
      <path d="M22 6c4 0 7 2 7 6 0 2-1 3-3 4l-4-2z" fill="#34d399" />
      <circle cx="27" cy="9" r="1.3" fill="#111" />
      <path d="M29 12l4 2-4 1z" fill="#dc2626" />
    </svg>
  );
}
function BirdFace({ eagle }: { eagle?: boolean }) {
  const body = eagle ? "#5c4326" : "#3f3f46";
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <path d="M24 12c-8 0-14 5-18 14 6-3 10-2 12 2-2 6-6 8-6 8 8 2 14-2 16-8
        2 6 8 10 16 8 0 0-4-2-6-8 2-4 6-5 12-2-4-9-10-14-18-14z"
        fill={body} stroke="#18181b" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="24" cy="16" r="6" fill={eagle ? "#f5f5f4" : "#52525b"} />
      <circle cx="24" cy="15" r="1.8" fill="#111" />
      <path d="M24 18l4 2-4 2-4-2z" fill="#f59e0b" />
    </svg>
  );
}
function WolfFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <path d="M10 12l6 6h16l6-6-1 10 4 4-6 2-5 8H18l-5-8-6-2 4-4z"
        fill="#71717a" stroke="#27272a" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13 11l4 7-6-2zM35 11l-4 7 6-2z" fill="#3f3f46" />
      <ellipse cx="18.5" cy="23" rx="2.4" ry="3" fill="#fde68a" />
      <ellipse cx="29.5" cy="23" rx="2.4" ry="3" fill="#fde68a" />
      <circle cx="18.5" cy="23" r="1.1" fill="#111" /><circle cx="29.5" cy="23" r="1.1" fill="#111" />
      <path d="M21 30h6l-3 4z" fill="#e5e7eb" />
      <path d="M24 34v4M20 36l4-2 4 2" stroke="#27272a" strokeWidth="1.4" fill="none" />
    </svg>
  );
}
function CactusFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <rect x="20" y="14" width="8" height="30" rx="4" fill="#3f9e52" stroke="#1f5e30" strokeWidth="1.2" />
      <path d="M20 26h-4a4 4 0 0 0-4 4v4a3 3 0 0 0 6 0v-6" fill="#3f9e52" stroke="#1f5e30" strokeWidth="1.2" />
      <path d="M28 22h4a4 4 0 0 1 4 4v6a3 3 0 0 1-6 0v-8" fill="#3f9e52" stroke="#1f5e30" strokeWidth="1.2" />
      <path d="M23 18v20M25 22v16" stroke="#1f5e30" strokeWidth="0.8" opacity="0.6" />
      <path d="M24 12c1-3 3-4 3-4s-1 4 0 5" fill="#e0506e" />
      <ellipse cx="24" cy="45" rx="10" ry="2" fill="#7c5b32" opacity="0.5" />
    </svg>
  );
}
function IdolSymFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <path d="M14 6h20l3 8-3 6 3 8-4 12H15L11 28l3-8-3-6z" fill="#c9a44a"
        stroke="#6e4d10" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 4h12l-2 6H20z" fill="#2e9e6b" stroke="#14532d" strokeWidth="1" />
      <path d="M17 22h6l-1 5h-4zM25 22h6l-1 5h-4z" fill="#6e4d10" />
      <ellipse cx="20" cy="20" rx="2" ry="2.6" fill="#34d399" />
      <ellipse cx="28" cy="20" rx="2" ry="2.6" fill="#34d399" />
      <rect x="19" y="30" width="10" height="4" rx="1.5" fill="#6e4d10" />
      <path d="M15 38h18" stroke="#6e4d10" strokeWidth="1.4" />
    </svg>
  );
}
function SunFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <defs><linearGradient id="sunsym" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f97316" />
      </linearGradient></defs>
      <path d="M6 30h36v2a18 18 0 0 1-36 0z" fill="url(#sunsym)" opacity="0.55" />
      <circle cx="24" cy="30" r="11" fill="url(#sunsym)" />
      <path d="M8 30h5M35 30h5M24 15v4M13 20l3 3M35 20l-3 3" stroke="#fbbf24"
        strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 30a10 10 0 0 1 20 0" fill="#fff4d6" opacity="0.5" />
    </svg>
  );
}
function PalmFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <path d="M23 22c1 8 0 16-2 22h6c-2-6-3-14-2-22z" fill="#7c5b32" stroke="#4a3410" strokeWidth="1" />
      <path d="M24 20c-8-6-16-6-20-3 5-2 10 0 12 3-8-3-14 1-16 6 6-4 11-3 14 0-6 0-10 5-11 10 5-6 10-6 13-4 0 0 3-8 8-12z" fill="#22a05a" stroke="#14532d" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M24 20c8-6 16-6 20-3-5-2-10 0-12 3 8-3 14 1 16 6-6-4-11-3-14 0" fill="#2eb765" stroke="#14532d" strokeWidth="0.8" />
      <circle cx="24" cy="19" r="2.5" fill="#f59e0b" />
    </svg>
  );
}
function CassetteFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[90%] w-[90%]">
      <rect x="6" y="12" width="36" height="24" rx="3" fill="#a855f7" stroke="#2a0a4a" strokeWidth="1.5" />
      <rect x="10" y="16" width="28" height="9" rx="1.5" fill="#1e1030" />
      <circle cx="18" cy="20.5" r="3" fill="#f0abfc" /><circle cx="18" cy="20.5" r="1" fill="#1e1030" />
      <circle cx="30" cy="20.5" r="3" fill="#f0abfc" /><circle cx="30" cy="20.5" r="1" fill="#1e1030" />
      <rect x="12" y="29" width="24" height="4" rx="1" fill="#c084fc" />
      <path d="M14 33l3 3M34 33l-3 3" stroke="#2a0a4a" strokeWidth="1.4" />
    </svg>
  );
}
function ShadesFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[92%] w-[92%]">
      <path d="M6 18h36" stroke="#22d3ee" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M7 18h14a2 2 0 0 1 2 2c0 6-3 9-8 9s-8-3-8-8a3 3 0 0 1 0-3z"
        fill="#0e7490" stroke="#22d3ee" strokeWidth="1.5" />
      <path d="M41 18H27a2 2 0 0 0-2 2c0 6 3 9 8 9s8-3 8-8a3 3 0 0 0 0-3z"
        fill="#0e7490" stroke="#22d3ee" strokeWidth="1.5" />
      <path d="M9 21l6 5M29 21l6 5" stroke="#67e8f9" strokeWidth="1.4" opacity="0.7" />
    </svg>
  );
}

function BananaFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[74%] w-[74%]">
      <path d="M10 14c1 12 9 22 22 24 4 .6 8-.2 9-3-6 1-11-1-16-6-6-6-9-12-9-19-3 1-6 1-6 4z"
        fill="#f4c430" stroke="#b8860b" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 12c1 11 8 21 20 23" fill="none" stroke="#fde68a" strokeWidth="1.6"
        opacity="0.7" />
      <path d="M40 34c1.5 1 2.5 1 3.5-.5-1 .2-2 0-3-1z" fill="#6b4a1b" />
      <path d="M9 12l1-3 3-1" fill="none" stroke="#4d3312" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AppleFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[76%] w-[76%]">
      <path d="M24 12c-3-3-9-3-12 1-3 4-2 12 2 18 3 4 6 6 10 6s7-2 10-6c4-6 5-14 2-18-3-4-9-4-12-1z"
        fill="#d81f3d" stroke="#7d0f22" strokeWidth="1.3" />
      <path d="M17 16c-2 2-2 6 0 10" fill="none" stroke="#ff8fa3" strokeWidth="2.4"
        strokeLinecap="round" opacity="0.8" />
      <path d="M24 12c0-3 1-6 4-7" fill="none" stroke="#5b3a1a" strokeWidth="2"
        strokeLinecap="round" />
      <path d="M27 7c3-1 5 0 6 2-2 1.6-4.6 1-6-2z" fill="#3aa845" />
    </svg>
  );
}

function HeartFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[74%] w-[74%]">
      <defs>
        <linearGradient id="heartg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6b8b" /><stop offset="1" stopColor="#b3123b" />
        </linearGradient>
      </defs>
      <path d="M24 42C10 32 5 24 5 17 5 11 9 7 14.5 7 18 7 21 9 24 13c3-4 6-6 9.5-6C39 7 43 11 43 17c0 7-5 15-19 25z"
        fill="url(#heartg)" stroke="#7d0f22" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M14 13c-3 1-4 4-3.5 8" fill="none" stroke="#ffc2cf" strokeWidth="2.4"
        strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function LollipopFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-[80%] w-[80%] [filter:drop-shadow(0_0_7px_rgba(244,114,182,0.8))]">
      <rect x="22.6" y="24" width="2.8" height="20" rx="1.4" fill="#e5e7eb" />
      <circle cx="24" cy="18" r="14" fill="#f472b6" />
      <path d="M24 18 m0 -14 a14 14 0 0 1 12 7 a10 10 0 0 0 -12 -3 a7 7 0 0 1 4 -4z"
        fill="#fbcfe8" opacity="0.9" />
      <path d="M24 4a14 14 0 0 1 12 21 14 14 0 0 0 -8 -18 14 14 0 0 1 -4 -3z"
        fill="#db2777" opacity="0.7" />
      <circle cx="19" cy="12" r="3" fill="#fff" opacity="0.55" />
    </svg>
  );
}

const GEM_COLORS: Record<string, [string, string, string]> = {
  blue: ["#e0f2fe", "#7dd3fc", "#0284c7"],
  green: ["#dcfce7", "#4ade80", "#15803d"],
  purple: ["#ede9fe", "#c4b5fd", "#7c3aed"],
  red: ["#fee2e2", "#fca5a5", "#dc2626"],
};

/** the drawn face for a symbol id, or null when only a glyph exists */
export function SymbolFace({ sym, size = "", stone = false }: {
  sym: string; size?: string; stone?: boolean;
}) {
  const wrap = (node: React.ReactNode) => (
    <span className={`grid h-full w-full place-items-center ${size}`}>{node}</span>
  );
  if (stone && ["A", "K", "Q", "J"].includes(sym)) {
    return wrap(<StoneRoyal ch={sym} />);
  }
  if (sym === "reaper") return wrap(<SkullFace />);
  if (sym === "coffin") return wrap(<CoffinFace />);
  if (sym === "candle") return wrap(<CandleFace />);
  if (sym === "potion") return wrap(<FlaskFace />);
  if (sym === "wild") {
    return wrap(
      <span className="rounded-md bg-gradient-to-b from-yellow-200 via-gold to-amber-700 px-1.5 py-1 font-sans text-[11px] font-black tracking-tight text-base-900 shadow-[0_2px_6px_rgba(0,0,0,0.5)] ring-1 ring-yellow-100/60">WILD</span>);
  }
  if (sym === "bar" || sym === "bar3") {
    return wrap(
      <span className="flex flex-col gap-[2px]">
        {(sym === "bar3" ? [0, 1, 2] : [0]).map((i) => (
          <span key={i} className="rounded bg-gradient-to-b from-yellow-200 via-gold to-amber-700 px-1.5 text-[9px] font-black tracking-tight text-base-900 ring-1 ring-yellow-100/50">BAR</span>
        ))}
      </span>);
  }
  if (sym in ROYAL_COLORS) {
    const [f, t] = ROYAL_COLORS[sym];
    return wrap(<RoyalFace ch={sym === "seven" ? "7" : sym === "horseshoe" ? "U" : sym} from={f} to={t} />);
  }
  if (sym === "diamond") return wrap(<GemFace from="#e0f2fe" mid="#7dd3fc" to="#0284c7" />);
  if (sym === "ring") return wrap(<GemFace from="#fce7f3" mid="#f9a8d4" to="#be185d" />);
  if (sym === "bell") return wrap(<BellFace />);
  if (sym === "cherry") return wrap(<CherryFace />);
  if (sym === "star") return wrap(<StarFace />);
  if (sym === "scatter") return wrap(<StarFace glow />);
  if (sym === "lollipop") return wrap(<LollipopFace />);
  if (sym === "coin") return wrap(<CoinFace />);
  if (sym === "crown") return wrap(<CrownFace />);
  if (sym === "banana") return wrap(<BananaFace />);
  if (sym === "apple") return wrap(<AppleFace />);
  if (sym === "heart") return wrap(<HeartFace />);
  if (sym in GEM_COLORS) {
    const [f, m, t] = GEM_COLORS[sym];
    return wrap(<GemFace from={f} mid={m} to={t} />);
  }
  if (["lemon", "orange", "grapes", "grape", "plum", "berry", "melon"].includes(sym)) {
    return wrap(<FruitFace kind={sym === "grape" ? "grapes" : sym} />);
  }
  // theme premiums, per machine mood
  if (sym === "mask") return wrap(<MaskFace />);
  if (sym === "jaguar") return wrap(<JaguarFace />);
  if (sym === "snake") return wrap(<SnakeFace />);
  if (sym === "idol") return wrap(<IdolSymFace />);
  if (sym === "buffalo") return wrap(<BuffaloSprite />);
  if (sym === "eagle") return wrap(<BirdFace eagle />);
  if (sym === "wolf") return wrap(<WolfFace />);
  if (sym === "cactus") return wrap(<CactusFace />);
  if (sym === "sun") return wrap(<SunFace />);
  if (sym === "palm") return wrap(<PalmFace />);
  if (sym === "cassette") return wrap(<CassetteFace />);
  if (sym === "shades") return wrap(<ShadesFace />);
  return null;
}

function Defs({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f7ca5e" />
        <stop offset="1" stopColor="#d99e12" />
      </linearGradient>
      <radialGradient id={`${id}-glow`} cx="0.5" cy="0.15" r="0.9">
        <stop offset="0" stopColor="rgba(240,180,41,0.28)" />
        <stop offset="1" stopColor="rgba(240,180,41,0)" />
      </radialGradient>
    </defs>
  );
}

function Frame({ id, from, to, children }: {
  id: string; from: string; to: string; children: React.ReactNode;
}) {
  return (
    <svg viewBox="0 0 320 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <Defs id={id} from={from} to={to} />
      <rect width="320" height="128" fill={`url(#${id})`} />
      <rect width="320" height="128" fill={`url(#${id}-glow)`} />
      {children}
    </svg>
  );
}

const Card = ({ x, y, r, label, red }: {
  x: number; y: number; r: number; label: string; red?: boolean;
}) => (
  <g transform={`rotate(${r} ${x + 24} ${y + 33})`}>
    <rect x={x + 2} y={y + 3} width="48" height="66" rx="6" fill="rgba(0,0,0,0.45)" />
    <rect x={x} y={y} width="48" height="66" rx="6" fill="#f3f4f6" stroke="#cbd5e1" />
    <text x={x + 8} y={y + 22} fontSize="17" fontWeight="800"
      fill={red ? "#dc2626" : "#111827"} fontFamily="Georgia, serif">{label[0]}</text>
    <text x={x + 24} y={y + 46} fontSize="24" textAnchor="middle"
      fill={red ? "#dc2626" : "#111827"}>{label.slice(1)}</text>
  </g>
);

function BlackjackArt() {
  return (
    <Frame id="bj" from="#123524" to="#071b10">
      <ellipse cx="160" cy="150" rx="190" ry="70" fill="#0d2b1b" />
      <path d="M 30 150 A 160 90 0 0 1 290 150" fill="none"
        stroke="url(#bj-gold)" strokeWidth="2.5" opacity="0.8" />
      <Card x={118} y={30} r={-12} label="A♠" />
      <Card x={158} y={28} r={9} label="K♥" red />
      {/* chips */}
      <g>
        <circle cx="70" cy="96" r="17" fill="#b91c1c" stroke="#fecaca" strokeWidth="3" strokeDasharray="7 6" />
        <circle cx="70" cy="96" r="9" fill="#7f1d1d" />
        <circle cx="252" cy="100" r="17" fill="#1d4ed8" stroke="#bfdbfe" strokeWidth="3" strokeDasharray="7 6" />
        <circle cx="252" cy="100" r="9" fill="#172554" />
        <circle cx="278" cy="88" r="17" fill="url(#bj-gold)" stroke="#fff7e0" strokeWidth="3" strokeDasharray="7 6" />
        <circle cx="278" cy="88" r="9" fill="#a16207" />
      </g>
    </Frame>
  );
}




function SlotArt({ theme, window: win }: {
  theme: { from: string; to: string; id: string };
  window: [string, string, string];
}) {
  const cell = (i: number, sym: string) => {
    const spec = SYMBOL_GLYPH[sym] ?? { g: sym };
    const x = 76 + i * 60;
    const gold = spec.cls === "slot-gold";
    const bar = spec.cls === "slot-bar";
    return (
      <g key={i}>
        <rect x={x} y={34} width="52" height="62" rx="8" fill="#0b0e14" stroke="rgba(240,180,41,0.4)" />
        <rect x={x} y={34} width="52" height="18" rx="8" fill="rgba(255,255,255,0.05)" />
        {bar ? (
          <>
            <rect x={x + 7} y={54} width="38" height="20" rx="4" fill={`url(#${theme.id}-gold)`} />
            <text x={x + 26} y={69} fontSize="13" fontWeight="900" textAnchor="middle"
              fill="#0b0e14" fontFamily="Arial Black, sans-serif">BAR</text>
          </>
        ) : (
          <text x={x + 26} y={76} fontSize={gold ? 36 : 30} fontWeight="900" textAnchor="middle"
            fill={gold ? `url(#${theme.id}-gold)` : "#e2e8f0"}
            fontFamily="Arial Black, sans-serif">{spec.g}</text>
        )}
      </g>
    );
  };
  // marquee bulbs across the top
  const bulbs = Array.from({ length: 13 }, (_, i) => (
    <circle key={i} cx={40 + i * 20} cy={16} r="4"
      fill={i % 2 ? "#f0b429" : "rgba(240,180,41,0.35)"} />
  ));
  return (
    <Frame id={theme.id} from={theme.from} to={theme.to}>
      <rect x="58" y="24" width="204" height="82" rx="12"
        fill="rgba(255,255,255,0.06)" stroke="rgba(240,180,41,0.5)" strokeWidth="2" />
      {bulbs}
      {win.map((s, i) => cell(i, s))}
      {/* the lever */}
      <rect x="272" y="52" width="9" height="40" rx="4" fill="#94a3b8" />
      <circle cx="276.5" cy="46" r="10" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
    </Frame>
  );
}









const SLOT_THEMES: Record<string, { from: string; to: string; id: string; window: [string, string, string] }> = {
  "slot:gold777": { id: "sg", from: "#3a2606", to: "#140d02", window: ["seven", "seven", "seven"] },
  "slot:fruitfrenzy": { id: "sf", from: "#3f1206", to: "#160602", window: ["cherry", "melon", "lemon"] },
  "slot:diamondriches": { id: "sd", from: "#0c2740", to: "#040e18", window: ["diamond", "crown", "diamond"] },
  "slot:luckyclover": { id: "sc", from: "#0d3311", to: "#041305", window: ["clover", "horseshoe", "clover"] },
  "vslot:golden7s": { id: "vg", from: "#3a2606", to: "#140d02", window: ["seven", "wild", "seven"] },
  "vslot:aztec": { id: "va", from: "#2d3a06", to: "#0e1402", window: ["mask", "scatter", "jaguar"] },
  "vslot:fruitblitz": { id: "vf", from: "#3f0642", to: "#160217", window: ["berry", "wild", "melon"] },
  "vslot:reaper": { id: "vr", from: "#1c1030", to: "#08040f", window: ["reaper", "wild", "coffin"] },
  "vslot:neonnights": { id: "vn", from: "#062a3a", to: "#02101a", window: ["sun", "wild", "palm"] },
  "vslot:buffalo": { id: "vb", from: "#3a1d06", to: "#140a02", window: ["buffalo", "wild", "eagle"] },
};











/* ==================== the poster system ====================
 * Every tile is a movie-poster lockup: themed backdrop, light rays, scene
 * glyphs, a 3D extruded title in the game's colors, and the LUCKY777 badge.
 * This is the whole lobby's face — treat it like packaging, not decoration.
 */
type PosterSpec = {
  title: string;             // display name, auto-split onto 1-2 lines
  bg: [string, string];      // backdrop gradient top -> bottom
  ac: [string, string];      // title letter gradient light -> deep
  g: [string, string?];      // scene glyphs: hero left, optional right
  sub?: string;              // small tagline under the title
};

export const POSTERS: Record<string, PosterSpec> = {
  heist: { title: "Grand Heist", bg: ["#3a2a04", "#0f0a01"], ac: ["#ffe9a3", "#f0b429"], g: ["💰", "💎"], sub: "STICKY WILD VAULT · WIN UP TO 5,000×" },
  tumble: { title: "Sugar Blast", bg: ["#4a0d54", "#12031c"], ac: ["#ffd6f2", "#e879f9"], g: ["🍭", "🍉"], sub: "TUMBLE WINS" },
  dragon: { title: "Golden Dragon", bg: ["#5a0f06", "#180301"], ac: ["#ffe9a3", "#f59e0b"], g: ["🐉", "🪙"], sub: "HOLD & WIN · GRAND 2000x" },
  holdspin: { title: "Piggy Blast", bg: ["#4a1140", "#160312"], ac: ["#ffc9de", "#f472b6"], g: ["🐷", "🪙"], sub: "HOLD & SPIN" },
  "vslot:golden7s": { title: "Golden 7s", bg: ["#4a3106", "#140d02"], ac: ["#fff3c4", "#f0b429"], g: ["7️⃣", "🔔"], sub: "20 LINES · FREE SPINS" },
  "vslot:aztec": { title: "Aztec Gold", bg: ["#1d4a10", "#071403"], ac: ["#d9f99d", "#65a30d"], g: ["🗿", "🐆"], sub: "20 LINES · FREE SPINS" },
  "vslot:fruitblitz": { title: "Fruit Blitz", bg: ["#4a0650", "#150217"], ac: ["#fbcfe8", "#d946ef"], g: ["🍓", "🍒"], sub: "20 LINES · FREE SPINS" },
  "vslot:reaper": { title: "Grim Fortune", bg: ["#241448", "#0a0517"], ac: ["#ddd6fe", "#8b5cf6"], g: ["💀", "🕯️"], sub: "20 LINES · FREE SPINS" },
  "vslot:neonnights": { title: "Neon Nights", bg: ["#063a52", "#02111c"], ac: ["#a5f3fc", "#06b6d4"], g: ["🌅", "🌴"], sub: "20 LINES · FREE SPINS" },
  "vslot:buffalo": { title: "Thunder Herd", bg: ["#4a2506", "#170b02"], ac: ["#fed7aa", "#ea580c"], g: ["🦬", "🦅"], sub: "20 LINES · FREE SPINS" },
  "slot:gold777": { title: "Gold 777", bg: ["#4a3106", "#140d02"], ac: ["#fff3c4", "#f0b429"], g: ["🎰", "💰"], sub: "CLASSIC 3-REEL" },
  "slot:fruitfrenzy": { title: "Fruit Frenzy", bg: ["#4f1507", "#180602"], ac: ["#fecaca", "#ef4444"], g: ["🍒", "🍋"], sub: "CLASSIC 3-REEL" },
  "slot:diamondriches": { title: "Diamond Riches", bg: ["#0d3152", "#03101c"], ac: ["#bae6fd", "#38bdf8"], g: ["💎", "👑"], sub: "CLASSIC 3-REEL" },
  "slot:luckyclover": { title: "Lucky Clover", bg: ["#0d401a", "#031407"], ac: ["#bbf7d0", "#22c55e"], g: ["🍀", "🌈"], sub: "CLASSIC 3-REEL" },
  roulette: { title: "Roulette", bg: ["#123524", "#05130b"], ac: ["#fecaca", "#dc2626"], g: ["🎯", "🔴"], sub: "EUROPEAN SINGLE ZERO" },
  videopoker: { title: "Video Poker", bg: ["#12274a", "#040b17"], ac: ["#bfdbfe", "#3b82f6"], g: ["🂡", "🃞"], sub: "JACKS OR BETTER" },
  baccarat: { title: "Baccarat", bg: ["#3a0a2a", "#14030e"], ac: ["#fbcfe8", "#ec4899"], g: ["🀄", "🃏"], sub: "PUNTO BANCO" },
  blackjack: { title: "Blackjack", bg: ["#123524", "#05130b"], ac: ["#d1fae5", "#10b981"], g: ["🂡", "🂮"], sub: "PAYS 3:2" },
  plinko: { title: "Plinko", bg: ["#241048", "#0a0517"], ac: ["#ddd6fe", "#a78bfa"], g: ["🔻", "⚪"], sub: "PICK YOUR RISK" },
  mines: { title: "Mines", bg: ["#341206", "#120502"], ac: ["#fed7aa", "#f97316"], g: ["💣", "💎"], sub: "CASH OUT ANY TIME" },
  crash: { title: "Crash", bg: ["#3a0a14", "#140306"], ac: ["#fecdd3", "#f43f5e"], g: ["🚀", "📈"], sub: "RIDE THE CURVE" },
  duel: { title: "Duel", bg: ["#3b1220", "#12060c"], ac: ["#e2e8f0", "#94a3b8"], g: ["⚔️", "🛡️"], sub: "BEAT THE HOUSE" },
  dice: { title: "Dice", bg: ["#1e1b4b", "#0b0a26"], ac: ["#c7d2fe", "#6366f1"], g: ["🎲", "🎲"], sub: "PICK YOUR NUMBER" },
  wheel: { title: "Wheel", bg: ["#082f2a", "#03110f"], ac: ["#99f6e4", "#14b8a6"], g: ["🎡", "⭐"], sub: "THREE RISK LEVELS" },
  keno: { title: "Keno", bg: ["#2a1060", "#0e0524"], ac: ["#ddd6fe", "#8b5cf6"], g: ["🎱", "🔮"], sub: "CATCH THE NUMBERS" },
  limbo: { title: "Limbo", bg: ["#053142", "#02141d"], ac: ["#a5f3fc", "#22d3ee"], g: ["🎯", "📉"], sub: "NAME YOUR NUMBER" },
  towers: { title: "Towers", bg: ["#04331f", "#021710"], ac: ["#bbf7d0", "#34d399"], g: ["🗼", "💀"], sub: "CLIMB & CASH OUT" },
  dragontiger: { title: "Dragon Tiger", bg: ["#3a1204", "#170701"], ac: ["#fed7aa", "#f97316"], g: ["🐉", "🐯"], sub: "HIGH CARD WINS" },
  hilo: { title: "Hi-Lo", bg: ["#052c42", "#02121d"], ac: ["#bae6fd", "#0ea5e9"], g: ["🂱", "⬆️"], sub: "PRESS OR CASH OUT" },
  lucky7: { title: "Lucky 7", bg: ["#4a3106", "#140d02"], ac: ["#fff3c4", "#f0b429"], g: ["🎲", "7️⃣"], sub: "UNDER · SEVEN · OVER" },
  rps: { title: "Rock Paper Scissors", bg: ["#241048", "#0d0620"], ac: ["#ddd6fe", "#a78bfa"], g: ["✊", "✌️"], sub: "TIE PUSHES" },
  darts: { title: "Darts", bg: ["#3a0808", "#170404"], ac: ["#fecaca", "#ef4444"], g: ["🎯", "🎪"], sub: "CALL YOUR RING" },
  prism: { title: "Prism", bg: ["#33063a", "#150217"], ac: ["#f5d0fe", "#d946ef"], g: ["💎", "🔮"], sub: "LAND A GEM" },
  penalty: { title: "Penalty Shootout", bg: ["#0a3a14", "#041708"], ac: ["#bbf7d0", "#22c55e"], g: ["⚽", "🧤"], sub: "STREAK MULTIPLIER" },
  penguin: { title: "Penguin Dash", bg: ["#053347", "#02141d"], ac: ["#a5f3fc", "#06b6d4"], g: ["🐧", "🐻‍❄️"], sub: "HOP THE FLOES" },
  acey: { title: "Acey Ducey", bg: ["#141048", "#0a071d"], ac: ["#c7d2fe", "#6366f1"], g: ["🎴", "❓"], sub: "BETWEEN OR OUTSIDE" },
  war: { title: "War", bg: ["#3a0a14", "#170408"], ac: ["#fecdd3", "#f43f5e"], g: ["⚔️", "🛡️"], sub: "GO TO WAR ON TIES" },
  flip: { title: "10 Card Flip", bg: ["#20263a", "#0d0f18"], ac: ["#e2e8f0", "#94a3b8"], g: ["🃏", "❤️"], sub: "FLIP THE REDS" },
  bus: { title: "Ride the Bus", bg: ["#3a2e06", "#171202"], ac: ["#fef08a", "#eab308"], g: ["🚌", "🃏"], sub: "FOUR CALLS TO GLORY" },
  suitlink: { title: "Suit Link", bg: ["#3a0a26", "#17040e"], ac: ["#fbcfe8", "#ec4899"], g: ["🔗", "♥"], sub: "MATCH YOUR SUIT" },
  hcf: { title: "High Card Flush", bg: ["#04331f", "#021710"], ac: ["#bbf7d0", "#10b981"], g: ["🂡", "♠"], sub: "LONGEST SUIT PAYS" },
};

function _splitTitle(t: string): string[] {
  const words = t.toUpperCase().split(" ");
  if (words.length === 1 || t.length <= 9) return [words.join(" ")];
  // balance words onto two lines
  let best: string[] = [words.join(" ")], gap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const d = Math.abs(a.length - b.length);
    if (Math.max(a.length, b.length) < best.reduce((m, l) => Math.max(m, l.length), 0) ||
        (Math.max(a.length, b.length) <= best.reduce((m, l) => Math.max(m, l.length), 0) && d < gap)) {
      best = [a, b]; gap = d;
    }
  }
  return best;
}

/* the 3D lockup: dark drop shadow, colored extrude, gradient face, sheen */
function TitleLockup({ id, lines, ac, cx, cy, maxW = 206, scale = 1 }: {
  id: string; lines: string[]; ac: [string, string];
  cx: number; cy: number; maxW?: number; scale?: number;
}) {
  // the tile CROPS the poster's sides (slice fit), so the title must live in
  // the SAFE band around center — maxW is that band, not the full canvas.
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const size = Math.max(13, Math.min(38, maxW / (longest * 0.68))) * scale;
  const lh = size * 0.98;
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  // belt and braces: if a line would still overrun the band, squeeze it
  const fitW = (l: string): number | undefined => {
    const est = l.length * size * 0.72;
    return est > maxW ? maxW : undefined;
  };
  const layer = (dy: number, fill: string, stroke?: string, sw?: number, op?: number) =>
    lines.map((l, i) => (
      <text key={`${dy}-${fill}-${i}`} x={cx} y={y0 + i * lh + dy} fontSize={size}
        fontWeight="900" textAnchor="middle" fill={fill}
        stroke={stroke} strokeWidth={sw} opacity={op}
        textLength={fitW(l)} lengthAdjust="spacingAndGlyphs"
        fontFamily="'Arial Black', Impact, sans-serif"
        style={{ letterSpacing: "-0.02em" }}
        dominantBaseline="middle">{l}</text>
    ));
  return (
    <g>
      {layer(size * 0.14, "rgba(0,0,0,0.55)")}
      {layer(size * 0.07, ac[1], "#0b0e14", size * 0.16)}
      {layer(0, `url(#${id}-face)`, "#0b0e14", size * 0.05)}
      {lines.map((l, i) => (
        <text key={`sheen-${i}`} x={cx} y={y0 + i * lh - size * 0.02} fontSize={size}
          fontWeight="900" textAnchor="middle" fill="rgba(255,255,255,0.28)"
          textLength={fitW(l)} lengthAdjust="spacingAndGlyphs"
          fontFamily="'Arial Black', Impact, sans-serif"
          style={{ letterSpacing: "-0.02em", clipPath: `inset(0 0 55% 0)` }}
          dominantBaseline="middle">{l}</text>
      ))}
    </g>
  );
}

function Poster({ k, p }: { k: string; p: PosterSpec }) {
  const id = `po-${k.replace(/[^a-z0-9]/gi, "")}`;
  const lines = _splitTitle(p.title);
  return (
    <svg viewBox="0 0 320 128" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.bg[0]} />
          <stop offset="1" stopColor={p.bg[1]} />
        </linearGradient>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.25" stopColor={p.ac[0]} />
          <stop offset="1" stopColor={p.ac[1]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.3" r="0.75">
          <stop offset="0" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id={`${id}-vig`} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.62" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
      </defs>
      <rect width="320" height="128" fill={`url(#${id}-bg)`} />
      {/* light rays fanning from behind the title */}
      <g opacity="0.10">
        {Array.from({ length: 9 }, (_, i) => {
          const a = -80 + i * 20;
          return <polygon key={i} points="160,58 -40,128 400,128"
            transform={`rotate(${a} 160 58)`} fill={p.ac[0]} opacity={i % 2 ? 0.5 : 1} />;
        })}
      </g>
      <rect width="320" height="128" fill={`url(#${id}-glow)`} />
      {/* scene glyphs */}
      <text x="42" y="76" fontSize="46" textAnchor="middle"
        transform="rotate(-10 42 62)" style={{ filter: "drop-shadow(0 3px 2px rgba(0,0,0,0.5))" }}>{p.g[0]}</text>
      {p.g[1] && (
        <text x="282" y="70" fontSize="38" textAnchor="middle"
          transform="rotate(10 278 56)" style={{ filter: "drop-shadow(0 3px 2px rgba(0,0,0,0.5))" }}>{p.g[1]}</text>
      )}
      {/* sparkles */}
      <circle cx="70" cy="24" r="1.6" fill="#fff" opacity="0.7" />
      <circle cx="252" cy="18" r="1.2" fill="#fff" opacity="0.5" />
      <circle cx="296" cy="98" r="1.4" fill="#fff" opacity="0.4" />
      <circle cx="24" cy="102" r="1.2" fill="#fff" opacity="0.4" />
      <TitleLockup id={id} lines={lines} ac={p.ac} cx={160} cy={lines.length > 1 ? 56 : 58} />
      {/* tagline + house badge */}
      {p.sub && (
        <text x="160" y={lines.length > 1 ? 102 : 88} fontSize="8.5" fontWeight="700"
          textAnchor="middle" fill="rgba(255,255,255,0.75)"
          fontFamily="Arial, sans-serif" style={{ letterSpacing: "0.22em" }}>{p.sub}</text>
      )}
      <g>
        <rect x="112" y="110" width="96" height="13" rx="6.5" fill="rgba(0,0,0,0.5)"
          stroke="rgba(240,180,41,0.45)" strokeWidth="0.8" />
        <text x="160" y="119" fontSize="7.5" fontWeight="900" textAnchor="middle"
          fill="#f0b429" fontFamily="Arial Black, sans-serif"
          style={{ letterSpacing: "0.14em" }}>★ LUCKY777 ★</text>
      </g>
      <rect width="320" height="128" fill={`url(#${id}-vig)`} />
    </svg>
  );
}

/* standalone logo lockup for game screens: transparent, wide */
export function GameLogo({ k }: { k: string }) {
  const p = POSTERS[k];
  if (!p) return null;
  const id = `lg-${k.replace(/[^a-z0-9]/gi, "")}`;
  const lines = [_splitTitle(p.title).join(" ")];
  return (
    <svg viewBox="0 0 320 44" className="h-12 w-auto" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.25" stopColor={p.ac[0]} />
          <stop offset="1" stopColor={p.ac[1]} />
        </linearGradient>
      </defs>
      <TitleLockup id={id} lines={lines} ac={p.ac} cx={160} cy={23} maxW={300} scale={0.86} />
    </svg>
  );
}

export default function GameArt({ k }: { k: string }) {
  const p = POSTERS[k];
  if (p) return <Poster k={k} p={p} />;
  const t = SLOT_THEMES[k];
  if (t) return <SlotArt theme={t} window={t.window} />;
  return <BlackjackArt />;
}
