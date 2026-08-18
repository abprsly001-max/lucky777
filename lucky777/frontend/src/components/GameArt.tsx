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

function DuelArt() {
  const blade = (flip: boolean) => (
    <g transform={flip ? "translate(320 0) scale(-1 1)" : undefined}>
      <polygon points="70,108 178,34 190,22 196,28 184,40 92,124" fill="#cbd5e1" />
      <polygon points="70,108 178,34 174,30 66,104" fill="#f8fafc" />
      <rect x="76" y="98" width="34" height="9" rx="4" transform="rotate(-38 93 102)" fill="url(#duel-gold)" />
      <circle cx="66" cy="116" r="7" fill="url(#duel-gold)" />
    </g>
  );
  return (
    <Frame id="duel" from="#3b1220" to="#12060c">
      <circle cx="160" cy="64" r="44" fill="rgba(240,180,41,0.10)" />
      <circle cx="160" cy="64" r="44" fill="none" stroke="rgba(240,180,41,0.35)" strokeWidth="1.5" />
      {blade(false)}
      {blade(true)}
      <circle cx="160" cy="66" r="5" fill="#f0b429" />
    </Frame>
  );
}

function DiceArt() {
  const pip = (x: number, y: number) => <circle cx={x} cy={y} r="4.6" fill="#1e1b4b" />;
  return (
    <Frame id="dice" from="#1e1b4b" to="#0b0a26">
      <ellipse cx="160" cy="126" rx="150" ry="26" fill="rgba(0,0,0,0.5)" />
      <g transform="rotate(-14 120 70)">
        <rect x="86" y="38" width="62" height="62" rx="12" fill="#f8fafc" stroke="#cbd5e1" />
        {pip(103, 55)}{pip(117, 69)}{pip(131, 83)}
      </g>
      <g transform="rotate(11 208 74)">
        <rect x="176" y="42" width="62" height="62" rx="12" fill="url(#dice-gold)" stroke="#a16207" />
        <circle cx="192" cy="58" r="4.6" fill="#422006" /><circle cx="222" cy="58" r="4.6" fill="#422006" />
        <circle cx="192" cy="88" r="4.6" fill="#422006" /><circle cx="222" cy="88" r="4.6" fill="#422006" />
        <circle cx="207" cy="73" r="4.6" fill="#422006" />
      </g>
    </Frame>
  );
}

function WheelArt() {
  const segs = 12;
  const colors = ["#f0b429", "#243044", "#4ade80", "#243044", "#38bdf8", "#243044"];
  const paths = Array.from({ length: segs }, (_, i) => {
    const a0 = (i / segs) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / segs) * 2 * Math.PI - Math.PI / 2;
    const x0 = 160 + 58 * Math.cos(a0), y0 = 78 + 58 * Math.sin(a0);
    const x1 = 160 + 58 * Math.cos(a1), y1 = 78 + 58 * Math.sin(a1);
    return (
      <path key={i} d={`M160 78 L${x0} ${y0} A58 58 0 0 1 ${x1} ${y1} Z`}
        fill={colors[i % colors.length]} stroke="#0b0e14" strokeWidth="1.5" />
    );
  });
  return (
    <Frame id="wheel" from="#082f2a" to="#03110f">
      {paths}
      <circle cx="160" cy="78" r="62" fill="none" stroke="url(#wheel-gold)" strokeWidth="4" />
      <circle cx="160" cy="78" r="12" fill="url(#wheel-gold)" stroke="#0b0e14" strokeWidth="2" />
      <polygon points="160,6 151,22 169,22" fill="#f0b429" stroke="#0b0e14" strokeWidth="1.5" />
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


function RouletteArt() {
  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const order = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9];
  const segs = order.map((n, i) => {
    const a0 = (i / order.length) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / order.length) * 2 * Math.PI - Math.PI / 2;
    const x0 = 160 + 56 * Math.cos(a0), y0 = 84 + 56 * Math.sin(a0);
    const x1 = 160 + 56 * Math.cos(a1), y1 = 84 + 56 * Math.sin(a1);
    const fill = n === 0 ? "#15803d" : RED.has(n) ? "#b91c1c" : "#111827";
    return <path key={i} d={`M160 84 L${x0} ${y0} A56 56 0 0 1 ${x1} ${y1} Z`} fill={fill} stroke="#0b0e14" strokeWidth="1" />;
  });
  return (
    <Frame id="rl" from="#14351f" to="#06130a">
      {segs}
      <circle cx="160" cy="84" r="60" fill="none" stroke="url(#rl-gold)" strokeWidth="4" />
      <circle cx="160" cy="84" r="30" fill="#1a2130" stroke="url(#rl-gold)" strokeWidth="2" />
      <circle cx="160" cy="84" r="6" fill="url(#rl-gold)" />
      <circle cx="185" cy="42" r="5" fill="#f8fafc" stroke="#94a3b8" />
    </Frame>
  );
}

function VideoPokerArt() {
  return (
    <Frame id="vp" from="#1c2a4a" to="#0a101f">
      <Card x={64} y={30} r={-8} label="A♠" />
      <Card x={112} y={26} r={-3} label="K♥" red />
      <Card x={160} y={25} r={2} label="Q♦" red />
      <Card x={208} y={28} r={7} label="J♣" />
      <rect x="120" y="100" width="80" height="18" rx="9" fill="url(#vp-gold)" />
      <text x="160" y="113" fontSize="11" fontWeight="900" textAnchor="middle" fill="#0b0e14"
        fontFamily="Arial, sans-serif">HOLD</text>
    </Frame>
  );
}

function BaccaratArt() {
  return (
    <Frame id="bc" from="#3d1a1a" to="#150707">
      <ellipse cx="160" cy="150" rx="200" ry="76" fill="#5b1e1e" opacity="0.5" />
      <path d="M 20 128 A 190 100 0 0 1 300 128" fill="none" stroke="url(#bc-gold)" strokeWidth="2" opacity="0.7" />
      <Card x={84} y={34} r={-6} label="9♥" red />
      <Card x={124} y={32} r={4} label="6♦" red />
      <Card x={196} y={34} r={-4} label="8♠" />
      <Card x={236} y={36} r={6} label="K♣" />
      <text x="107" y="26" fontSize="11" fontWeight="800" textAnchor="middle" fill="#93c5fd"
        fontFamily="Arial, sans-serif">PLAYER</text>
      <text x="219" y="26" fontSize="11" fontWeight="800" textAnchor="middle" fill="#fca5a5"
        fontFamily="Arial, sans-serif">BANKER</text>
    </Frame>
  );
}

function MinesArt() {
  const cells = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 5; c++) {
      const x = 88 + c * 30, y = 24 + r * 30;
      const kind = (r === 1 && c === 2) ? "bomb" : ((r + c) % 3 === 0 ? "gem" : "hidden");
      cells.push(
        <g key={`${r}-${c}`}>
          <rect x={x} y={y} width="26" height="26" rx="6"
            fill={kind === "hidden" ? "#243044" : "#0b0e14"}
            stroke={kind === "gem" ? "rgba(74,222,128,0.6)" : kind === "bomb" ? "rgba(248,113,113,0.7)" : "rgba(255,255,255,0.08)"} />
          {kind === "gem" && <text x={x + 13} y={y + 19} fontSize="14" textAnchor="middle">💎</text>}
          {kind === "bomb" && <text x={x + 13} y={y + 19} fontSize="14" textAnchor="middle">💣</text>}
        </g>
      );
    }
  return <Frame id="mn" from="#252d3d" to="#0c101a">{cells}</Frame>;
}

function CrashArt() {
  return (
    <Frame id="cr" from="#231a3d" to="#0b0716">
      <path d="M 24 116 Q 140 108 220 66 T 292 18" fill="none" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" />
      <path d="M 24 116 Q 140 108 220 66 T 292 18 L 292 116 Z" fill="rgba(74,222,128,0.10)" />
      <text x="286" y="30" fontSize="20" textAnchor="middle">🚀</text>
      <text x="70" y="46" fontSize="26" fontWeight="900" fill="url(#cr-gold)" fontFamily="Arial Black, sans-serif">2.47×</text>
      {[40, 70, 100].map((y) => (
        <line key={y} x1="24" y1={y} x2="296" y2={y} stroke="rgba(255,255,255,0.06)" />
      ))}
    </Frame>
  );
}


function PlinkoArt() {
  const pegs = [];
  for (let r = 1; r <= 7; r++)
    for (let i = 0; i <= r; i++)
      pegs.push(<circle key={`${r}-${i}`} cx={160 + (i - r / 2) * 26} cy={10 + r * 13}
        r="3" fill="#46536b" />);
  const buckets = ["#f0b429", "#f59e0b", "#4ade80", "#334155", "#4ade80", "#f59e0b", "#f0b429"];
  return (
    <Frame id="pk" from="#182036" to="#0a0e18">
      {pegs}
      <circle cx="173" cy="55" r="6" fill="url(#pk-gold)" />
      {buckets.map((c, i) => (
        <rect key={i} x={62 + i * 28} y={108} width="25" height="12" rx="3"
          fill="rgba(255,255,255,0.06)" stroke={c} strokeWidth="1.5" />
      ))}
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

function PiggyArt() {
  const coin = (x: number, y: number, v: string) => (
    <g key={`${x}${y}`}>
      <circle cx={x} cy={y} r="13" fill="url(#pg-gold)" stroke="#a16207" strokeWidth="1.5" />
      <text x={x} y={y + 4} fontSize="10" fontWeight="900" textAnchor="middle"
        fill="#422006" fontFamily="Arial Black, sans-serif">{v}</text>
    </g>
  );
  return (
    <Frame id="pg" from="#3a1030" to="#140312">
      <text x="160" y="80" fontSize="56" textAnchor="middle">🐷</text>
      {coin(60, 40, "2x")}
      {coin(250, 34, "5x")}
      {coin(90, 100, "1x")}
      {coin(232, 96, "10x")}
      {coin(285, 70, "3x")}
      <text x="160" y="118" fontSize="11" fontWeight="900" textAnchor="middle"
        fill="url(#pg-gold)" fontFamily="Arial Black, sans-serif">HOLD & SPIN</text>
    </Frame>
  );
}

function DragonArt() {
  const coin = (x: number, y: number, v: string, r = 12) => (
    <g key={`${x}${y}`}>
      <circle cx={x} cy={y} r={r} fill="url(#dg-gold)" stroke="#7c2d12" strokeWidth="1.5" />
      <text x={x} y={y + 3.5} fontSize={r * 0.62} fontWeight="900" textAnchor="middle"
        fill="#431407" fontFamily="Arial Black, sans-serif">{v}</text>
    </g>
  );
  return (
    <Frame id="dg" from="#4a0904" to="#190201">
      <text x="160" y="82" fontSize="58" textAnchor="middle">🐉</text>
      {coin(52, 38, "MINI")}
      {coin(258, 32, "MAXI", 14)}
      {coin(86, 100, "88")}
      {coin(236, 98, "MAJOR", 13)}
      {coin(290, 68, "8")}
      <text x="160" y="24" fontSize="12" fontWeight="900" textAnchor="middle"
        fill="url(#dg-gold)" fontFamily="Arial Black, sans-serif">GRAND 2000x</text>
      <text x="160" y="118" fontSize="11" fontWeight="900" textAnchor="middle"
        fill="url(#dg-gold)" fontFamily="Arial Black, sans-serif">HOLD & WIN</text>
    </Frame>
  );
}

export default function GameArt({ k }: { k: string }) {
  if (k === "dragon") return <DragonArt />;
  if (k === "holdspin") return <PiggyArt />;
  if (k === "blackjack") return <BlackjackArt />;
  if (k === "roulette") return <RouletteArt />;
  if (k === "videopoker") return <VideoPokerArt />;
  if (k === "baccarat") return <BaccaratArt />;
  if (k === "mines") return <MinesArt />;
  if (k === "crash") return <CrashArt />;
  if (k === "plinko") return <PlinkoArt />;
  if (k === "duel") return <DuelArt />;
  if (k === "dice") return <DiceArt />;
  if (k === "wheel") return <WheelArt />;
  const t = SLOT_THEMES[k];
  if (t) return <SlotArt theme={t} window={t.window} />;
  return <BlackjackArt />;
}
