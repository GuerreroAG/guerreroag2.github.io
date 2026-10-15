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
    localCounter, openCounter,
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

      {!supported && (
        <p className="banner err">
          Ce navigateur ne peut pas accéder au Bluetooth. Chrome et Edge fonctionnent nativement.
        </p>
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
              <button key={c.id} className={`drow${selected?.id === c.id ? ' sel' : ''}`} onClick={() => {setSelected(c); openCounter("");}}>
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
                {!autoToneOn && (
                  <SliderRow label="Luminosité" display={brightness > 0 ? `+${brightness}` : `${brightness}`} value={brightness} min={-60} max={80} onChange={setBrightness} />
                )}
                {mode === 'text' && (
                  <SwitchRow label="Inclure une bande d'illustration" checked={showArt} disabled={!selected?.artUrl} onChange={setShowArt} />
                )}
                {mode === 'both' && (
                  <SwitchRow label="Adapter le texte au contenu" checked={autoTextBlock} onChange={setAutoTextBlock} />
                )}
                {mode === 'both' && !autoTextBlock && (
                  <SliderRow label="Hauteur du texte" display={`${textBlockMm} mm`} value={textBlockMm} min={14} max={45} onChange={setTextBlockMm} />
                )}
                {selected && !selected.isToken && (
                  <SwitchRow label="Marquer comme JETON" checked={markTokens} onChange={setMarkTokens} />
                )}
                {mode === 'both' && (
                  <SliderRow label="Hauteur de la carte" display={cardMm > 0 ? `${cardMm} mm` : 'Pleine'} value={cardMm} min={0} max={70} step={5} onChange={setCardMm} />
                )}
                {mode === 'card' && (
                  <SelectRow label="Format de la carte" value={cardFit} options={[['aspect', 'Conserver les proportions'], ['label', 'Ajuster à la hauteur']]} onChange={(v) => setCardFit(v as CardFit)} />
                )}
              </div>
            </>
          )}

          <h2 className="grouphead">Papier</h2>
          <div className="group">
            <SliderRow label="Largeur" display={`${Math.min(labelMm.w, MAX_WIDTH_MM)} mm`} value={Math.min(labelMm.w, MAX_WIDTH_MM)} min={20} max={MAX_WIDTH_MM} onChange={(v) => setLabelMm((s) => ({ ...s, w: v }))} />
            {(!localCounter && mode !== 'both') && (
              <SliderRow label="Hauteur" display={`${labelMm.h} mm`} value={labelMm.h} min={16} max={90} onChange={(v) => setLabelMm((s) => ({ ...s, h: v }))} />
            )}
            <SliderRow label="Marge de coupe" display={`${tearMm} mm`} value={tearMm} min={0} max={25} onChange={setTearMm} />
            <SliderRow label="Intensité" display={`${density}`} value={density} min={1} max={15} onChange={setDensity} />
            <SelectRow label="Type de papier" value={media} options={[[MEDIA_CONTINUOUS, 'Rouleau continu'], [MEDIA_LABEL_WITH_GAPS, 'Étiquettes prédécoupées'], [MEDIA_LABEL_WITH_MARKS, 'Étiquettes avec marque noire']]} onChange={(v) => setMedia(Number(v))} />
          </div>

          <h2 className="grouphead">Avancé</h2>
          <div className="group">
            <Row label="Imprimer un motif de test" onClick={testPrint} />
            <Row label="Vider la mémoire (Reset)" onClick={reset} />
            {!localCounter && (
              <Row label="Bande de calibration" onClick={() => { if (selected?.printImageUrl) { setMode('calib'); } }} />
            )}
            <Row label={showDiag ? 'Masquer les diagnostics' : 'Afficher les diagnostics'} onClick={() => setShowDiag(!showDiag)} />
          </div>

          {(!localCounter && mode === 'calib') && (
            <div className="group">
              <label className="row slider">
                <span className="row-label">Luminosités</span>
                <input type="text" value={sweepBright} onChange={(e) => setSweepBright(e.target.value)} />
              </label>
              <label className="row slider">
                <span className="row-label">Contrastes</span>
                <input type="text" value={sweepContrast} onChange={(e) => setSweepContrast(e.target.value)} />
              </label>
              <SelectRow label="Disposition" value={calibLayout} options={[['stack', 'Empilé'], ['grid', 'Grille']]} onChange={(v) => setCalibLayout(v as CalibLayout)} />
              <SelectRow label="Échantillon" value={calibContent} options={[['art', 'Bande d\'art'], ['card', 'Carte entière']]} onChange={(v) => setCalibContent(v as CalibContent)} />
              {calibContent === 'art' && (
                <SliderRow label="Hauteur" display={`${(cellH / 8).toFixed(0)} mm`} value={cellH} min={80} max={360} step={10} onChange={setCellH} />
              )}
            </div>
          )}

          {showDiag && (
            <>
              {!localCounter && (
                <div className="group">
                  <SelectRow label="Tramage" value={dither} options={[['atkinson', 'Atkinson'], ['floyd-steinberg', 'Floyd–Steinberg'], ['threshold', 'Seuillage']]} onChange={(v) => setDither(v as Dither)} />
                  <SliderRow label="Seuillage" display={`${threshold}`} value={threshold} min={40} max={220} onChange={setThreshold} />
                  <SwitchRow label="Contraste local (CLAHE)" checked={claheOn} onChange={setClaheOn} />
                  {claheOn && (
                    <>
                      <SliderRow label="Limite de coupe" display={clipLimit.toFixed(1)} value={clipLimit} min={1} max={6} step={0.5} onChange={setClipLimit} />
                      <SliderRow label="Tuiles" display={`${tiles}×${tiles}`} value={tiles} min={2} max={16} step={2} onChange={setTiles} />
                    </>
                  )}
                </div>
              )}
              <div className="group">
                <SelectRow label="Mode d'écriture" value={writeMode} options={[['with-response', 'Avec réponse'], ['without-response', 'Sans réponse']]} onChange={(v) => setWriteMode(v as WriteMode)} />
                <SliderRow label="Cadence" display={`${chunkDelay} ms`} value={chunkDelay} min={0} max={30} onChange={setChunkDelay} />
                <SelectRow label="Taille des paquets" value={chunkSize} options={[[20, '20 O'], [60, '60 O'], [128, '128 O'], [180, '180 O']]} onChange={(v) => setChunkSize(Number(v))} />
                <SelectRow label="Vitesse d'impression" value={printSpeedMm} options={[[10, '10 mm/s'], [12.5, '12.5 mm/s'], [15, '15 mm/s'], [20, '20 mm/s'], [25, '25 mm/s']]} onChange={(v) => setPrintSpeedMm(Number(v))} />
                <SelectRow label="Taille max de tâche" value={maxJobBytes} options={[[30000, '30 Ko'], [38000, '38 Ko'], [44000, '44 Ko'], [50000, '50 Ko'], [200000, 'Sans limite']]} onChange={(v) => setMaxJobBytes(Number(v))} />
                <SelectRow label="Lignes par bloc" value={maxBlockLines} options={[[65535, 'Ne pas diviser'], [1024, '1024'], [512, '512'], [256, '256']]} onChange={(v) => setMaxBlockLines(Number(v))} />
                <Row label="Uniquement appareils Phomemo" onClick={() => connect(true)} />
              </div>
              <p className="hint mono">
                {geometry.widthPx} points · {geometry.widthBytes} octets/ligne
                {(!localCounter && tone) ? ` · moyenne carte ${tone.mean.toFixed(0)}` : ''}
                {(!localCounter && solved) ? ` · L${solved.brightness > 0 ? '+' : ''}${solved.brightness} · encre ${(solved.predictedInk * 100).toFixed(0)}%` : ''}
              </p>
              {diag.length > 0 && <pre>{diag.join('\n')}</pre>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
