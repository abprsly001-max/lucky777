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
function TitleLockup({ id, lines, ac, cx, cy, maxW = 290, scale = 1 }: {
  id: string; lines: string[]; ac: [string, string];
  cx: number; cy: number; maxW?: number; scale?: number;
}) {
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const size = Math.max(15, Math.min(38, (maxW / longest) * 1.62)) * scale;
  const lh = size * 0.98;
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  const layer = (dy: number, fill: string, stroke?: string, sw?: number, op?: number) =>
    lines.map((l, i) => (
      <text key={`${dy}-${fill}-${i}`} x={cx} y={y0 + i * lh + dy} fontSize={size}
        fontWeight="900" textAnchor="middle" fill={fill}
        stroke={stroke} strokeWidth={sw} opacity={op}
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
