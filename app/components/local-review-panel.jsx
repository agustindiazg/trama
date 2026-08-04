"use client";

import { useEffect, useState } from "react";
import { Braces, ChevronDown, Play, RotateCcw, Save, Wrench, X } from "lucide-react";
import { DEFAULT_LOCAL_REVIEW_SCENARIO, LOCAL_REVIEW_STORAGE_KEY, loadLocalReviewSettings, validateLocalReviewScenario } from "../lib/local-review";

export default function LocalReviewPanel({ onStart }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const settings = loadLocalReviewSettings(window.localStorage);
    setEnabled(settings.enabled);
    setDraft(JSON.stringify(settings.scenario, null, 2));
  }, []);

  const parseDraft = () => {
    try {
      const scenario = JSON.parse(draft);
      const error = validateLocalReviewScenario(scenario);
      if (error) throw new Error(error);
      return scenario;
    } catch (error) {
      setMessage(error instanceof SyntaxError ? `JSON inválido: ${error.message}` : error.message);
      return null;
    }
  };

  const persist = (nextEnabled = enabled) => {
    const scenario = parseDraft();
    if (!scenario) return null;
    window.localStorage.setItem(LOCAL_REVIEW_STORAGE_KEY, JSON.stringify({ enabled: nextEnabled, scenario }));
    setEnabled(nextEnabled);
    setMessage("Escenario guardado en este navegador.");
    return scenario;
  };

  const reset = () => {
    const nextDraft = JSON.stringify(DEFAULT_LOCAL_REVIEW_SCENARIO, null, 2);
    setDraft(nextDraft);
    window.localStorage.setItem(LOCAL_REVIEW_STORAGE_KEY, JSON.stringify({ enabled, scenario: DEFAULT_LOCAL_REVIEW_SCENARIO }));
    setMessage("Escenario de ejemplo restaurado.");
  };

  return <aside className={`local-review ${open ? "is-open" : ""}`} aria-label="Banco de pruebas local">
    <button type="button" className="local-review-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <Wrench size={15} /><span>LOCAL REVIEW</span><i className={enabled ? "is-on" : ""} />
    </button>
    {open ? <div className="local-review-panel">
      <header><div><small>SOLO EN NEXT DEV</small><strong>Banco de pruebas</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={17} /></button></header>
      <label className="local-review-switch"><span><b>Interceptar llamadas a Claude</b><small>Usa este escenario para todo el recorrido.</small></span><input type="checkbox" checked={enabled} onChange={(event) => { const next = event.target.checked; if (persist(next)) setMessage(next ? "Modo local activo." : "Modo local desactivado."); }} /></label>
      <details open><summary><span><Braces size={14} /> Escenario JSON</span><ChevronDown size={14} /></summary><textarea spellCheck="false" value={draft} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} aria-label="Escenario local en JSON" /></details>
      {message ? <p className="local-review-message" role="status">{message}</p> : null}
      <div className="local-review-actions"><button type="button" onClick={reset}><RotateCcw size={14} /> Restaurar</button><button type="button" onClick={() => persist()}><Save size={14} /> Guardar</button></div>
      <button type="button" className="local-review-start" onClick={() => { const scenario = persist(true); if (scenario) onStart(scenario); }}><Play size={15} fill="currentColor" /> Iniciar con este modelo</button>
      <p className="local-review-footnote">La configuración vive únicamente en localStorage y el interceptor exige entorno development + loopback.</p>
    </div> : null}
  </aside>;
}
