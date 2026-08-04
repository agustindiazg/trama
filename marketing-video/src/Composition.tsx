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
        <div style={{fontFamily: "monospace", fontSize: 24, letterSpacing: 3.5, fontWeight: 700}}>MEJORA TU CV PARA CADA OFERTA</div>
      </Rise>
      <Rise delay={14}>
        <h1 style={{margin: "34px 0 0", maxWidth: 970, fontSize: 104, lineHeight: 0.94, letterSpacing: -7, fontWeight: 650}}>
          {headline}
        </h1>
      </Rise>
      <Rise delay={20}>
        <div style={{marginTop: 48, fontSize: 28, lineHeight: 1.4, maxWidth: 880, color: palette.muted}}>
          Carga tu CV, especifica qué oferta te interesa, y Trama te ayuda a optimizar tu candidatura analizando keyword matching y mejorando la redacción.
        </div>
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
      <div style={{fontFamily: "monospace", fontSize: 24, letterSpacing: 3, fontWeight: 700}}>REDACCIÓN MEJORADA</div>
      <div style={{marginTop: 72, display: "grid", gap: 26}}>
        <Rise delay={3}>
          <div style={{padding: "42px 44px", border: `2px solid ${palette.line}`, color: palette.muted, background: "rgba(255,255,255,.35)"}}>
            <div style={{fontFamily: "monospace", fontSize: 20, marginBottom: 22}}>LO QUE ESCRIBISTE</div>
            <div style={{fontSize: 42, lineHeight: 1.3, textDecoration: "line-through", textDecorationThickness: 2}}>{beforeText}</div>
          </div>
        </Rise>
        <div style={{opacity: reveal, transform: `translateY(${(1 - reveal) * 30}px)`, padding: "42px 44px", border: `2px solid ${palette.ink}`, background: palette.acid, boxShadow: "14px 14px 0 rgba(23,35,29,.12)"}}>
          <div style={{fontFamily: "monospace", fontSize: 20, marginBottom: 22}}>LO QUE TRAMA SUGIERE</div>
          <div style={{fontSize: 42, lineHeight: 1.3, fontWeight: 700}}>{afterText}</div>
        </div>
      </div>
      <div style={{position: "absolute", left: 88, bottom: 76, fontSize: 26, color: palette.muted}}>Mismo contenido, mejor presentación. Más impacto, menos palabras.</div>
    </SafeFrame>
  );
};

const Match = ({role}: TramaLaunchProps) => {
  const frame = useCurrentFrame();
  const keywords = [
    {term: "Product discovery", status: "explicit", evidence: "Incluido en tus habilidades y resumen."},
    {term: "Design systems", status: "explicit", evidence: "Incluido en tus habilidades."},
    {term: "Investigación de usuarios", status: "explicit", evidence: "Demostrado en tu experiencia."},
  ];
  return (
    <SafeFrame dark>
      <Brand brand="trama" inverted />
      <Rise delay={5}>
        <div style={{marginTop: 100, color: palette.acid, fontFamily: "monospace", fontSize: 24, letterSpacing: 3}}>ANÁLISIS DE OFERTA</div>
        <h2 style={{margin: "24px 0 0", fontSize: 86, lineHeight: 1, letterSpacing: -5}}>{role}</h2>
      </Rise>
      <div style={{marginTop: 72}}>
        {keywords.map((kw, index) => {
          const p = spring({frame: frame - 28 - index * 10, fps: 30, config: {damping: 18}});
          const isExplicit = kw.status === "explicit";
          return (
            <div key={kw.term} style={{marginBottom: 20, padding: "20px 32px", border: `2px solid ${isExplicit ? palette.acid : '#526057'}`, background: isExplicit ? 'rgba(215, 255, 82, 0.08)' : 'rgba(255,255,255,.02)', opacity: p, transform: `translateX(${(1-p)*40}px)`}}>
              <div style={{display: "flex", alignItems: "center", gap: 16, marginBottom: 12}}>
                <div style={{width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: "50%", color: palette.ink, background: isExplicit ? palette.acid : '#526057', fontSize: 22, fontWeight: 900}}>
                  {isExplicit ? '✓' : '?'}
                </div>
                <span style={{fontSize: 28, fontWeight: 700}}>{kw.term}</span>
              </div>
              <div style={{fontSize: 20, color: '#aeb6b1', marginLeft: 52}}>{kw.evidence}</div>
            </div>
          );
        })}
      </div>
      <div style={{position: "absolute", left: 88, bottom: 76, fontSize: 27, color: "#aeb6b1"}}>Trama analiza qué habilidades ya documentás y en qué deberías enfocarte.</div>
    </SafeFrame>
  );
};

const FlowSteps = () => {
  const steps = ["Subir CV", "Enfoque", "Oferta", "Análisis", "Feedback", "Iteración", "Descargar"];
  return (
    <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12}}>
      {steps.map((step, index) => (
        <div key={step} style={{textAlign: "center"}}>
          <div style={{width: 52, height: 52, borderRadius: "50%", background: "rgba(215, 255, 82, 0.12)", border: `2px solid ${palette.acid}`, display: "grid", placeItems: "center", margin: "0 auto 12px", fontSize: 22, fontWeight: 700}}>{index + 1}</div>
          <div style={{fontSize: 14, lineHeight: 1.3, color: palette.muted}}>{step}</div>
        </div>
      ))}
    </div>
  );
};

const Outro = ({brand, callToAction}: TramaLaunchProps) => (
  <SafeFrame dark>
    <div style={{display: "grid", placeItems: "center", height: "100%", textAlign: "center", gap: 40}}>
      <div>
        <Rise><Brand brand={brand} inverted /></Rise>
        <Rise delay={8}>
          <h2 style={{margin: "50px auto 0", maxWidth: 950, fontSize: 84, lineHeight: .98, letterSpacing: -6}}>Todo lo que necesitas en 7 pasos.</h2>
          <div style={{marginTop: 18, fontFamily: "Georgia, serif", color: palette.acid, fontStyle: "italic", fontSize: 72}}>Desde tu CV hasta tu siguiente entrevista.</div>
        </Rise>
      </div>
      <Rise delay={14}>
        <div style={{width: "100%", maxWidth: 920}}>
          <FlowSteps />
        </div>
      </Rise>
      <Rise delay={20}>
        <div style={{width: "fit-content", margin: "0 auto", padding: "26px 40px", color: palette.ink, background: palette.acid, fontSize: 32, fontWeight: 800}}>{callToAction} →</div>
      </Rise>
    </div>
  </SafeFrame>
);

export const TramaLaunch: React.FC<TramaLaunchProps> = (props) => (
  <AbsoluteFill>
    <Sequence durationInFrames={135}><Intro {...props} /></Sequence>
    <Sequence from={135} durationInFrames={135}><Rewrite {...props} /></Sequence>
    <Sequence from={270} durationInFrames={135}><Match {...props} /></Sequence>
    <Sequence from={405} durationInFrames={120}><Outro {...props} /></Sequence>
  </AbsoluteFill>
);

export const MyComposition = () => (
  <Composition
    id="TramaLaunchSquare"
    component={TramaLaunch}
    durationInFrames={525}
    fps={30}
    width={1200}
    height={1200}
    defaultProps={{
      brand: "trama",
      headline: "Un CV que se adapta a cada oportunidad.",
      beforeText: "Trabajé en mejoras del proceso de compra.",
      afterText: "Diseñé e implementé mejoras del proceso de compra, reduciendo fricción y aumentando la conversión en 23%.",
      role: "Product Designer",
      callToAction: "Empezá con tu CV",
    }}
  />
);
