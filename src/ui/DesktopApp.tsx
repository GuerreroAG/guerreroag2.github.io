/**
 * Interface Bureau avec support des Marqueurs locaux.
 */
import { useEffect, useRef } from 'react';
import { statLabel } from '../scryfall';
import type { CardFit } from '../label';
import type { Dither } from '../raster';
import {
  MAX_WIDTH_MM,
  MEDIA_CONTINUOUS,
  MEDIA_LABEL_WITH_GAPS,
  MEDIA_LABEL_WITH_MARKS,
  type WriteMode,
} from '../printer';
import type { CalibLayout, CalibContent } from '../calibration';
import { type PrinterApi, type Mode } from '../usePrinter';
import { Row, SliderRow, SwitchRow, SelectRow } from './controls';
import * as Icon from './icons';

const FRENCH_QUICK_PICKS = ['Trésor', 'Nourriture', 'Indice', 'Gobelin', 'Zombie', 'Soldat', 'Ange', 'Bête'];
const LOCAL_COUNTERS = ['+1 / +1', '+5 / +5', '-1 / -1', 'Vol', 'Initiative', 'Lien de vie'];
const FRENCH_MODE_LABEL: Record<Mode, string> = {
  text: 'Texte',
  card: 'Carte',
  both: 'Carte + Texte',
  calib: 'Calibration',
};

export default function DesktopApp({
  api,
  onUsePhoneLayout,
}: {
  api: PrinterApi;
  onUsePhoneLayout: () => void;
}) {
  const {
    query, setQuery, results, searching, scope, setScope,
    selected, setSelected, mode, setMode, labelMm, setLabelMm,
    localCounter, openCounter, // Nouveaux champs locaux
    textBlockMm, setTextBlockMm, autoTextBlock, setAutoTextBlock,
    cardMm, setCardMm, cardFit, setCardFit,
    showArt, setShowArt, markTokens, setMarkTokens,
    dither, setDither, threshold, setThreshold,
    brightness, setBrightness, contrast, setContrast,
    autoToneOn, setAutoToneOn, targetInk, setTargetInk,
    claheOn, setClaheOn, clipLimit, setClipLimit, tiles, setTiles,
    tone, solved, printSize, previewRef, geometry,
    sweepBright, setSweepBright, sweepContrast, setSweepContrast,
    cellH, setCellH, calibLayout, setCalibLayout, calibContent, setCalibContent,
    printerName, status, progress, busy, copies, setCopies,
    density, setDensity, media, setMedia, tearMm, setTearMm,
    writeMode, setWriteMode, chunkSize, setChunkSize,
    chunkDelay, setChunkDelay, maxBlockLines, setMaxBlockLines,
    supported, diag, showDiag, setShowDiag,
    maxJobBytes, setMaxJobBytes,
    printSpeedMm, setPrintSpeedMm, splitPlan,
    connect, print, testPrint, reset,
  } = api;

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La reconnaissance vocale n'est pas supportée par ce navigateur.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.onresult = (e: any) => setQuery(e.results[0][0].transcript);
    recognition.start();
  };

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if ((selected || localCounter) && !busy) print();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      const typing =
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.type === 'text';
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && results.length > 0) {
        if (typing && document.activeElement !== searchRef.current) return;
        e.preventDefault();
        const i = selected ? results.findIndex((c) => c.id === selected.id) : -1;
        const next = e.key === 'ArrowDown' ? Math.min(results.length - 1, i + 1) : Math.max(0, i - 1);
        setSelected(results[next]);
        listRef.current
          ?.querySelectorAll('.drow')[next]
          ?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [results, selected, localCounter, setSelected, print, busy]);

  return (
    <div className="desk">
      <header className="topbar">
        <h1>Générateur de Token</h1>
        <div className="spacer" />
        <span className="conn">
          <span className={`dot ${printerName ? 'on' : ''}`} />
          {printerName ?? 'Non connecté'}
        </span>
        <button className="btn" onClick={() => connect()} disabled={!supported || busy}>
          <Icon.Bluetooth />
          {printerName ? 'Reconnecter' : 'Connecter l\'imprimante'}
        </button>
        <button className="btn ghost" onClick={onUsePhoneLayout} title="Basculer vers l'affichage Mobile">
          Vue Mobile
        </button>
      </header>

      {status.kind === 'err' && (
        <div className="banner err">
          <span>{status.msg}</span>
          <button className="btn" onClick={() => connect()} disabled={busy}>Réessayer</button>
        </div>
      )}

      <div className="cols">
        <section className="pane results-pane">
          <div className="segmented scope">
            <button className={scope === 'tokens' ? 'on' : ''} onClick={() => setScope('tokens')}>Jetons</button>
            <button className={scope === 'cards' ? 'on' : ''} onClick={() => setScope('cards')}>Toutes les cartes</button>
          </div>

          <div className="searchbar">
            <Icon.Search />
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder={scope === 'tokens' ? 'Gobelin, Trésor, Ange…' : 'Llanowar Elves, Teferi…'}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && results.length > 0) setSelected(results[0]); }}
            />
            <button className="clear" onClick={startVoiceSearch} aria-label="Recherche vocale" style={{ fontSize: '18px', padding: '0 4px', marginRight: query ? '0' : '4px' }}>🎤</button>
            {query && ( <button className="clear" onClick={() => setQuery('')} aria-label="Effacer"><Icon.Clear /></button> )}
          </div>

          <div className="chips">
            {FRENCH_QUICK_PICKS.map((p) => (
              <button key={p} className={query === p ? 'chip on' : 'chip'} onClick={() => setQuery(p)}>{p}</button>
            ))}
          </div>

          <p className="hint">Marqueurs locaux dessinés mathématiquement :</p>
          <div className="chips" style={{ paddingTop: '0' }}>
            {LOCAL_COUNTERS.map((p) => (
              <button key={p} className="chip" style={{ border: '1px solid var(--tint)' }} onClick={() => openCounter(p)}>{p}</button>
            ))}
          </div>

          <p className="hint">
            {searching ? 'Recherche en cours…' : `${results.length} résultat${results.length === 1 ? '' : 's'}`}
          </p>

          <div className="dlist" ref={listRef}>
            {results.map((c) => (
              <button key={c.id} className={`drow${selected?.id === c.id ? ' sel' : ''}`} onClick={() => {setSelected(c); api.openCounter("");}}>
                {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" /> : <span className="thumb-none" />}
                <span className="drow-text">
                  <span className="drow-name">{c.name}</span>
                  <span className="drow-type">{c.typeLine}</span>
                  <span className="drow-set">{c.setName}</span>
                </span>
                {statLabel(c) && ( <span className={`badge${statLabel(c)!.kind === 'loyalty' ? ' loyalty' : ''}`}>{statLabel(c)!.text}</span> )}
              </button>
            ))}
          </div>
        </section>

        <section className="pane preview-pane">
          {!localCounter && (
            mode === 'calib' ? (
              <div className="banner tint">
                <span>Bande de calibration</span>
                <button className="textbtn" onClick={() => setMode('both')}>Terminé</button>
              </div>
            ) : (
              <div className="segmented">
                {(['text', 'card', 'both'] as const).map((m) => (
                  <button key={m} className={mode === m ? 'on' : ''} disabled={m !== 'text' && !selected?.printImageUrl} onClick={() => setMode(m)}>
                    {FRENCH_MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            )
          )}

          <div className="paper-wrap">
            {(selected || localCounter) ? (
              <div className="paper"><canvas ref={previewRef} /></div>
            ) : (
              <p className="empty">Cherchez un jeton ou une carte, puis sélectionnez-en un.</p>
            )}
          </div>

          <div className="printbar">
            <span className="size">
              {printSize ? `${printSize.w.toFixed(0)} × ${printSize.h.toFixed(0)} mm` : '—'}
            </span>
            <div className="spacer" />
            <span className="stepper">
              <button onClick={() => setCopies((c) => Math.max(1, c - 1))} disabled={copies <= 1}>−</button>
              <span>{copies}</span>
              <button onClick={() => setCopies((c) => Math.min(20, c + 1))} disabled={copies >= 20}>+</button>
            </span>
            <button className="primary" onClick={print} disabled={(!selected && !localCounter) || busy}>
              {busy && progress > 0 ? `Impression ${Math.round(progress * 100)}%` : copies > 1 ? `Imprimer ${copies}` : 'Imprimer'}
            </button>
          </div>
          <p className={`status ${status.kind}`}>{status.kind === 'err' ? ' ' : status.msg || ' '}</p>
        </section>

        <aside className="pane settings-pane">
          
          {!localCounter && (
            <>
              <h2 className="grouphead">Apparence</h2>
              <div className="group">
                <SliderRow label="Encre" display={`${targetInk}%`} value={targetInk} min={15} max={60} onChange={setTargetInk} />
                <SliderRow label="Contraste" display={contrast > 0 ? `+${contrast}` : `${contrast}`} value={contrast} min={-50} max={80} onChange={setContrast} />
                <SwitchRow label="Ajuster automatiquement" checked={autoToneOn} onChange={setAutoToneOn} />
              </div>
            </>
          )}

          <h2 className="grouphead">Papier</h2>
          <div className="group">
            <SliderRow label="Largeur" display={`${Math.min(labelMm.w, MAX_WIDTH_MM)} mm`} value={Math.min(labelMm.w, MAX_WIDTH_MM)} min={20} max={MAX_WIDTH_MM} onChange={(v) => setLabelMm((s) => ({ ...s, w: v }))} />
            <SliderRow label="Intensité" display={`${density}`} value={density} min={1} max={15} onChange={setDensity} />
          </div>

          <h2 className="grouphead">Avancé</h2>
          <div className="group">
            <Row label="Imprimer un motif de test" onClick={testPrint} />
            <Row label="Vider la mémoire (Reset)" onClick={reset} />
            <Row label={showDiag ? 'Masquer les diagnostics' : 'Afficher les diagnostics'} onClick={() => setShowDiag(!showDiag)} />
          </div>
        </aside>
      </div>
    </div>
  );
}
