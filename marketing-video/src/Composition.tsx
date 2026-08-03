import React from "react";
import {
  AbsoluteFill,
  Composition,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type TramaLaunchProps = {
  brand: string;
  headline: string;
  beforeText: string;
  afterText: string;
  role: string;
  callToAction: string;
};

const palette = {
  ink: "#17231d",
  paper: "#f3efe7",
  acid: "#d7ff52",
  muted: "#667269",
  line: "rgba(23,35,29,.22)",
};

const Grain = () => (
  <AbsoluteFill
    style={{
      opacity: 0.025,
      backgroundColor: palette.ink,
      pointerEvents: "none",
    }}
  />
);

const Brand = ({brand, inverted = false}: {brand: string; inverted?: boolean}) => (
  <div style={{display: "flex", alignItems: "center", gap: 16, color: inverted ? palette.paper : palette.ink}}>
    <div
      style={{
        width: 58,
        height: 58,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        color: inverted ? palette.ink : palette.paper,
        background: inverted ? palette.acid : palette.ink,
        fontFamily: "Georgia, serif",
        fontSize: 34,
        fontStyle: "italic",
        fontWeight: 700,
      }}
    >T</div>
    <strong style={{fontSize: 34, letterSpacing: -1.8}}>{brand}</strong>
  </div>
);

const SafeFrame = ({children, dark = false}: {children: React.ReactNode; dark?: boolean}) => (
  <AbsoluteFill
    style={{
      padding: "92px 88px",
      color: dark ? palette.paper : palette.ink,
      background: dark ? palette.ink : palette.paper,
      fontFamily: "Arial, Helvetica, sans-serif",
      overflow: "hidden",
    }}
  >
    {children}
    <Grain />
  </AbsoluteFill>
);

const Rise = ({children, delay = 0}: {children: React.ReactNode; delay?: number}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame: frame - delay, fps, config: {damping: 18, stiffness: 110}});
  return (
    <div style={{opacity: progress, transform: `translateY(${interpolate(progress, [0, 1], [55, 0])}px)`}}>
      {children}
    </div>
  );
};

const Intro = ({brand, headline}: TramaLaunchProps) => (
  <SafeFrame>
    <Brand brand={brand} />
    <div style={{marginTop: 142}}>
      <Rise delay={8}>
        <div style={{fontFamily: "monospace", fontSize: 24, letterSpacing: 3.5, fontWeight: 700}}>TU CV + ESA OPORTUNIDAD</div>
      </Rise>
      <Rise delay={14}>
        <h1 style={{margin: "34px 0 0", maxWidth: 970, fontSize: 104, lineHeight: 0.94, letterSpacing: -7, fontWeight: 650}}>
          {headline}
        </h1>
      </Rise>
    </div>
    <div style={{position: "absolute", width: 580, height: 580, right: -430, bottom: -190, border: `2px solid ${palette.line}`, borderRadius: "50%"}} />
  </SafeFrame>
);

const Rewrite = ({beforeText, afterText}: TramaLaunchProps) => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [45, 78], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return (
    <SafeFrame>
      <div style={{fontFamily: "monospace", fontSize: 24, letterSpacing: 3, fontWeight: 700}}>ANTES / DESPUÉS</div>
      <div style={{marginTop: 72, display: "grid", gap: 26}}>
        <Rise delay={3}>
          <div style={{padding: "42px 44px", border: `2px solid ${palette.line}`, color: palette.muted, background: "rgba(255,255,255,.35)"}}>
            <div style={{fontFamily: "monospace", fontSize: 20, marginBottom: 22}}>ANTES</div>
            <div style={{fontSize: 44, lineHeight: 1.3, textDecoration: "line-through", textDecorationThickness: 2}}>{beforeText}</div>
          </div>
        </Rise>
        <div style={{opacity: reveal, transform: `translateY(${(1 - reveal) * 30}px)`, padding: "42px 44px", border: `2px solid ${palette.ink}`, background: palette.acid, boxShadow: "14px 14px 0 rgba(23,35,29,.12)"}}>
          <div style={{fontFamily: "monospace", fontSize: 20, marginBottom: 22}}>DESPUÉS</div>
          <div style={{fontSize: 44, lineHeight: 1.27, fontWeight: 700}}>{afterText}</div>
        </div>
      </div>
      <div style={{position: "absolute", left: 88, bottom: 76, fontSize: 26, color: palette.muted}}>Mejor redacción. Los mismos hechos.</div>
    </SafeFrame>
  );
};

const Match = ({role}: TramaLaunchProps) => {
  const frame = useCurrentFrame();
  const checks = ["Experiencia relevante", "Lenguaje de la oferta", "Evidencia en tu CV"];
  return (
    <SafeFrame dark>
      <Brand brand="trama" inverted />
      <Rise delay={5}>
        <div style={{marginTop: 100, color: palette.acid, fontFamily: "monospace", fontSize: 24, letterSpacing: 3}}>OFERTA DETECTADA</div>
        <h2 style={{margin: "24px 0 0", fontSize: 86, lineHeight: 1, letterSpacing: -5}}>{role}</h2>
      </Rise>
      <div style={{marginTop: 72, border: "2px solid #526057"}}>
        {checks.map((label, index) => {
          const p = spring({frame: frame - 28 - index * 10, fps: 30, config: {damping: 18}});
          return (
            <div key={label} style={{height: 112, padding: "0 32px", display: "flex", alignItems: "center", gap: 24, borderTop: index ? "2px solid #526057" : undefined, opacity: p, transform: `translateX(${(1-p)*40}px)`}}>
              <div style={{width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "50%", color: palette.ink, background: palette.acid, fontSize: 25, fontWeight: 900}}>✓</div>
              <span style={{fontSize: 34}}>{label}</span>
            </div>
          );
        })}
      </div>
      <div style={{position: "absolute", left: 88, bottom: 76, fontSize: 27, color: "#aeb6b1"}}>Trama te muestra qué respaldás y qué falta reforzar.</div>
    </SafeFrame>
  );
};

const Outro = ({brand, callToAction}: TramaLaunchProps) => (
  <SafeFrame dark>
    <div style={{display: "grid", placeItems: "center", height: "100%", textAlign: "center"}}>
      <div>
        <Rise><Brand brand={brand} inverted /></Rise>
        <Rise delay={8}>
          <h2 style={{margin: "70px auto 0", maxWidth: 950, fontSize: 94, lineHeight: .98, letterSpacing: -6}}>Tu experiencia ya está.</h2>
          <div style={{marginTop: 22, fontFamily: "Georgia, serif", color: palette.acid, fontStyle: "italic", fontSize: 92}}>Hagamos que se entienda.</div>
        </Rise>
        <Rise delay={18}>
          <div style={{width: "fit-content", margin: "74px auto 0", padding: "26px 40px", color: palette.ink, background: palette.acid, fontSize: 32, fontWeight: 800}}>{callToAction} →</div>
        </Rise>
      </div>
    </div>
  </SafeFrame>
);

export const TramaLaunch: React.FC<TramaLaunchProps> = (props) => (
  <AbsoluteFill>
    <Sequence durationInFrames={105}><Intro {...props} /></Sequence>
    <Sequence from={105} durationInFrames={120}><Rewrite {...props} /></Sequence>
    <Sequence from={225} durationInFrames={120}><Match {...props} /></Sequence>
    <Sequence from={345} durationInFrames={105}><Outro {...props} /></Sequence>
  </AbsoluteFill>
);

export const MyComposition = () => (
  <Composition
    id="TramaLaunchSquare"
    component={TramaLaunch}
    durationInFrames={450}
    fps={30}
    width={1200}
    height={1200}
    defaultProps={{
      brand: "trama",
      headline: "Un CV que conecta tu experiencia con el puesto.",
      beforeText: "Trabajé en mejoras del proceso de compra.",
      afterText: "Lideré mejoras del proceso de compra para reducir fricción y facilitar la conversión.",
      role: "Product Designer",
      callToAction: "Adaptá tu CV con Trama",
    }}
  />
);
