/**
 * Everything the app does, with no opinion about how it looks.
 *
 * The phone and desktop interfaces are two views over this one hook, so the
 * search, rendering, tone solving and Bluetooth behaviour cannot drift between
 * them — only the layout differs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchCards, type TokenCard, type SearchScope } from './scryfall';
import { drawLabel, drawCard, loadArt, type CardFit } from './label';
import {
  canvasToRaster,
  rasterToCanvas,
  analyseImageTone,
  autoTone,
  type Dither,
  type ToneStats,
  type AutoToneResult,
} from './raster';
import { buildCombinedLabel } from './compose';
import {
  buildCalibrationStrip,
  parseValues,
  type CalibLayout,
  type CalibContent,
} from './calibration';
import {
  WebBluetoothTransport,
  pickTransport,
  transportAvailable,
  printSectioned,
  planSections,
  printTestPattern,
  resetPrinter,
  MAX_JOB_BYTES,
  PRINT_LINES_PER_SEC,
  mmToPx,
  alignWidth,
  PRINTER_WIDTH_PX,
  DEFAULT_DENSITY,
  CHUNK_SIZE,
  CHUNK_DELAY_MS,
  CONNECT_SETTLE_MS,
  MAX_BLOCK_LINES,
  MAX_WIDTH_MM,
  DEFAULT_TEAR_FEED_PX,
  MEDIA_CONTINUOUS,
  type WriteMode,
  type Transport,
} from './printer';

export type Status = { kind: 'idle' | 'busy' | 'ok' | 'err'; msg: string };
export type Mode = 'text' | 'card' | 'both' | 'calib';

export const QUICK_PICKS = ['Treasure', 'Food', 'Clue', 'Goblin', 'Zombie', 'Soldier', 'Angel', 'Beast'];

export const MODE_LABEL: Record<Mode, string> = {
  text: 'Text',
  card: 'Card',
  both: 'Card + text',
  calib: 'Calibration',
};

function describeThrown(e: unknown): { name: string; message: string; raw: string } {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, raw: `${e.name}: ${e.message}` };
  }
  if (typeof e === 'string') return { name: 'string', message: e, raw: `string: ${e}` };
  if (e === undefined) {
    return { name: 'undefined', message: 'rejected with undefined', raw: 'rejected with undefined' };
  }
  if (e === null) {
    return { name: 'null', message: 'rejected with null', raw: 'rejected with null' };
  }
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const name =
      typeof o.name === 'string'
        ? o.name
        : (o.constructor as { name?: string } | undefined)?.name ?? 'object';
    const message = typeof o.message === 'string' ? o.message : '';
    let json: string;
    try {
      json = JSON.stringify(e);
    } catch {
      json = '(not serialisable)';
    }
    return {
      name,
      message,
      raw: `${name}${message ? `: ${message}` : ''} keys=[${Object.keys(o).join(',')}] ${json}`,
    };
  }
  return { name: typeof e, message: String(e), raw: `${typeof e}: ${String(e)}` };
}

function friendlyBleError(e: unknown): string {
  const { name, message } = describeThrown(e);
  switch (name) {
    case 'NotFoundError':
      return 'No printer found. Switch it on, and close any other app connected to it.';
    case 'SecurityError':
      return 'Blocked. Bluetooth needs an HTTPS page — plain http:// will not work.';
    case 'NotSupportedError':
      return 'This browser cannot reach Bluetooth devices.';
    case 'NetworkError':
      return 'Could not connect. Power the printer off and on, then try again.';
    case 'InvalidStateError':
      return 'Bluetooth is off, or the printer is already connected elsewhere.';
    case 'NotAllowedError':
      return 'Permission refused. Allow Bluetooth for this site and try again.';
    case 'undefined':
    case 'null':
      return 'No printer found, or this browser rejected the request. Try “Search all Bluetooth devices”.';
    default:
      return message ? `${name}: ${message}` : `Failed: ${name}`;
  }
}

interface Diagnosable {
  gatt: { service: string; characteristic: string; props: string; chosen: boolean }[];
  matchPath?: string;
  notifyState: string;
  notifications: string[];
  writeMode: 'with-response' | 'without-response';
  isUncertain(): boolean;
  confirmWorking(): void;
}

function asDiagnosable(t: unknown): Diagnosable | null {
  const d = t as Partial<Diagnosable> | null;
  return d && Array.isArray(d.gatt) && typeof d.confirmWorking === 'function'
    ? (d as Diagnosable)
    : null;
}

export function usePrinter() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [scope, setScope] = useState<SearchScope>('tokens');
  const [markTokens, setMarkTokens] = useState(true);
  const [selected, setSelected] = useState<TokenCard | null>(null);
  
  // --- NOUVEAU : État pour le compteur local ---
  const [localCounter, setLocalCounter] = useState<string | null>(null);

  const [art, setArt] = useState<HTMLImageElement | null>(null);

  const [screen, setScreen] = useState<'search' | 'detail'>('search');
  const [sheet, setSheet] = useState(false);

  const [labelMm, setLabelMm] = useState({ w: MAX_WIDTH_MM, h: 30 });
  const [mode, setMode] = useState<Mode>('both');
  const [textBlockMm, setTextBlockMm] = useState(26);
  const [cardMm, setCardMm] = useState(0); 
  const [autoTextBlock, setAutoTextBlock] = useState(true);
  const [sweepBright, setSweepBright] = useState('12, 20, 28, 36, 44, 52');
  const [sweepContrast, setSweepContrast] = useState('18');
  const [cellH, setCellH] = useState(200);
  const [calibLayout, setCalibLayout] = useState<CalibLayout>('stack');
  const [calibContent, setCalibContent] = useState<CalibContent>('art');
  const [cardFit, setCardFit] = useState<CardFit>('aspect');
  const [showArt, setShowArt] = useState(false);
  const [dither, setDither] = useState<Dither>('atkinson');
  const [threshold, setThreshold] = useState(128);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [autoToneOn, setAutoToneOn] = useState(true);
  const [targetInk, setTargetInk] = useState(40);
  const [tone, setTone] = useState<ToneStats | null>(null);
  const [solved, setSolved] = useState<AutoToneResult | null>(null);
  const [claheOn, setClaheOn] = useState(true);
  const [clipLimit, setClipLimit] = useState(2.5);
  const [tiles, setTiles] = useState(8);
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  const [copies, setCopies] = useState(1);
  const [media, setMedia] = useState(MEDIA_CONTINUOUS);

  const [printerName, setPrinterName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle', msg: '' });
  const [progress, setProgress] = useState(0);
  const [writeMode, setWriteMode] = useState<WriteMode>('with-response');
  const [chunkSize, setChunkSize] = useState(CHUNK_SIZE);
  const [chunkDelay, setChunkDelay] = useState(CHUNK_DELAY_MS);
  const [maxBlockLines, setMaxBlockLines] = useState(MAX_BLOCK_LINES);
  const [tearMm, setTearMm] = useState(DEFAULT_TEAR_FEED_PX / 8);
  const [maxJobBytes, setMaxJobBytes] = useState(MAX_JOB_BYTES);
  const [printSpeedMm, setPrintSpeedMm] = useState(PRINT_LINES_PER_SEC / 8);
  const [diag, setDiag] = useState<string[]>([]);
  const [showDiag, setShowDiag] = useState(false);
  const [printSize, setPrintSize] = useState<{ w: number; h: number } | null>(null);
  const [renderSeams, setRenderSeams] = useState<number[] | undefined>(undefined);

  const renderCanvas = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const previewRef = useRef<HTMLCanvasElement>(null);
  const transportRef = useRef<Transport>(new WebBluetoothTransport());
  const needsResetRef = useRef(false);

  const supported = transportAvailable();

  const clahe = useMemo(
    () => (claheOn ? { tiles, clipLimit } : null),
    [claheOn, tiles, clipLimit],
  );

  useEffect(() => {
    let live = true;
    pickTransport().then((t) => {
      if (!live) return;
      transportRef.current = t;
      const d = asDiagnosable(t);
      if (d) d.writeMode = writeMode;
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const d = asDiagnosable(transportRef.current);
    if (d) d.writeMode = writeMode;
  }, [writeMode]);

  useEffect(() => {
    if (mode === 'calib') return; 
    const usesImage = mode === 'card' || mode === 'both';
    setBrightness(usesImage ? 36 : 0);
    setContrast(usesImage ? 18 : 0);
  }, [mode]);

  useEffect(() => {
    if (!art || !(mode === 'card' || mode === 'both')) {
      setTone(null);
      return;
    }
    setTone(analyseImageTone(art, { clahe }));
  }, [art, mode, clahe]);

  useEffect(() => {
    if (!autoToneOn || !tone) {
      setSolved(null);
      return;
    }
    const r = autoTone(tone, { targetInk: targetInk / 100, contrast });
    setSolved(r);
    setBrightness(r.brightness);
  }, [autoToneOn, tone, targetInk, contrast]);

  const geometry = useMemo(() => {
    const wMm = Math.min(labelMm.w, MAX_WIDTH_MM);
    const widthPx = Math.min(alignWidth(mmToPx(wMm)), PRINTER_WIDTH_PX);
    return { widthPx, heightPx: mmToPx(labelMm.h), widthBytes: widthPx / 8 };
  }, [labelMm]);

  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        let normalizedText = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let cleanWord = normalizedText.replace(/\b(imprime|un|une|le|la|les|des|de|jeton)\b/g, '').trim();
        cleanWord = cleanWord.replace(/\s+/g, ' ');

        const tokenDictionary: Record<string, string> = {
          "tresor": "treasure", "elfe": "elf", "nourriture": "food", "orque": "orc",
          "armee d orques": "orc army", "armee d'orques": "orc army", "gobelin": "goblin", "bete": "beast",
          "humain": "human", "soldat": "soldier", "zombie": "zombie", "esprit": "spirit",
          "dinosaure": "dinosaur", "plante": "plant", "chevalier": "knight",
          "ange": "angel", "dragon": "dragon", "vampire": "vampire",
          "carte": "map", "indice": "clue", "sang": "blood", "copie": "copy",
          "golem": "golem", "construction": "construct", "oiseau": "bird"
        };

        let translatedQuery = query;
        if (tokenDictionary[cleanWord]) {
          translatedQuery = tokenDictionary[cleanWord];
        } else if (cleanWord) {
          const words = cleanWord.split(' ');
          translatedQuery = words.map(w => tokenDictionary[w] || w).join(' ');
        }

        setResults(await searchCards(translatedQuery, { scope, signal: ac.signal }));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setStatus({ kind: 'err', msg: (e as Error).message });
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, scope]);

  useEffect(() => {
    let live = true;
    setArt(null);
    const url =
      mode === 'card' || mode === 'both' || mode === 'calib'
        ? selected?.printImageUrl
        : showArt
          ? selected?.artUrl
          : undefined;
    if (!url) return;
    loadArt(url)
      .then((img) => live && setArt(img))
      .catch((e) => {
        if (live) setStatus({ kind: 'err', msg: (e as Error).message });
      });
    return () => {
      live = false;
    };
  }, [selected, showArt, mode]);

  const renderRaster = useCallback(
    (note?: string) => {
      // --- NOUVEAU : Dessin du marqueur local généré mathématiquement ---
      if (localCounter) {
        const canvas = renderCanvas.current;
        const W = geometry.widthPx;
        const H = 200; // Hauteur fixe du marqueur = ~25mm
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "black";
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, W - 20, H - 20);
        ctx.lineWidth = 2;
        ctx.strokeRect(22, 22, W - 44, H - 44);
        ctx.fillStyle = "black";
        // Ajustement automatique de la taille de police
        ctx.font = localCounter.length > 5 ? "bold 70px sans-serif" : "bold 100px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(localCounter, W / 2, H / 2);

        return canvasToRaster(canvas, geometry.widthBytes, {
          dither: 'threshold',
          threshold: 128,
        });
      }

      if (!selected) return null;

      if (mode === 'calib') {
        if (!art) return null;
        return buildCalibrationStrip(art, {
          widthBytes: geometry.widthBytes,
          brightnessValues: parseValues(sweepBright),
          contrastValues: parseValues(sweepContrast),
          layout: calibLayout,
          content: calibContent,
          cellH,
          dither,
          clahe,
        });
      }
      if (mode === 'both') {
        if (!art) return null;
        return buildCombinedLabel(art, selected, {
          widthBytes: geometry.widthBytes,
          tokenMarker: markTokens && !selected.isToken,
          cardHeightPx: cardMm > 0 ? Math.round(cardMm * 8) : undefined,
          textHeightPx: autoTextBlock ? 'auto' : Math.round(textBlockMm * 8),
          dither,
          brightness,
          contrast,
          clahe,
          threshold,
        });
      }
      if (mode === 'card') {
        if (!art) return null;
        drawCard(renderCanvas.current, art, {
          widthPx: geometry.widthPx,
          heightPx: geometry.heightPx,
          fit: cardFit,
        });
      } else {
        drawLabel(
          renderCanvas.current,
          selected,
          {
            widthPx: geometry.widthPx,
            heightPx: geometry.heightPx,
            showArt,
            cornerNote: note,
            tokenMarker: markTokens && !selected.isToken,
          },
          art,
        );
      }
      return canvasToRaster(renderCanvas.current, geometry.widthBytes, {
        dither,
        threshold,
        brightness,
        contrast,
        clahe,
      });
    },
    [localCounter, selected, mode, art, cardFit, geometry, showArt, dither, threshold, brightness, contrast, clahe, sweepBright, sweepContrast, cellH, calibLayout, calibContent, textBlockMm, autoTextBlock, cardMm, markTokens],
  );

  useEffect(() => {
    if (!previewRef.current) return;
    const out = renderRaster(copies > 1 ? `${copies}x` : undefined);
    if (!out) {
      setPrintSize(null);
      setRenderSeams(undefined);
      return;
    }
    rasterToCanvas(out.raster, geometry.widthBytes, out.height, previewRef.current);
    setPrintSize({ w: geometry.widthPx / 8, h: out.height / 8 });
    setRenderSeams('seams' in out ? (out as { seams?: number[] }).seams : undefined);
  }, [renderRaster, copies, geometry.widthBytes, geometry.widthPx, screen, localCounter]);

  const connect = useCallback(
    async (onlyKnownPrinters = false) => {
      setStatus({ kind: 'busy', msg: 'Recherche de votre imprimante…' });
      const t = transportRef.current;
      const d = asDiagnosable(t);
      if (d) d.writeMode = writeMode;
      try {
        const name = await t.connect({ onlyKnownPrinters });
        t.onDisconnect(() => {
          setPrinterName(null);
          setStatus({ kind: 'err', msg: 'Imprimante déconnectée' });
        });
        setPrinterName(name);

        await new Promise((r) => setTimeout(r, CONNECT_SETTLE_MS));

        if (d) {
          setDiag([
            `transport: ${t.name}`,
            `match: ${d.matchPath ?? 'none'}`,
            `notify: ${d.notifyState}`,
            ...d.gatt.map(
              (g) => `${g.chosen ? '>> ' : '   '}${g.service} / ${g.characteristic} [${g.props}]`,
            ),
          ]);
          if (d.isUncertain()) {
            setShowDiag(true);
            setStatus({
              kind: 'err',
              msg: 'Connecté, mais le service BLE peut être incorrect — voir Diagnostics.',
            });
            return;
          }
        }
        setStatus({ kind: 'ok', msg: `Connecté à ${name}` });
      } catch (e) {
        const d = describeThrown(e);
        const nav = typeof navigator !== 'undefined' ? navigator.bluetooth : undefined;
        setDiag([
          `thrown: ${d.raw}`,
          `ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : '?'}`,
          `secure context: ${typeof window !== 'undefined' && window.isSecureContext}`,
          `origin: ${typeof location !== 'undefined' ? location.origin : '?'}`,
          `navigator.bluetooth: ${nav ? 'present' : 'MISSING'}`,
          `requestDevice: ${nav && typeof nav.requestDevice === 'function' ? 'function' : 'MISSING'}`,
          `getAvailability: ${nav && typeof nav.getAvailability === 'function' ? 'function' : 'absent'}`,
          `transport: ${t.name}`,
          ...(asDiagnosable(t)?.gatt.map(
            (g) => `   ${g.service} / ${g.characteristic} [${g.props}]`,
          ) ?? []),
        ]);
        const cancelled = d.name === 'NotFoundError' && /cancel/i.test(d.message);
        setStatus(
          cancelled ? { kind: 'idle', msg: '' } : { kind: 'err', msg: friendlyBleError(e) },
        );
      }
    },
    [writeMode],
  );

  const testPrint = useCallback(async () => {
    const t = transportRef.current;
    if (!t.isConnected()) {
      setStatus({ kind: 'err', msg: 'Connectez une imprimante d\'abord' });
      return;
    }
    setStatus({ kind: 'busy', msg: 'Envoi du motif de test…' });
    try {
      await printTestPattern(t, geometry.widthBytes, {
        density,
        chunkSize,
        chunkDelayMs: chunkDelay,
        media,
        maxBlockLines,
        tearFeedPx: Math.round(tearMm * 8),
        unacknowledged: writeMode === 'without-response',
      });
      setStatus({ kind: 'ok', msg: 'Motif de test envoyé' });
    } catch (e) {
      setStatus({ kind: 'err', msg: (e as Error).message });
    }
  }, [geometry, density, chunkSize, chunkDelay, media, maxBlockLines, tearMm, writeMode, maxJobBytes, printSpeedMm]);

  const print = useCallback(async () => {
    if (!selected && !localCounter) return;
    const t = transportRef.current;
    if (!t.isConnected()) {
      setStatus({ kind: 'err', msg: 'Connectez une imprimante d\'abord' });
      return;
    }
    setStatus({ kind: 'busy', msg: 'Impression en cours…' });
    const started = performance.now();
    const tearFeedPx = Math.round(tearMm * 8);
    let recovered = false;
    try {
      const out = renderRaster();
      if (!out) throw new Error('Rien à imprimer — l\'image est en cours de chargement');

      if (needsResetRef.current) {
        await resetPrinter(t);
        needsResetRef.current = false;
        recovered = true;
      }

      const result = await printSectioned(t, out.raster, out.height, geometry.widthBytes, {
        maxJobBytes,
        copies,
        linesPerSecond: printSpeedMm * 8,
        seams: 'seams' in out ? (out as { seams?: number[] }).seams : undefined,
        density,
        chunkSize,
        chunkDelayMs: chunkDelay,
        media,
        maxBlockLines,
        tearFeedPx,
        unacknowledged: writeMode === 'without-response',
        onProgress: setProgress,
      });
      asDiagnosable(t)?.confirmWorking();
      const secs = ((performance.now() - started) / 1000).toFixed(1);

      const parts = result.sections;
      const replies = asDiagnosable(t)?.notifications.length ?? 0;
      const kb = (b: number) => `${(b / 1024).toFixed(1)}KB`;
      setDiag((d) => [
        `last print: ${parts} job${parts === 1 ? '' : 's'} × ${result.copies} cop${result.copies === 1 ? 'y' : 'ies'}` +
          ` — ${result.bytesPerSection.map(kb).join(' + ')} (limit ${kb(maxJobBytes)})` +
          (result.cutReasons.length ? `, cut at ${result.cutReasons.join(' + ')}` : '') +
          (result.waitsMs.length
            ? `, waited ${result.waitsMs.map((w) => `${(w / 1000).toFixed(1)}s`).join(' + ')}`
            : '') +
          (recovered ? ', after a reset' : ''),
        `printer replied ${replies} time(s)`,
        ...d.filter((l) => !l.startsWith('last print:') && !l.startsWith('printer replied')),
      ]);

      const inSections = parts > 1 ? `, en ${parts} parties` : '';
      const printName = localCounter ? `Marqueur ${localCounter}` : selected?.name;
      setStatus({
        kind: 'ok',
        msg:
          copies > 1
            ? `Imprimé ${copies} × ${printName} en ${secs}s${inSections}`
            : `Imprimé ${printName} en ${secs}s${inSections}`,
      });
    } catch (e) {
      needsResetRef.current = true;
      setStatus({
        kind: 'err',
        msg: `${(e as Error).message} La mémoire de l'imprimante sera vidée avant le prochain test.`,
      });
    } finally {
      setProgress(0);
    }
  }, [selected, localCounter, copies, geometry, renderRaster, density, chunkSize, chunkDelay, media, maxBlockLines, tearMm, writeMode, maxJobBytes, printSpeedMm]);

  const reset = useCallback(async () => {
    const t = transportRef.current;
    if (!t.isConnected()) {
      setStatus({ kind: 'err', msg: 'Connectez une imprimante d\'abord' });
      return;
    }
    setStatus({ kind: 'busy', msg: 'Vidage de la mémoire…' });
    try {
      await resetPrinter(t);
      needsResetRef.current = false;
      setStatus({
        kind: 'ok',
        msg: 'Mémoire vidée. Si le problème persiste, éteignez et rallumez l\'imprimante.',
      });
    } catch (e) {
      setStatus({ kind: 'err', msg: (e as Error).message });
    }
  }, []);

  const splitPlan = useMemo(() => {
    if (!printSize) return null;
    const lines = Math.round(printSize.h * 8);
    const plan = planSections(lines, geometry.widthBytes, {
      maxBytes: maxJobBytes,
      seams: renderSeams,
      tearLines: Math.round(tearMm * 8),
    });
    return { parts: plan.sections.length, bytes: plan.bytesPerSection };
  }, [printSize, renderSeams, geometry.widthBytes, maxJobBytes, tearMm]);

  const busy = status.kind === 'busy';
  
  const open = (c: TokenCard) => {
    setSelected(c);
    setLocalCounter(null); // On efface le compteur local
    setScreen('detail');
    setStatus({ kind: 'idle', msg: '' });
  };

  const openCounter = (text: string) => {
    setLocalCounter(text);
    setSelected(null); // On efface la carte sélectionnée
    setScreen('detail');
    setStatus({ kind: 'idle', msg: '' });
  };

  return {
    query, setQuery, results, searching, scope, setScope,
    selected, setSelected, art, localCounter, openCounter, // Nouveautés exposées
    mode, setMode, labelMm, setLabelMm, textBlockMm, setTextBlockMm,
    autoTextBlock, setAutoTextBlock, cardMm, setCardMm, cardFit, setCardFit,
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
  };
}

export type PrinterApi = ReturnType<typeof usePrinter>;
