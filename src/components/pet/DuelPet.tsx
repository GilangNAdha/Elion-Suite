import { usePetStore } from '../../stores/petStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import type { PetMoodState } from '../../lib/types'

/**
 * Pixel Duel pet — Griffith (White Knight) vs. Guts (Black Knight), §17.
 * An opt-in cosmetic pet mode: a deterministic 8 s CSS-driven duel loop
 * (standoff → lunge → impact → counter → dragon flyby) over original
 * pixel-art assets in public/pixel/. Mood (shared petStore, §7) drives the
 * intensity; reduced motion renders a single static clash frame.
 *
 * Visuals: theme tokens only for chrome; the art is local bundled assets.
 */
export function DuelPet({
  mood,
  compact = false,
  className = ''
}: {
  mood?: PetMoodState['mood']
  compact?: boolean
  className?: string
}) {
  const storeMood = usePetStore((s) => s.mood)
  const reduced = useThemeStore((s) => s.reducedMotion)
  const m = mood ?? storeMood

  // mood → intensity (v5 §17.2): calm = standoff only, sad = desaturated + rain
  // (happy/focused/full moods get the complete loop incl. the dragon flyby)
  const calm = m === 'idle' || m === 'tired'
  const sad = m === 'worried'

  const stageClass = `duel-stage ${calm ? 'duel-calm' : ''} ${sad ? 'duel-sad' : ''} ${
    reduced ? 'duel-reduced' : ''
  } ${className}`

  return (
    <div
      className={stageClass}
      role="img"
      aria-label={`Pixel duel — the White Knight and the Black Knight (mood: ${m})`}
      style={compact ? { width: '100%', aspectRatio: '16 / 9' } : { width: '100%', aspectRatio: '16 / 9' }}
    >
      <style>{DUEL_CSS}</style>
      <div className="duel-bg" aria-hidden />
      <div className="duel-embers" aria-hidden>
        <i /><i /><i /><i /><i /><i />
      </div>
      <div className="duel-chars">
        <div className="duel-guts">
          <img src="/pixel/guts.png" alt="" draggable={false} />
        </div>
        <div className="duel-slash" aria-hidden />
        <div className="duel-impact" aria-hidden />
        <div className="duel-griffith">
          <img src="/pixel/griffith.png" alt="" draggable={false} />
        </div>
      </div>
      <div className="duel-dragon" aria-hidden>
        <img src="/pixel/dragon.png" alt="" draggable={false} />
      </div>
      <div className="duel-rain" aria-hidden />
      <div className="duel-vignette" aria-hidden />
    </div>
  )
}

// ---------------------------------------------------------------------------
// One shared 8 s clock; every element animates on the same duration so the
// beats stay in sync: standoff 0–25% · lunge 25–40% · impact 40–48% ·
// counter 48–75% · dragon 75–95% · ready 95–100%.
// ---------------------------------------------------------------------------
const DUEL_CSS = `
.duel-stage {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--sunken);
  box-shadow: var(--shadow-raised);
  user-select: none;
}
.duel-bg {
  position: absolute; inset: 0;
  background: url('/pixel/duel-bg.png') center / cover no-repeat;
  image-rendering: pixelated;
}
.duel-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%);
}
.duel-chars { position: absolute; inset: 0; }
.duel-guts, .duel-griffith {
  position: absolute; bottom: 7%;
  height: 62%;
  animation: duel-bob 8s ease-in-out infinite;
  will-change: transform;
}
.duel-guts { left: 6%; animation-name: duel-guts, duel-bob; animation-duration: 8s, 2.6s; }
.duel-griffith { right: 6%; animation-name: duel-griffith, duel-bob; animation-duration: 8s, 3s; }
.duel-guts img, .duel-griffith img, .duel-dragon img {
  height: 100%; width: auto; image-rendering: pixelated;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.45));
}
@keyframes duel-bob {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -2.5%; }
}
/* Guts: lunge right across 25–40%, recover by 48% */
@keyframes duel-guts {
  0%, 24% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(1%) rotate(-4deg); }
  32% { transform: translateX(30%) rotate(10deg); }
  40% { transform: translateX(34%) rotate(14deg); }
  48% { transform: translateX(12%) rotate(2deg); }
  58%, 100% { transform: translateX(0) rotate(0deg); }
}
/* Griffith: hold, then counter 48–62% */
@keyframes duel-griffith {
  0%, 38% { transform: translateX(0) rotate(0deg); filter: none; }
  40% { transform: translateX(0) rotate(3deg); }
  48% { transform: translateX(-6%) rotate(-2deg); }
  55% { transform: translateX(-22%) rotate(-8deg); filter: brightness(1.5) saturate(1.1); }
  62% { transform: translateX(-26%) rotate(-10deg); filter: brightness(1.8); }
  70% { transform: translateX(-8%) rotate(-3deg); filter: brightness(1.2); }
  78%, 100% { transform: translateX(0) rotate(0deg); filter: none; }
}
/* slash arc sweeps during Guts' lunge */
.duel-slash {
  position: absolute; left: 38%; bottom: 18%;
  width: 34%; height: 44%;
  border: 0.45em solid rgba(255,255,255,0.9);
  border-left-color: transparent; border-bottom-color: transparent;
  border-radius: 50%;
  opacity: 0;
  animation: duel-slash 8s linear infinite;
  pointer-events: none;
}
@keyframes duel-slash {
  0%, 24% { opacity: 0; transform: rotate(-70deg) scale(0.5); }
  27% { opacity: 0.9; transform: rotate(-40deg) scale(0.75); }
  33% { opacity: 1; transform: rotate(10deg) scale(1); }
  40% { opacity: 0; transform: rotate(60deg) scale(1.15); }
  100% { opacity: 0; }
}
/* impact burst at the clash point */
.duel-impact {
  position: absolute; left: 47%; bottom: 30%;
  width: 12%; height: 12%;
  opacity: 0;
  background:
    conic-gradient(from 0deg,
      transparent 0 12deg, var(--warn) 12deg 22deg,
      transparent 22deg 42deg, var(--warn) 42deg 52deg,
      transparent 52deg 72deg, var(--warn) 72deg 84deg,
      transparent 84deg 102deg, var(--warn) 102deg 112deg,
      transparent 112deg 132deg, var(--warn) 132deg 144deg,
      transparent 144deg 162deg, var(--warn) 162deg 172deg,
      transparent 172deg 192deg, var(--warn) 192deg 204deg,
      transparent 204deg 222deg, var(--warn) 222deg 232deg,
      transparent 232deg 252deg, var(--warn) 252deg 264deg,
      transparent 264deg 282deg, var(--warn) 282deg 292deg,
      transparent 292deg 312deg, var(--warn) 312deg 324deg,
      transparent 324deg 342deg, var(--warn) 342deg 352deg,
      transparent 352deg);
  -webkit-mask: radial-gradient(circle, #000 30%, transparent 70%);
  mask: radial-gradient(circle, #000 30%, transparent 70%);
  animation: duel-impact 8s linear infinite;
  pointer-events: none;
}
@keyframes duel-impact {
  0%, 39% { opacity: 0; transform: scale(0.4) rotate(0deg); }
  41% { opacity: 1; transform: scale(1) rotate(18deg); }
  46% { opacity: 0.9; transform: scale(1.5) rotate(40deg); }
  48%, 100% { opacity: 0; transform: scale(1.7); }
}
/* stage shake on impact */
.duel-stage { animation: duel-shake 8s linear infinite; }
@keyframes duel-shake {
  0%, 39.5% { translate: 0 0; }
  40% { translate: 1.5% -1%; }
  41% { translate: -1.5% 1%; }
  42% { translate: 1% 0.5%; }
  43% { translate: -0.5% -0.5%; }
  44%, 100% { translate: 0 0; }
}
/* dragon flyby, top of the frame */
.duel-dragon {
  position: absolute; top: 8%; left: 0;
  width: 34%;
  opacity: 0;
  animation: duel-dragon 8s linear infinite;
  pointer-events: none;
}
.duel-dragon img { height: auto; width: 100%; }
@keyframes duel-dragon {
  0%, 74% { opacity: 0; transform: translateX(-40%) translateY(0); }
  76% { opacity: 1; transform: translateX(0) translateY(4%); }
  85% { opacity: 1; transform: translateX(160%) translateY(-3%); }
  94% { opacity: 0; transform: translateX(300%) translateY(2%); }
  100% { opacity: 0; }
}
/* drifting embers */
.duel-embers i {
  position: absolute; bottom: 12%;
  width: 0.4em; height: 0.4em; border-radius: 50%;
  background: var(--warn);
  opacity: 0;
  animation: duel-ember 8s linear infinite;
}
.duel-embers i:nth-child(1) { left: 40%; animation-delay: 0s; }
.duel-embers i:nth-child(2) { left: 52%; animation-delay: 1.1s; }
.duel-embers i:nth-child(3) { left: 60%; animation-delay: 2.3s; }
.duel-embers i:nth-child(4) { left: 46%; animation-delay: 3.4s; }
.duel-embers i:nth-child(5) { left: 55%; animation-delay: 4.6s; }
.duel-embers i:nth-child(6) { left: 43%; animation-delay: 5.8s; }
@keyframes duel-ember {
  0%, 30% { opacity: 0; transform: translate(0, 0); }
  34% { opacity: 0.9; }
  70% { opacity: 0.5; transform: translate(6%, -46%); }
  80%, 100% { opacity: 0; transform: translate(-4%, -60%); }
}
/* mood: calm → standoff only (no combat beats, no dragon) */
.duel-calm .duel-guts { animation: duel-bob 2.6s ease-in-out infinite; }
.duel-calm .duel-griffith { animation: duel-bob 3s ease-in-out infinite; }
.duel-calm .duel-slash, .duel-calm .duel-impact,
.duel-calm .duel-dragon, .duel-calm .duel-embers i { animation: none; opacity: 0; }
.duel-calm { animation: none; }
/* mood: sad → desaturated + rain */
.duel-sad .duel-bg, .duel-sad .duel-guts img, .duel-sad .duel-griffith img {
  filter: saturate(0.45) brightness(0.85);
}
.duel-rain {
  position: absolute; inset: 0; opacity: 0; pointer-events: none;
  background: repeating-linear-gradient(105deg,
    transparent 0 7px, rgba(255,255,255,0.16) 7px 8px);
}
.duel-sad .duel-rain { opacity: 1; animation: duel-rain 0.9s linear infinite; }
@keyframes duel-rain {
  from { background-position: 0 0; }
  to { background-position: -28px 56px; }
}
/* reduced motion → single static clash frame */
.duel-reduced * { animation: none !important; }
.duel-reduced .duel-guts { transform: translateX(26%) rotate(9deg); }
.duel-reduced .duel-griffith { transform: translateX(-16%) rotate(-6deg); filter: brightness(1.3); }
.duel-reduced .duel-slash { opacity: 0.85; transform: rotate(5deg) scale(1); }
.duel-reduced .duel-dragon { opacity: 1; transform: translateX(70%); }
`
