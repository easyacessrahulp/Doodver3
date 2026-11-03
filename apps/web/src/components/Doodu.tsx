// Doodu — DOOD's quokka mascot (2D, animated)
// Usage:  <Doodu pose="hello" size={160} />
// Poses:  "hello" | "focus" | "done" | "water" | "walk" | "briefing"
// No extra packages needed. Animations stop automatically for users who turn on "reduce motion".

import React from "react";

export type DooduPose = "hello" | "focus" | "done" | "water" | "walk" | "briefing";

const FUR = "#A9774A";
const FUR_DARK = "#8F5D34";
const CREAM = "#F3DCBC";
const EAR_IN = "#E7B48A";
const INK = "#2A1A12";
const NOSE = "#3A2418";
const CHEEK = "#F2918A";

const CSS = `
.dd-bob{animation:dd-bob 1.8s ease-in-out infinite}
.dd-wave{transform-box:fill-box;transform-origin:85% 95%;animation:dd-wave 1.2s ease-in-out infinite}
.dd-blink{transform-box:fill-box;transform-origin:center;animation:dd-blink 4s infinite}
.dd-earL{transform-box:fill-box;transform-origin:80% 90%;animation:dd-ear 3s ease-in-out infinite}
.dd-earR{transform-box:fill-box;transform-origin:20% 90%;animation:dd-ear 3s ease-in-out infinite reverse}
.dd-shadow{transform-box:fill-box;transform-origin:center;animation:dd-shadow 1.8s ease-in-out infinite}
.dd-spin{transform-box:view-box;transform-origin:100px 160px;animation:dd-spin 3s linear infinite}
.dd-jump{animation:dd-jump 1s cubic-bezier(.3,0,.4,1) infinite}
.dd-fall{animation:dd-fall 1.6s linear infinite}
.dd-fall2{animation:dd-fall 1.6s linear infinite .5s}
.dd-fall3{animation:dd-fall 1.6s linear infinite 1s}
.dd-sip{transform-box:fill-box;transform-origin:20% 90%;animation:dd-sip 2.4s ease-in-out infinite}
.dd-walk{animation:dd-walkbob .5s ease-in-out infinite}
.dd-stepA{animation:dd-step .5s ease-in-out infinite}
.dd-stepB{animation:dd-step .5s ease-in-out infinite .25s}
.dd-lines{animation:dd-lines .5s linear infinite}
.dd-nod{transform-box:fill-box;transform-origin:50% 100%;animation:dd-nod 2.6s ease-in-out infinite}
@keyframes dd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes dd-shadow{0%,100%{transform:scaleX(1);opacity:.15}50%{transform:scaleX(.85);opacity:.1}}
@keyframes dd-wave{0%,100%{transform:rotate(0)}50%{transform:rotate(-28deg)}}
@keyframes dd-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes dd-ear{0%,80%,100%{transform:rotate(0)}88%{transform:rotate(-8deg)}}
@keyframes dd-spin{to{transform:rotate(360deg)}}
@keyframes dd-jump{0%,100%{transform:translateY(0)}45%{transform:translateY(-22px)}}
@keyframes dd-fall{0%{transform:translateY(-20px);opacity:0}15%{opacity:1}100%{transform:translateY(120px);opacity:0}}
@keyframes dd-sip{0%,30%,100%{transform:rotate(0)}55%,75%{transform:rotate(-35deg)}}
@keyframes dd-walkbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes dd-step{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes dd-lines{0%{transform:translateX(0);opacity:1}100%{transform:translateX(-14px);opacity:0}}
@keyframes dd-nod{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg)}}
@media (prefers-reduced-motion:reduce){
  .dd-bob,.dd-wave,.dd-blink,.dd-earL,.dd-earR,.dd-shadow,.dd-spin,.dd-jump,.dd-fall,.dd-fall2,.dd-fall3,
  .dd-sip,.dd-walk,.dd-stepA,.dd-stepB,.dd-lines,.dd-nod{animation:none}
}
`;

let cssInjected = false;
function useDooduCss() {
  React.useEffect(() => {
    if (cssInjected || typeof document === "undefined") return;
    const el = document.createElement("style");
    el.setAttribute("data-doodu", "");
    el.textContent = CSS;
    document.head.appendChild(el);
    cssInjected = true;
  }, []);
}

/* Shared pieces (viewBox 0 0 200 220) */
const Ears = ({ y = 44, dx = 0 }: { y?: number; dx?: number }) => (
  <>
    <g className="dd-earL">
      <circle cx={58 + dx} cy={y} r={25} fill={FUR_DARK} />
      <circle cx={58 + dx} cy={y} r={13} fill={EAR_IN} />
    </g>
    <g className="dd-earR">
      <circle cx={142 + dx} cy={y} r={25} fill={FUR_DARK} />
      <circle cx={142 + dx} cy={y} r={13} fill={EAR_IN} />
    </g>
  </>
);

const Feet = ({ y = 207, color = FUR_DARK }: { y?: number; color?: string }) => (
  <>
    <ellipse cx={76} cy={y} rx={18} ry={8} fill={color} />
    <ellipse cx={124} cy={y} rx={18} ry={8} fill={color} />
  </>
);

const Cheeks = ({ y = 102 }: { y?: number }) => (
  <>
    <ellipse cx={66} cy={y} rx={9} ry={6} fill={CHEEK} opacity={0.75} />
    <ellipse cx={134} cy={y} rx={9} ry={6} fill={CHEEK} opacity={0.75} />
  </>
);

const OpenEyes = ({ y = 82 }: { y?: number }) => (
  <g className="dd-blink">
    <circle cx={78} cy={y} r={7} fill={INK} />
    <circle cx={80.5} cy={y - 2.5} r={2.4} fill="#fff" />
    <circle cx={122} cy={y} r={7} fill={INK} />
    <circle cx={124.5} cy={y - 2.5} r={2.4} fill="#fff" />
  </g>
);

const Smile = ({ y = 108 }: { y?: number }) => (
  <path d={`M89 ${y} Q100 ${y + 12} 111 ${y}`} fill="none" stroke={NOSE} strokeWidth={3} strokeLinecap="round" />
);

/* Poses */
const Hello = () => (
  <svg viewBox="0 0 220 240" width="100%" height="100%">
    <ellipse className="dd-shadow" cx={110} cy={232} rx={70} ry={7} fill="#000" opacity={0.15} />
    <g className="dd-bob">
      <g className="dd-earL"><circle cx={62} cy={48} r={28} fill={FUR_DARK} /><circle cx={62} cy={48} r={15} fill={EAR_IN} /></g>
      <g className="dd-earR"><circle cx={158} cy={48} r={28} fill={FUR_DARK} /><circle cx={158} cy={48} r={15} fill={EAR_IN} /></g>
      <ellipse cx={110} cy={168} rx={64} ry={58} fill={FUR} />
      <ellipse cx={110} cy={180} rx={40} ry={40} fill={CREAM} />
      <ellipse cx={170} cy={168} rx={13} ry={24} fill={FUR} transform="rotate(-18 170 168)" />
      <g className="dd-wave">
        <ellipse cx={44} cy={112} rx={13} ry={28} fill={FUR} transform="rotate(28 44 112)" />
        <circle cx={34} cy={88} r={12} fill={FUR_DARK} />
      </g>
      <ellipse cx={82} cy={224} rx={20} ry={9} fill={FUR_DARK} />
      <ellipse cx={138} cy={224} rx={20} ry={9} fill={FUR_DARK} />
      <ellipse cx={110} cy={94} rx={64} ry={56} fill={FUR} />
      <ellipse cx={110} cy={116} rx={33} ry={25} fill={CREAM} />
      <g className="dd-blink">
        <circle cx={86} cy={88} r={8} fill={INK} /><circle cx={89} cy={85} r={2.8} fill="#fff" />
        <circle cx={134} cy={88} r={8} fill={INK} /><circle cx={137} cy={85} r={2.8} fill="#fff" />
      </g>
      <ellipse cx={72} cy={112} rx={10} ry={6.5} fill={CHEEK} opacity={0.75} />
      <ellipse cx={148} cy={112} rx={10} ry={6.5} fill={CHEEK} opacity={0.75} />
      <ellipse cx={110} cy={107} rx={8} ry={5.5} fill={NOSE} />
      <path d="M94 117 Q110 136 126 117" fill="#7A2E24" stroke={NOSE} strokeWidth={3} strokeLinecap="round" />
      <path d="M102 126 Q110 131 118 126" fill="none" stroke={CHEEK} strokeWidth={3} strokeLinecap="round" />
    </g>
  </svg>
);

const Focus = () => (
  <svg viewBox="0 0 200 220" width="100%" height="100%">
    <Ears />
    <ellipse cx={100} cy={158} rx={58} ry={52} fill={FUR} />
    <Feet />
    <g className="dd-nod">
      <ellipse cx={100} cy={86} rx={58} ry={51} fill={FUR} />
      <path d="M44 70 Q100 52 156 70 L156 80 Q100 62 44 80 Z" fill="#F26B4F" />
      <ellipse cx={100} cy={106} rx={30} ry={22} fill={CREAM} />
      <path d="M71 86 Q79 81 87 86 M113 86 Q121 81 129 86" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <ellipse cx={100} cy={98} rx={7} ry={5} fill={NOSE} />
      <path d="M90 108 Q100 116 110 108" fill="none" stroke={NOSE} strokeWidth={3} strokeLinecap="round" />
    </g>
    <circle cx={100} cy={160} r={24} fill="#E8463A" />
    <circle cx={100} cy={160} r={17} fill="#fff" />
    <g className="dd-spin"><path d="M100 160 L100 147" stroke={INK} strokeWidth={3} strokeLinecap="round" /></g>
    <circle cx={100} cy={160} r={2.5} fill={INK} />
    <path d="M96 136 Q100 128 104 136" fill="#3F9E5B" />
    <ellipse cx={70} cy={162} rx={11} ry={16} fill={FUR} />
    <ellipse cx={130} cy={162} rx={11} ry={16} fill={FUR} />
  </svg>
);

const Done = () => (
  <svg viewBox="0 0 200 220" width="100%" height="100%">
    <circle className="dd-fall" cx={30} cy={10} r={5} fill="#F26B4F" />
    <rect className="dd-fall2" x={160} y={5} width={10} height={10} fill="#0E7C7B" />
    <circle className="dd-fall3" cx={176} cy={15} r={5} fill="#5B8DEF" />
    <rect className="dd-fall2" x={20} y={10} width={9} height={9} fill="#7A5AD6" />
    <circle className="dd-fall3" cx={100} cy={0} r={4} fill="#FFC845" />
    <g className="dd-jump">
      <Ears y={50} />
      <ellipse cx={48} cy={118} rx={11} ry={26} fill={FUR} transform="rotate(30 48 118)" />
      <ellipse cx={152} cy={118} rx={11} ry={26} fill={FUR} transform="rotate(-30 152 118)" />
      <ellipse cx={100} cy={162} rx={58} ry={50} fill={FUR} />
      <ellipse cx={100} cy={172} rx={36} ry={34} fill={CREAM} />
      <Feet y={208} />
      <ellipse cx={100} cy={92} rx={58} ry={51} fill={FUR} />
      <ellipse cx={100} cy={112} rx={30} ry={22} fill={CREAM} />
      <path d="M70 90 Q79 80 88 90 M112 90 Q121 80 130 90" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <Cheeks y={106} />
      <ellipse cx={100} cy={103} rx={7} ry={5} fill={NOSE} />
      <path d="M86 112 Q100 134 114 112 Z" fill="#7A2E24" stroke={NOSE} strokeWidth={3} strokeLinejoin="round" />
    </g>
  </svg>
);

const Water = () => (
  <svg viewBox="0 0 200 220" width="100%" height="100%">
    <Ears />
    <ellipse cx={100} cy={158} rx={58} ry={52} fill={FUR} />
    <ellipse cx={100} cy={168} rx={36} ry={36} fill={CREAM} />
    <Feet />
    <ellipse cx={100} cy={86} rx={58} ry={51} fill={FUR} />
    <ellipse cx={100} cy={106} rx={30} ry={22} fill={CREAM} />
    <OpenEyes />
    <Cheeks />
    <ellipse cx={100} cy={98} rx={7} ry={5} fill={NOSE} />
    <Smile />
    <g className="dd-sip">
      <path d="M118 128 L152 128 L147 182 L123 182 Z" fill="#E9F6FB" stroke="#4A90B8" strokeWidth={3} strokeLinejoin="round" />
      <path d="M121 146 L149 146 L147 180 L123 180 Z" fill="#7CC4E4" />
      <ellipse cx={116} cy={160} rx={11} ry={16} fill={FUR} />
    </g>
    <ellipse cx={68} cy={160} rx={11} ry={18} fill={FUR} transform="rotate(12 68 160)" />
  </svg>
);

const Walk = () => (
  <svg viewBox="0 0 200 220" width="100%" height="100%">
    <g className="dd-lines">
      <path d="M14 120 L36 120 M8 140 L32 140 M16 160 L36 160" stroke="#3F9E5B" strokeWidth={4} strokeLinecap="round" />
    </g>
    <ellipse className="dd-stepA" cx={70} cy={204} rx={18} ry={8} fill="#F26B4F" />
    <ellipse className="dd-stepB" cx={136} cy={204} rx={18} ry={8} fill="#F26B4F" />
    <g className="dd-walk">
      <Ears dx={4} />
      <ellipse cx={104} cy={154} rx={56} ry={48} fill={FUR} />
      <ellipse cx={104} cy={164} rx={34} ry={32} fill={CREAM} />
      <ellipse cx={156} cy={146} rx={11} ry={20} fill={FUR} transform="rotate(-40 156 146)" />
      <ellipse cx={52} cy={158} rx={11} ry={20} fill={FUR} transform="rotate(40 52 158)" />
      <ellipse cx={104} cy={86} rx={58} ry={51} fill={FUR} />
      <rect x={48} y={64} width={112} height={11} rx={5} fill="#0E7C7B" />
      <ellipse cx={104} cy={106} rx={30} ry={22} fill={CREAM} />
      <g className="dd-blink">
        <circle cx={82} cy={86} r={7} fill={INK} />
        <circle cx={126} cy={86} r={7} fill={INK} />
      </g>
      <ellipse cx={104} cy={99} rx={7} ry={5} fill={NOSE} />
      <path d="M92 109 Q104 122 116 109" fill="none" stroke={NOSE} strokeWidth={3} strokeLinecap="round" />
    </g>
  </svg>
);

const Briefing = () => (
  <svg viewBox="0 0 200 220" width="100%" height="100%">
    <g className="dd-bob">
      <Ears />
      <ellipse cx={100} cy={158} rx={58} ry={52} fill={FUR} />
      <Feet />
      <ellipse cx={100} cy={86} rx={58} ry={51} fill={FUR} />
      <ellipse cx={100} cy={106} rx={30} ry={22} fill={CREAM} />
      <g className="dd-blink">
        <circle cx={78} cy={82} r={6} fill={INK} />
        <circle cx={122} cy={82} r={6} fill={INK} />
      </g>
      <circle cx={78} cy={82} r={15} fill="none" stroke={INK} strokeWidth={3} />
      <circle cx={122} cy={82} r={15} fill="none" stroke={INK} strokeWidth={3} />
      <path d="M93 82 Q100 76 107 82" fill="none" stroke={INK} strokeWidth={3} />
      <ellipse cx={100} cy={98} rx={7} ry={5} fill={NOSE} />
      <path d="M90 108 Q100 117 110 108" fill="none" stroke={NOSE} strokeWidth={3} strokeLinecap="round" />
      <rect x={68} y={128} width={64} height={72} rx={6} fill="#7A5AD6" />
      <rect x={75} y={138} width={50} height={56} rx={3} fill="#fff" />
      <rect x={88} y={124} width={24} height={10} rx={3} fill="#C9C1E8" />
      <path d="M82 150 L118 150 M82 162 L114 162 M82 174 L106 174 M82 186 L116 186" stroke="#B5ACD9" strokeWidth={3} strokeLinecap="round" />
      <ellipse cx={64} cy={168} rx={11} ry={16} fill={FUR} />
      <ellipse cx={136} cy={168} rx={11} ry={16} fill={FUR} />
    </g>
  </svg>
);

const POSES: Record<DooduPose, { el: () => React.ReactElement; label: string }> = {
  hello: { el: Hello, label: "Doodu the quokka waving hello" },
  focus: { el: Focus, label: "Doodu focusing with a timer" },
  done: { el: Done, label: "Doodu jumping for joy" },
  water: { el: Water, label: "Doodu sipping water" },
  walk: { el: Walk, label: "Doodu walking" },
  briefing: { el: Briefing, label: "Doodu with a clipboard" },
};

export const DOODU_LINES: Record<DooduPose, string> = {
  hello: "Hi! Ready for today?",
  focus: "25 minutes. One thing at a time.",
  done: "Done! That’s a big smile.",
  water: "Sip of water? I’ll wait.",
  walk: "10-minute walk. Let’s go!",
  briefing: "Here’s where things stand.",
};

export default function Doodu({
  pose = "hello",
  size = 160,
  className,
  style,
}: {
  pose?: DooduPose;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  useDooduCss();
  const P = POSES[pose] ?? POSES.hello;
  const Pose = P.el;
  return (
    <div
      role="img"
      aria-label={P.label}
      className={className}
      style={{ width: size, height: size * 1.1, display: "inline-block", ...style }}
    >
      <Pose />
    </div>
  );
}
