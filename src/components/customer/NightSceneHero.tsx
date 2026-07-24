"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Float } from "@/components/shared/motion";

/**
 * Cinematic Yaoundé-night hero built entirely in code:
 * aurora glow, twinkling stars, a glowing crescent moon, a parallax city
 * skyline with lit windows, and a rider gliding across on a neon light-trail.
 *
 * A drop-in character layer renders /hero-character.png if that file exists —
 * upload African-anime character art there for an instant upgrade
 * (prompts in docs/HERO-ART-PROMPTS.md).
 */
export function NightSceneHero() {
  const reduce = useReducedMotion();
  const [hasCharacter, setHasCharacter] = useState(false);

  // Probe for optional character art without a broken-image flash.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setHasCharacter(true);
    img.src = "/hero-character.png";
  }, []);

  const stars = Array.from({ length: 26 }, (_, i) => ({
    cx: (i * 53) % 100,
    cy: (i * 37) % 60,
    r: (i % 3) * 0.4 + 0.4,
    d: 2 + (i % 4),
  }));

  return (
    <div className="relative h-[46vh] min-h-[320px] w-full overflow-hidden rounded-b-[2rem]">
      {/* Aurora / gradient sky */}
      <div className="absolute inset-0 bg-gradient-to-b from-violet-950/70 via-ink-950 to-ink-950" />
      <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-[80px]" />
      <div className="absolute -right-16 top-4 h-52 w-52 rounded-full bg-gold-400/15 blur-[70px]" />

      <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {/* Stars */}
        {stars.map((s, i) => (
          <motion.circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill="#f1d97a"
            initial={{ opacity: 0.2 }}
            animate={reduce ? undefined : { opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: s.d, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
          />
        ))}

        {/* Crescent moon */}
        <g>
          <circle cx="78" cy="14" r="7" fill="#f1d97a" opacity="0.95" />
          <circle cx="75" cy="12" r="6.4" fill="#0a0710" />
        </g>
        <circle cx="78" cy="14" r="11" fill="url(#moonGlow)" opacity="0.5" />

        {/* Skyline silhouette (parallax) */}
        <motion.g
          animate={reduce ? undefined : { x: [0, -2, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        >
          <path
            d="M0 60 L0 44 L6 44 L6 38 L12 38 L12 46 L18 46 L18 34 L24 34 L24 42 L30 42 L30 30 L38 30 L38 44 L46 44 L46 36 L52 36 L52 46 L60 46 L60 32 L68 32 L68 44 L76 44 L76 40 L84 40 L84 46 L92 46 L92 38 L100 38 L100 60 Z"
            fill="url(#cityGrad)"
          />
          {/* lit windows */}
          {[
            [8, 42], [20, 40], [26, 38], [33, 36], [40, 40], [49, 42], [55, 40], [63, 38], [70, 40], [78, 43], [88, 42], [94, 44],
          ].map(([x, y], i) => (
            <motion.rect
              key={i}
              x={x}
              y={y}
              width="1.1"
              height="1.1"
              fill="#e4c765"
              initial={{ opacity: 0.3 }}
              animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.35 }}
            />
          ))}
        </motion.g>

        {/* Rider gliding across on a neon trail */}
        {!reduce && (
          <motion.g
            initial={{ x: -20 }}
            animate={{ x: 120 }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }}
          >
            <rect x="-16" y="52.2" width="16" height="0.5" rx="0.25" fill="url(#trailGrad)" />
            {/* simple motorbike + rider silhouette */}
            <g fill="#c6a6ef">
              <circle cx="0" cy="53" r="1.1" />
              <circle cx="4" cy="53" r="1.1" />
              <path d="M0 53 L2 51 L4 53" stroke="#c6a6ef" strokeWidth="0.5" fill="none" />
              <path d="M1.6 51 q0.6 -2 1.8 -2.2 l0.6 0.4 q-1 0.6 -0.8 1.8 Z" fill="#9645de" />
            </g>
            <circle cx="4.4" cy="53" r="1.6" fill="url(#headlight)" opacity="0.8" />
          </motion.g>
        )}

        <defs>
          <radialGradient id="moonGlow">
            <stop offset="0%" stopColor="#f1d97a" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#f1d97a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3c1361" />
            <stop offset="100%" stopColor="#130d1f" />
          </linearGradient>
          <linearGradient id="trailGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7b2cbf" stopOpacity="0" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="headlight">
            <stop offset="0%" stopColor="#f1d97a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f1d97a" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      {/* Optional African-anime character art (drop-in) */}
      {hasCharacter && (
        <Float className="pointer-events-none absolute bottom-0 right-2 h-[88%] max-w-[55%]" amount={8} duration={7}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero-character.png" alt="" className="h-full w-auto object-contain drop-shadow-[0_10px_40px_rgba(123,44,191,0.5)]" />
        </Float>
      )}

      {/* Bottom fade into page */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950 to-transparent" />
    </div>
  );
}
