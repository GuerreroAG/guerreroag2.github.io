/**
 * Interface Téléphone : pile de navigation et menu de paramètres modal,
 * stylisé façon iOS.
 */
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
const FRENCH_MODE_LABEL: Record<Mode, string> = {
  text: 'Texte',
  card: 'Carte',
  both: 'Carte + Texte',
  calib: 'Calibration',
};

export default function PhoneApp({
  api,
  onUseDesktopLayout,
}: {
  api: PrinterApi;
  onUseDesktopLayout?: () => void;
}) {
  const {
    query, setQuery, results, searching, scope, setScope,
    selected, mode, setMode, labelMm, setLabelMm,
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
    screen, setScreen, sheet, setSheet, open,
  } = api;

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

  return (
    <div className="ios">
      {/* ================= recherche ================= */}
      <section className={`screen${screen === 'detail' ? ' pushed' : ''}`}>
        <div className="scroll">
          <h1 className="largetitle">Jetons</h1>

          <div className="segmented scope">
            <button
              className={scope === 'tokens' ? 'on' : ''}
              onClick={() => setScope('tokens')}
            >
              Jetons
            </button>
            <button className={scope === 'cards' ? 'on' : ''} onClick={() => setScope('cards')}>
              Toutes les cartes
            </button>
          </div>

          <div className="searchwrap">
            <div className="searchbar">
              <Icon.Search />
              <input
                value={query}
                placeholder={scope === 'tokens' ? 'Gobelin, Trésor, Ange…' : 'Llanowar Elves, Teferi…'}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button 
                className="clear" 
                onClick={startVoiceSearch} 
                aria-label="Recherche vocale"
                style={{ fontSize: '18px', padding: '0 4px', marginRight: query ? '0' : '4px' }}
              >
                🎤
              </button>
              {query && (
                <button className="clear" onClick={() => setQuery('')} aria-label="Effacer">
                  <Icon.Clear />
                </button>
              )}
            </div>
          </div>

          <div className="chips">
            {FRENCH_QUICK_PICKS.map((p) => (
              <button
                key={p}
                className={query === p ? 'chip on' : 'chip'}
                onClick={() => setQuery(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="group">
            {printerName ? (
              <div className="row">
                <span className="row-label">
                  <span className="dot on" /> {printerName}
                </span>
                <button className="textbtn" onClick={() => connect()}>
                  Reconnecter
                </button>
              </div>
            ) : (
              <button
                className="row tappable"
                onClick={() => connect()}
                disabled={!supported || busy}
              >
                <span className="row-label accent">
                  <Icon.Bluetooth />
                  {busy ? 'Recherche de l\'imprimante…' : 'Connecter l\'imprimante'}
                </span>
                <Icon.ChevronRight />
              </button>
            )}
          </div>

          {status.msg && screen === 'search' && (
            <p className={`footnote ${status.kind}`}>{status.msg}</p>
          )}

          {!supported && (
            <p className="footnote warn">
              Ce navigateur ne peut pas accéder au Bluetooth. Sur iPhone, utilisez Bluefy ou l'application native.
            </p>
          )}

          {status.kind === 'err' && screen === 'search' && (
            <div className="group">
              <button className="row tappable" onClick={() => connect()} disabled={busy}>
                <span className="row-label accent">Réessayer</span>
                <Icon.ChevronRight />
              </button>
            </div>
          )}

          {status.kind === 'err' && diag.length > 0 && screen === 'search' && (
            <details className="diagbox">
              <summary>Détails de connexion</summary>
              <pre>{diag.join('\n')}</pre>
            </details>
          )}

          {results.length > 0 && (
            <>
              <h2 className="grouphead">
                {results.length} {results.length === 1 ? 'jeton' : 'jetons'}
              </h2>
              <div className="group list">
                {results.map((c) => (
                  <button key={c.id} className="row tappable card" onClick={() => open(c)}>
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="thumb-none" />
                    )}
                    <span className="card-text">
                      <span className="card-name">{c.name}</span>
                      <span className="card-type">{c.typeLine}</span>
                      <span className="card-set">{c.setName}</span>
                    </span>
                    <span className="row-trail">
                      {statLabel(c) && (
                        <span className={`badge${statLabel(c)!.kind === 'loyalty' ? ' loyalty' : ''}`}>
                          {statLabel(c)!.text}
                        </span>
                      )}
                      <Icon.ChevronRight />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {!searching && query && results.length === 0 && (
            <p className="footnote">Aucun jeton ne correspond à “{query}”.</p>
          )}

          <div className="tailspace" />
        </div>
      </section>

      {/* ================= détails ================= */}
      <section className={`screen detail${screen === 'detail' ? ' open' : ''}`}>
        <div className="navbar">
          <button className="navback" onClick={() => setScreen('search')}>
            <Icon.ChevronLeft />
            <span>Jetons</span>
          </button>
          <span className="navtitle">{selected?.name ?? ''}</span>
          <button className="navbtn" onClick={() => setSheet(true)} aria-label="Options">
            <Icon.Sliders />
          </button>
        </div>

        <div className="scroll">
          <div className="paper">
            {selected ? <canvas ref={previewRef} /> : <p className="empty">Aucun jeton sélectionné</p>}
          </div>

          {mode === 'calib' ? (
            <div className="banner">
              <span>Bande de calibration</span>
              <button className="textbtn" onClick={() => setMode('both')}>
                Terminé
              </button>
            </div>
          ) : (
            <div className="segmented">
              {(['text', 'card', 'both'] as const).map((m) => (
                <button
                  key={m}
                  className={mode === m ? 'on' : ''}
                  disabled={m !== 'text' && !selected?.printImageUrl}
                  onClick={() => setMode(m)}
                >
                  {FRENCH_MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}

          <div className="group">
            <div className="row">
              <span className="row-label">Copies</span>
              <span className="stepper">
                <button onClick={() => setCopies((c) => Math.max(1, c - 1))} disabled={copies <= 1}>
                  −
                </button>
                <span>{copies}</span>
                <button
                  onClick={() => setCopies((c) => Math.min(20, c + 1))}
                  disabled={copies >= 20}
                >
                  +
                </button>
              </span>
            </div>
            <Row
              label="Papier utilisé"
              value={
                (printSize ? `${printSize.w.toFixed(0)} × ${printSize.h.toFixed(0)} mm` : '—') +
                (splitPlan && splitPlan.parts > 1 ? ` · ${splitPlan.parts} parties` : '')
              }
            />
            <Row label="Options d'impression" onClick={() => setSheet(true)} />
          </div>

          {status.msg && screen === 'detail' && (
            <p className={`footnote ${status.kind}`}>{status.msg}</p>
          )}
          <div className="tailspace" />
        </div>

        <div className="bottombar">
          <button className="primary" onClick={print} disabled={!selected || busy}>
            {busy && progress > 0
              ? `Impression ${Math.round(progress * 100)}%`
              : copies > 1
                ? `Imprimer ${copies} étiquettes`
                : 'Imprimer l\'étiquette'}
          </button>
        </div>
      </section>

      {/* ================= menu options ================= */}
      <div className={`backdrop${sheet ? ' open' : ''}`} onClick={() => setSheet(false)} />
      <div className={`sheet${sheet ? ' open' : ''}`}>
        <div className="grabber" />
        <div className="sheethead">
          <span>Options d'impression</span>
          <button className="textbtn strong" onClick={() => setSheet(false)}>
            Terminé
          </button>
        </div>

        <div className="scroll">
          <h2 className="grouphead">Apparence</h2>
          <div className="group">
            <SliderRow
              label="Encre"
              display={`${targetInk}%`}
              value={targetInk}
              min={15}
              max={60}
              onChange={setTargetInk}
            />
            <SliderRow
              label="Contraste"
              display={contrast > 0 ? `+${contrast}` : `${contrast}`}
              value={contrast}
              min={-50}
              max={80}
              onChange={setContrast}
            />
            <SwitchRow
              label="Ajuster chaque carte automatiquement"
              checked={autoToneOn}
              onChange={setAutoToneOn}
            />
            {!autoToneOn && (
              <SliderRow
                label="Luminosité"
                display={brightness > 0 ? `+${brightness}` : `${brightness}`}
                value={brightness}
                min={-60}
                max={80}
                onChange={setBrightness}
              />
            )}
            {mode === 'text' && (
              <SwitchRow
                label="Inclure une bande d'illustration"
                checked={showArt}
                disabled={!selected?.artUrl}
                onChange={setShowArt}
              />
            )}
            {mode === 'both' && (
              <SwitchRow
                label="Adapter le texte au contenu"
                checked={autoTextBlock}
                onChange={setAutoTextBlock}
              />
            )}
            {mode === 'both' && !autoTextBlock && (
              <SliderRow
                label="Hauteur du texte"
                display={`${textBlockMm} mm`}
                value={textBlockMm}
                min={14}
                max={45}
                onChange={setTextBlockMm}
              />
            )}
            {selected && !selected.isToken && (
              <SwitchRow
                label="Marquer comme JETON"
                checked={markTokens}
                onChange={setMarkTokens}
              />
            )}
            {mode === 'both' && (
              <SliderRow
                label="Hauteur de la carte"
                display={cardMm > 0 ? `${cardMm} mm` : 'Pleine'}
                value={cardMm}
                min={0}
                max={70}
                step={5}
                onChange={setCardMm}
              />
            )}
            {mode === 'card' && (
              <SelectRow
                label="Format de la carte"
                value={cardFit}
                options={[
                  ['aspect', 'Conserver les proportions'],
                  ['label', 'Ajuster à la hauteur'],
                ]}
                onChange={(v) => setCardFit(v as CardFit)}
              />
            )}
          </div>
          {solved?.clamped && (
            <p className="footnote warn">
              Cette carte ne peut pas atteindre {targetInk}% d'encre sans être délavée. Essayez de réduire l'Encre.
            </p>
          )}

          <h2 className="grouphead">Papier</h2>
          <div className="group">
            <SliderRow
              label="Largeur"
              display={`${Math.min(labelMm.w, MAX_WIDTH_MM)} mm`}
              value={Math.min(labelMm.w, MAX_WIDTH_MM)}
              min={20}
              max={MAX_WIDTH_MM}
              onChange={(v) => setLabelMm((s) => ({ ...s, w: v }))}
            />
            {mode !== 'both' && (
              <SliderRow
                label="Hauteur"
                display={`${labelMm.h} mm`}
                value={labelMm.h}
                min={16}
                max={90}
                onChange={(v) => setLabelMm((s) => ({ ...s, h: v }))}
              />
            )}
            <SliderRow
              label="Marge de coupe"
              display={`${tearMm} mm`}
              value={tearMm}
              min={0}
              max={25}
              onChange={setTearMm}
            />
            <SliderRow
              label="Intensité"
              display={`${density}`}
              value={density}
              min={1}
              max={15}
              onChange={setDensity}
            />
            <SelectRow
              label="Type de papier"
              value={media}
              options={[
                [MEDIA_CONTINUOUS, 'Rouleau continu'],
                [MEDIA_LABEL_WITH_GAPS, 'Étiquettes prédécoupées'],
                [MEDIA_LABEL_WITH_MARKS, 'Étiquettes avec marque noire'],
              ]}
              onChange={(v) => setMedia(Number(v))}
            />
          </div>
          <p className="footnote">
            La tête d'impression fait {MAX_WIDTH_MM} mm de large, le papier plus large gardera une marge blanche.
          </p>

          <h2 className="grouphead">Avancé</h2>
          <div className="group">
            <Row label="Imprimer un motif de test" onClick={testPrint} />
            <Row label="Vider la mémoire (Reset)" onClick={reset} />
            <Row
              label="Bande de calibration"
              onClick={() => {
                if (!selected?.printImageUrl) return;
                setMode('calib');
                setSheet(false);
              }}
            />
            <Row label={showDiag ? 'Masquer les diagnostics' : 'Afficher les diagnostics'} onClick={() => setShowDiag((v) => !v)} />
          </div>

          {showDiag && (
            <>
              <div className="group">
                <SelectRow
                  label="Tramage"
                  value={dither}
                  options={[
                    ['atkinson', 'Atkinson'],
                    ['floyd-steinberg', 'Floyd–Steinberg'],
                    ['threshold', 'Seuillage'],
                  ]}
                  onChange={(v) => setDither(v as Dither)}
                />
                <SliderRow
                  label="Seuillage"
                  display={`${threshold}`}
                  value={threshold}
                  min={40}
                  max={220}
                  onChange={setThreshold}
                />
                <SwitchRow label="Contraste local (CLAHE)" checked={claheOn} onChange={setClaheOn} />
                {claheOn && (
                  <>
                    <SliderRow
                      label="Limite de coupe"
                      display={clipLimit.toFixed(1)}
                      value={clipLimit}
                      min={1}
                      max={6}
                      step={0.5}
                      onChange={setClipLimit}
                    />
                    <SliderRow
                      label="Tuiles"
                      display={`${tiles}×${tiles}`}
                      value={tiles}
                      min={2}
                      max={16}
                      step={2}
                      onChange={setTiles}
                    />
                  </>
                )}
              </div>
              <div className="group">
                {writeMode === 'without-response' && (
                  <p className="footnote warn">
                    Sans réponse, les paquets sont limités à 20 octets — les plus gros sont ignorés par la liaison sans erreur. Fiable mais plus lent ; utilisez Avec réponse sauf pour tester.
                  </p>
                )}
                <SelectRow
                  label="Mode d'écriture"
                  value={writeMode}
                  options={[
                    ['with-response', 'Avec réponse'],
                    ['without-response', 'Sans réponse'],
                  ]}
                  onChange={(v) => setWriteMode(v as WriteMode)}
                />
                <SliderRow
                  label="Cadence"
                  display={`${chunkDelay} ms`}
                  value={chunkDelay}
                  min={0}
                  max={30}
                  onChange={setChunkDelay}
                />
                <p className="footnote">
                  La cadence est le contrôle de flux : l'écriture Bluetooth est confirmée par la radio, pas par l'imprimante. Sans cadence, on sature sa mémoire et elle sort du papier blanc.
                </p>
                <SelectRow
                  label="Taille des paquets"
                  value={chunkSize}
                  options={[
                    [20, '20 O'],
                    [60, '60 O'],
                    [128, '128 O'],
                    [180, '180 O'],
                  ]}
                  onChange={(v) => setChunkSize(Number(v))}
                />
                <SelectRow
                  label="Vitesse d'impression"
                  value={printSpeedMm}
                  options={[
                    [10, '10 mm/s (Plus sûr)'],
                    [12.5, '12.5 mm/s'],
                    [15, '15 mm/s'],
                    [20, '20 mm/s'],
                    [25, '25 mm/s (Plus rapide)'],
                  ]}
                  onChange={(v) => setPrintSpeedMm(Number(v))}
                />
                <SelectRow
                  label="Taille max de tâche"
                  value={maxJobBytes}
                  options={[
                    [30000, '30 Ko'],
                    [38000, '38 Ko'],
                    [44000, '44 Ko (Mesuré)'],
                    [50000, '50 Ko'],
                    [200000, 'Sans limite'],
                  ]}
                  onChange={(v) => setMaxJobBytes(Number(v))}
                />
                <SelectRow
                  label="Lignes par bloc"
                  value={maxBlockLines}
                  options={[
                    [65535, 'Ne pas diviser'],
                    [1024, '1024'],
                    [512, '512'],
                    [256, '256'],
                  ]}
                  onChange={(v) => setMaxBlockLines(Number(v))}
                />
                <Row label="Uniquement appareils Phomemo" onClick={() => connect(true)} />
              </div>
              {mode === 'calib' && (
                <div className="group">
                  <label className="row slider">
                    <span className="row-label">Valeurs de Luminosité</span>
                    <input
                      type="text"
                      value={sweepBright}
                      onChange={(e) => setSweepBright(e.target.value)}
                    />
                  </label>
                  <label className="row slider">
                    <span className="row-label">Valeurs de Contraste</span>
                    <input
                      type="text"
                      value={sweepContrast}
                      onChange={(e) => setSweepContrast(e.target.value)}
                    />
                  </label>
                  <SelectRow
                    label="Disposition"
                    value={calibLayout}
                    options={[
                      ['stack', 'Empilé'],
                      ['grid', 'Grille'],
                    ]}
                    onChange={(v) => setCalibLayout(v as CalibLayout)}
                  />
                  <SelectRow
                    label="Échantillon"
                    value={calibContent}
                    options={[
                      ['art', 'Bande d\'art'],
                      ['card', 'Carte entière'],
                    ]}
                    onChange={(v) => setCalibContent(v as CalibContent)}
                  />
                  {calibContent === 'art' && (
                    <SliderRow
                      label="Hauteur d'échantillon"
                      display={`${(cellH / 8).toFixed(0)} mm`}
                      value={cellH}
                      min={80}
                      max={360}
                      step={10}
                      onChange={setCellH}
                    />
                  )}
                </div>
              )}
              <p className="footnote mono">
                {geometry.widthPx} points · {geometry.widthBytes} octets/ligne
                {tone ? ` · moyenne carte ${tone.mean.toFixed(0)}` : ''}
                {solved
                  ? ` · L${solved.brightness > 0 ? '+' : ''}${solved.brightness} · encre ${(solved.predictedInk * 100).toFixed(0)}%`
                  : ''}
              </p>
              {diag.length > 0 && <pre>{diag.join('\n')}</pre>}
            </>
          )}

          {onUseDesktopLayout && (
            <>
              <h2 className="grouphead">Interface</h2>
              <div className="group">
                <Row label="Utiliser l'affichage Bureau" onClick={onUseDesktopLayout} />
              </div>
              <p className="footnote">
                L'affichage s'adapte à l'écran par défaut. Choisir une option ici la mémorise.
              </p>
            </>
          )}

          <div className="tailspace" />
        </div>
      </div>
    </div>
  );
}
