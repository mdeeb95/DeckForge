import { useState, useEffect, useRef } from "react";

const CYAN = "#0df2f2";
const MAGENTA = "#f20dcf";
const BG = "#0d1117";
const SURFACE = "#161b22";
const BORDER = "#30363d";

// Animation implementations
const animations = {
  shockwave: {
    name: "Shockwave",
    description: "Sonar-ping ripple bursts outward from the card. Pure CSS radial animation.",
    difficulty: "Easy — CSS only",
    duration: "400ms",
  },
  slam: {
    name: "Slam Down",
    description: "Card scales up 110%, slams back with a flash. Screen shakes subtly.",
    difficulty: "Easy — CSS keyframes + Svelte transition",
    duration: "350ms",
  },
  disintegrate: {
    name: "Disintegrate",
    description: "Card shatters into pixel fragments that scatter. Requires canvas overlay.",
    difficulty: "Medium — Canvas + requestAnimationFrame",
    duration: "600ms",
  },
  launch: {
    name: "Launch Sequence",
    description: "Progress bar charges across the card, then it rockets upward off-screen.",
    difficulty: "Easy — CSS keyframes",
    duration: "500ms",
  },
  glitch: {
    name: "Glitch Warp",
    description: "Card glitches with RGB split, then warps/stretches into the terminal panel.",
    difficulty: "Easy — CSS clip-path + transforms",
    duration: "400ms",
  },
  confirm: {
    name: "Confirm Pulse",
    description: "Clean and professional. Card border ignites, checkmark stamps, glow radiates.",
    difficulty: "Easy — CSS + SVG",
    duration: "450ms",
  },
};

function ShockwaveDemo({ playing, onDone }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes shockwave-ring {
          0% { transform: scale(0.3); opacity: 0.8; border-width: 3px; }
          70% { opacity: 0.3; }
          100% { transform: scale(3); opacity: 0; border-width: 1px; }
        }
        @keyframes card-flash {
          0% { box-shadow: 0 0 0px ${CYAN}; }
          30% { box-shadow: 0 0 40px ${CYAN}, 0 0 80px ${CYAN}40; }
          100% { box-shadow: 0 0 10px ${CYAN}40; }
        }
        .shockwave-card-active {
          animation: card-flash 400ms ease-out forwards;
        }
        .ring {
          position: absolute;
          border-radius: 50%;
          border: 3px solid ${CYAN};
          pointer-events: none;
        }
        .ring-1 { animation: shockwave-ring 500ms ease-out forwards; }
        .ring-2 { animation: shockwave-ring 500ms ease-out 80ms forwards; opacity: 0; }
        .ring-3 { animation: shockwave-ring 500ms ease-out 160ms forwards; opacity: 0; }
      `}</style>
      <div
        className={`relative px-6 py-4 rounded border-2 ${playing ? "shockwave-card-active" : ""}`}
        style={{
          background: playing ? "#1c242e" : SURFACE,
          borderColor: playing ? CYAN : BORDER,
          transition: "all 150ms",
        }}
      >
        <div className="text-sm font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
          Ship It
        </div>
        <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
          Execute the plan as-is
        </div>
        {playing && (
          <>
            <div className="ring ring-1" style={{ width: 120, height: 120, top: "50%", left: "50%", marginTop: -60, marginLeft: -60 }} />
            <div className="ring ring-2" style={{ width: 120, height: 120, top: "50%", left: "50%", marginTop: -60, marginLeft: -60 }} />
            <div className="ring ring-3" style={{ width: 120, height: 120, top: "50%", left: "50%", marginTop: -60, marginLeft: -60 }} />
          </>
        )}
      </div>
    </div>
  );
}

function SlamDemo({ playing, onDone }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes slam-scale {
          0% { transform: scale(1); }
          15% { transform: scale(1.12); }
          30% { transform: scale(0.97); }
          45% { transform: scale(1.02); }
          60% { transform: scale(1); }
          100% { transform: scale(1); }
        }
        @keyframes slam-flash {
          0% { opacity: 0; }
          15% { opacity: 0.4; }
          40% { opacity: 0; }
        }
        @keyframes slam-shake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-3px); }
          20% { transform: translateX(3px); }
          30% { transform: translateX(-2px); }
          40% { transform: translateX(2px); }
          50% { transform: translateX(-1px); }
          60% { transform: translateX(0); }
        }
        .slam-card { animation: slam-scale 400ms cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards; }
        .slam-container { animation: slam-shake 400ms ease-out; }
      `}</style>
      <div className={playing ? "slam-container" : ""}>
        <div
          className={`relative px-6 py-4 rounded border-2 ${playing ? "slam-card" : ""}`}
          style={{
            background: playing ? "#1c242e" : SURFACE,
            borderColor: playing ? CYAN : BORDER,
            boxShadow: playing ? `0 0 30px ${CYAN}60` : "none",
          }}
        >
          <div className="text-sm font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
            Ship It
          </div>
          <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
            Execute the plan as-is
          </div>
        </div>
      </div>
      {playing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle, ${CYAN}30 0%, transparent 70%)`,
            animation: "slam-flash 400ms ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function LaunchDemo({ playing, onDone }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes charge-bar {
          0% { width: 0%; }
          60% { width: 100%; }
          100% { width: 100%; }
        }
        @keyframes launch-up {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          50% { transform: translateY(0) scale(1.05); opacity: 1; }
          100% { transform: translateY(-200px) scale(0.8); opacity: 0; }
        }
        @keyframes trail-fade {
          0% { opacity: 0; height: 0; }
          40% { opacity: 0; height: 0; }
          60% { opacity: 0.6; height: 60px; }
          100% { opacity: 0; height: 120px; }
        }
        .launch-card { animation: launch-up 600ms cubic-bezier(0.55, 0, 1, 0.45) 300ms forwards; }
      `}</style>
      <div className="relative">
        <div
          className={`relative px-6 py-4 rounded border-2 overflow-hidden ${playing ? "launch-card" : ""}`}
          style={{
            background: SURFACE,
            borderColor: playing ? CYAN : BORDER,
          }}
        >
          <div className="text-sm font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
            Ship It
          </div>
          <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
            Execute the plan as-is
          </div>
          {playing && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                height: 3,
                background: `linear-gradient(90deg, ${CYAN}, ${MAGENTA})`,
                animation: "charge-bar 300ms ease-out forwards",
                borderRadius: 2,
              }}
            />
          )}
        </div>
        {playing && (
          <div
            style={{
              position: "absolute",
              bottom: -10,
              left: "20%",
              right: "20%",
              background: `linear-gradient(to bottom, ${CYAN}80, transparent)`,
              animation: "trail-fade 600ms ease-out 300ms forwards",
              borderRadius: "0 0 4px 4px",
              opacity: 0,
            }}
          />
        )}
      </div>
    </div>
  );
}

function GlitchDemo({ playing, onDone }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes glitch-1 {
          0% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
          10% { clip-path: inset(20% 0 60% 0); transform: translate(-4px, 0); }
          15% { clip-path: inset(40% 0 20% 0); transform: translate(4px, 0); }
          20% { clip-path: inset(60% 0 10% 0); transform: translate(-2px, 0); }
          25% { clip-path: inset(0 0 0 0); transform: translate(0, 0); }
          30% { clip-path: inset(10% 0 70% 0); transform: translate(6px, 0); filter: hue-rotate(90deg); }
          35% { clip-path: inset(50% 0 30% 0); transform: translate(-6px, 0); filter: hue-rotate(-90deg); }
          40% { clip-path: inset(0 0 0 0); transform: translate(0, 0); filter: none; }
          100% { clip-path: inset(0 0 0 0); transform: translate(0, 0) scaleX(1.5); opacity: 0; }
        }
        @keyframes glitch-bg {
          0% { opacity: 0; }
          10% { opacity: 0.1; }
          15% { opacity: 0; }
          20% { opacity: 0.15; }
          25% { opacity: 0; }
          30% { opacity: 0.2; }
          35% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes scanline {
          0% { top: -10%; }
          100% { top: 110%; }
        }
        .glitch-card { animation: glitch-1 500ms steps(1) forwards; }
      `}</style>
      <div
        className={`relative px-6 py-4 rounded border-2 ${playing ? "glitch-card" : ""}`}
        style={{
          background: SURFACE,
          borderColor: playing ? CYAN : BORDER,
        }}
      >
        <div className="text-sm font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
          Ship It
        </div>
        <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
          Execute the plan as-is
        </div>
        {playing && (
          <div
            style={{
              position: "absolute",
              left: 0,
              width: "100%",
              height: 2,
              background: CYAN,
              opacity: 0.6,
              animation: "scanline 200ms linear infinite",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {playing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${CYAN}08 2px, ${CYAN}08 4px)`,
            animation: "glitch-bg 500ms steps(1) forwards",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function ConfirmDemo({ playing, onDone }) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes border-ignite {
          0% { border-color: ${BORDER}; box-shadow: none; }
          30% { border-color: ${CYAN}; box-shadow: 0 0 20px ${CYAN}40, inset 0 0 20px ${CYAN}10; }
          100% { border-color: ${CYAN}80; box-shadow: 0 0 10px ${CYAN}20; }
        }
        @keyframes check-draw {
          0% { stroke-dashoffset: 24; opacity: 0; }
          40% { opacity: 0; }
          50% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes pulse-glow {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .confirm-card { animation: border-ignite 500ms ease-out forwards; }
      `}</style>
      <div className="relative">
        <div
          className={`relative px-6 py-4 rounded border-2 ${playing ? "confirm-card" : ""}`}
          style={{
            background: SURFACE,
            borderColor: BORDER,
          }}
        >
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
              Ship It
            </div>
            {playing && (
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ marginTop: -1 }}>
                <path
                  d="M3 8 L7 12 L13 4"
                  fill="none"
                  stroke={CYAN}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="24"
                  style={{ animation: "check-draw 500ms ease-out forwards" }}
                />
              </svg>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
            Execute the plan as-is
          </div>
        </div>
        {playing && (
          <div
            style={{
              position: "absolute",
              inset: -2,
              border: `2px solid ${CYAN}`,
              borderRadius: 6,
              animation: "pulse-glow 600ms ease-out forwards",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </div>
  );
}

function DisintegrateDemo({ playing, onDone }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!playing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    const particles = [];
    const cx = W / 2;
    const cy = H / 2;
    const cardW = 160;
    const cardH = 60;

    // Create pixel particles from the card area
    for (let i = 0; i < 80; i++) {
      const x = cx - cardW / 2 + Math.random() * cardW;
      const y = cy - cardH / 2 + Math.random() * cardH;
      particles.push({
        x, y, origX: x, origY: y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 6 - 2,
        size: 2 + Math.random() * 3,
        alpha: 1,
        color: Math.random() > 0.3 ? CYAN : MAGENTA,
        delay: Math.random() * 200,
        started: false,
      });
    }

    let startTime = Date.now();
    let frame;
    function animate() {
      const elapsed = Date.now() - startTime;
      ctx.clearRect(0, 0, W, H);

      let allDone = true;
      for (const p of particles) {
        if (elapsed < p.delay) { allDone = false; continue; }
        if (!p.started) { p.started = true; }

        p.x += p.vx * 0.3;
        p.y += p.vy * 0.3;
        p.vy += 0.1;
        p.alpha -= 0.015;

        if (p.alpha > 0) {
          allDone = false;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        }
      }

      if (!allDone) {
        frame = requestAnimationFrame(animate);
      }
    }
    animate();
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes disintegrate-fade {
          0% { opacity: 1; filter: none; }
          30% { opacity: 1; filter: blur(0px); }
          60% { opacity: 0.5; filter: blur(1px); }
          100% { opacity: 0; filter: blur(3px); }
        }
        .disintegrate-card { animation: disintegrate-fade 500ms ease-in forwards; }
      `}</style>
      <div
        className={`relative px-6 py-4 rounded border-2 ${playing ? "disintegrate-card" : ""}`}
        style={{
          background: SURFACE,
          borderColor: playing ? CYAN : BORDER,
        }}
      >
        <div className="text-sm font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
          Ship It
        </div>
        <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
          Execute the plan as-is
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={300}
        height={200}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
    </div>
  );
}

const demoComponents = {
  shockwave: ShockwaveDemo,
  slam: SlamDemo,
  launch: LaunchDemo,
  glitch: GlitchDemo,
  confirm: ConfirmDemo,
  disintegrate: DisintegrateDemo,
};

export default function App() {
  const [selected, setSelected] = useState("shockwave");
  const [playing, setPlaying] = useState(false);
  const [playKey, setPlayKey] = useState(0);

  const play = () => {
    setPlaying(false);
    setPlayKey((k) => k + 1);
    setTimeout(() => setPlaying(true), 50);
    setTimeout(() => setPlaying(false), 1200);
  };

  const DemoComponent = demoComponents[selected];
  const info = animations[selected];

  return (
    <div className="min-h-screen p-6 flex flex-col gap-4" style={{ background: BG, color: "#e2e8f0" }}>
      <div className="text-center">
        <h1 className="text-xl font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
          Ship It Animation Picker
        </h1>
        <p className="text-xs mt-1" style={{ color: "#64748b" }}>
          Click an option, then hit PLAY to preview. Pick what feels right for DeckForge.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        {Object.entries(animations).map(([key, anim]) => (
          <button
            key={key}
            onClick={() => { setSelected(key); setPlaying(false); }}
            className="px-3 py-2 rounded text-xs font-bold transition-all"
            style={{
              background: selected === key ? `${CYAN}20` : SURFACE,
              border: `1px solid ${selected === key ? CYAN : BORDER}`,
              color: selected === key ? CYAN : "#94a3b8",
              fontFamily: "monospace",
              cursor: "pointer",
            }}
          >
            {anim.name}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-1 min-h-0" style={{ maxHeight: 320 }}>
        {/* Preview area */}
        <div
          className="flex-1 rounded relative overflow-hidden"
          style={{ border: `1px solid ${BORDER}`, background: "#0a0d12", minHeight: 200 }}
        >
          <DemoComponent key={`${selected}-${playKey}`} playing={playing} />

          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <button
              onClick={play}
              className="px-6 py-2 rounded font-bold text-sm transition-all"
              style={{
                background: CYAN,
                color: BG,
                fontFamily: "monospace",
                cursor: "pointer",
                border: "none",
                boxShadow: `0 0 20px ${CYAN}40`,
              }}
              onMouseOver={(e) => (e.target.style.boxShadow = `0 0 30px ${CYAN}80`)}
              onMouseOut={(e) => (e.target.style.boxShadow = `0 0 20px ${CYAN}40`)}
            >
              PLAY
            </button>
          </div>
        </div>

        {/* Info panel */}
        <div
          className="rounded p-4 flex flex-col gap-3"
          style={{
            width: 260,
            background: SURFACE,
            border: `1px solid ${BORDER}`,
          }}
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#64748b" }}>
              Animation
            </div>
            <div className="text-sm font-bold" style={{ color: CYAN, fontFamily: "monospace" }}>
              {info.name}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#64748b" }}>
              What it does
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
              {info.description}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#64748b" }}>
              Difficulty
            </div>
            <div
              className="text-xs px-2 py-1 rounded inline-block"
              style={{
                background: info.difficulty.startsWith("Easy") ? `${CYAN}15` : `${MAGENTA}15`,
                color: info.difficulty.startsWith("Easy") ? CYAN : MAGENTA,
                border: `1px solid ${info.difficulty.startsWith("Easy") ? `${CYAN}30` : `${MAGENTA}30`}`,
              }}
            >
              {info.difficulty}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#64748b" }}>
              Duration
            </div>
            <div className="text-xs" style={{ color: "#94a3b8", fontFamily: "monospace" }}>
              {info.duration}
            </div>
          </div>

          <div className="mt-auto pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            <div className="text-xs" style={{ color: "#475569" }}>
              All options work with Svelte 5 + CSS.
              Disintegrate needs a canvas overlay.
              Others are pure CSS keyframes.
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded p-3 text-center text-xs"
        style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: "#64748b" }}
      >
        Recommendation: <span style={{ color: CYAN }}>Slam Down</span> or <span style={{ color: CYAN }}>Glitch Warp</span> for the gamey feel.{" "}
        <span style={{ color: CYAN }}>Confirm Pulse</span> if you want cleaner.{" "}
        <span style={{ color: MAGENTA }}>Disintegrate</span> for Ship It Unhinged.
      </div>
    </div>
  );
}
