/**
 * iosPdfPrint.ts — Pipeline di stampa per iPhone in modalità standalone (PWA da Home Screen).
 *
 * PERCHÉ ESISTE
 * Nel contenitore "Web App" di iPhone window.print() non apre AirPrint. L'unica strada di
 * sistema è: generare un vero PDF e consegnarlo al foglio di condivisione (che contiene "Stampa").
 *
 * COSA FA DI DIVERSO RISPETTO ALLA 6.13.3
 *  1. Il documento viene impaginato in un IFRAME ISOLATO con lo STESSO HTML usato su desktop:
 *     nessuna regola dell'app (Tailwind preflight, index.css) entra nel documento di stampa.
 *  2. Le regole "@media print" vengono attivate e quelle "@media screen" scartate, quindi il
 *     layout è quello di stampa, non quello dell'anteprima a schermo.
 *  3. La larghezza di impaginazione è quella reale del foglio (A4 meno i margini di @page a 96 dpi):
 *     gli a-capo coincidono con quelli della stampa desktop. Orientamento e margini sono letti da @page.
 *  4. Corregge la causa dei testi "scivolati in basso": html2canvas misura la baseline dei font con
 *     una <img> sonda nel documento dell'app, dove Tailwind preflight impone img{display:block}.
 *     La sonda va a capo e la baseline risulta = altezza riga anziché = ascendente.
 *  5. Impaginazione calcolata con getBoundingClientRect (coordinate assolute nel documento) e non con
 *     offsetTop (relativo all'offsetParent: dentro una tabella dà numeri sbagliati → pagine semivuote).
 *  6. Rendering a bande con tetto di pixel: mai un canvas oltre il limite di iOS (16,7 Mpx).
 *  7. Interruzioni di pagina secondo il contratto di stampa (printContract.ts, Regola 2): righe mai
 *     tagliate, blocchi lunghi scorrevoli, titolo unito alle prime righe, intestazione di colonna
 *     ripetuta a pagina nuova, un giocatore per pagina nei profili.
 *
 * Il modulo non importa nulla da printService.ts (nessuna dipendenza circolare) e non tocca
 * i percorsi di stampa di iPad, macOS, Windows e Android.
 */

// ───────────────────────────── Tipi ─────────────────────────────

export interface PdfPageSetup {
    landscape: boolean;
    pageWidthMm: number;
    pageHeightMm: number;
    marginTopMm: number;
    marginRightMm: number;
    marginBottomMm: number;
    marginLeftMm: number;
}

export interface BreakBox {
    top: number;
    bottom: number;
    /**
     * true = vincolo "resta unito a ciò che segue" (break-after: avoid). È un vincolo debole:
     * viene applicato una sola volta per pagina e mai a catena, altrimenti una sequenza di righe
     * tutte marcate break-after: avoid trascinerebbe il taglio fino a inizio pagina.
     */
    soft?: boolean;
}

/** Tabella con intestazione di colonna da ripetere quando prosegue su una pagina nuova. */
export interface RepeatHeader {
    /** Inizio e fine della tabella. */
    top: number;
    bottom: number;
    /** Striscia da ripetere: dal bordo superiore della tabella alla fine del <thead>. */
    headTop: number;
    headBottom: number;
}

export interface PrintAsPdfOptions {
    /** Titolo del documento: diventa nome file e metadato PDF. */
    title: string;
    /** Documento HTML completo (<!DOCTYPE html> … </html>), identico a quello della stampa desktop. */
    html: string;
    /** Notifica errori all'interfaccia (es. showHIGAlert). */
    onError?: (message: string) => void;
    /** Regola 2 del contratto di stampa (printContract.normalizePrintBlocks), applicata al documento montato. */
    normalizeBlocks?: (root: ParentNode) => void;
}

// ───────────────────────────── Costanti ─────────────────────────────

const PX_PER_MM = 96 / 25.4;
const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;

/** Limite prudenziale per singolo canvas. iOS WebKit rifiuta canvas oltre 16.777.216 px. */
const MAX_CANVAS_PIXELS = 12_000_000;

/** GIF 1×1 che html2canvas 1.4.x inserisce nel documento dell'app per misurare la baseline dei font. */
const H2C_PROBE_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const PROBE_FIX_STYLE_ID = 'padel-h2c-probe-fix';
const TOAST_ID = 'padel-pdf-toast';

/** Elementi che non devono mai essere tagliati a metà da un cambio pagina. */
const ATOMIC_SELECTOR = [
    'tr', 'thead', 'tfoot', 'img', 'svg', 'canvas', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    '.avoid-break', '.keep-together', '.match-row', '.section-title', '.footer', '.page-footer',
].join(',');

const PRINT_FONT_WEIGHTS = [400, 500, 600, 700, 800];

// ───────────────────────────── Funzioni pure (testabili) ─────────────────────────────

const lengthToMm = (raw: string): number | null => {
    const m = /^(-?\d*\.?\d+)(mm|cm|in|px|pt)?$/i.exec(raw.trim());
    if (!m) return null;
    const value = parseFloat(m[1]);
    switch ((m[2] || '').toLowerCase()) {
        case 'cm': return value * 10;
        case 'in': return value * 25.4;
        case 'px': return value / PX_PER_MM;
        case 'pt': return (value / 72) * 25.4;
        case 'mm': return value;
        default: return value === 0 ? 0 : null; // solo "0" è valido senza unità
    }
};

/**
 * Legge orientamento e margini dalle regole @page nell'ordine in cui compaiono (l'ultima vince,
 * come nella cascata CSS). Default: A4 verticale, margini 12mm 10mm.
 */
export const parsePageSetup = (css: string): PdfPageSetup => {
    let landscape = false;
    let margins: [number, number, number, number] = [12, 10, 12, 10];

    const pageRule = /@page\s*\{([^}]*)\}/gi;
    let rule: RegExpExecArray | null;
    while ((rule = pageRule.exec(css)) !== null) {
        const sizeDecl = /(?:^|;)\s*size\s*:\s*([^;]+)/i.exec(rule[1]);
        if (sizeDecl) landscape = /landscape/i.test(sizeDecl[1]);

        const marginDecl = /(?:^|;)\s*margin\s*:\s*([^;]+)/i.exec(rule[1]);
        if (marginDecl) {
            const parts = marginDecl[1].replace(/!important/i, '').trim().split(/\s+/).map(lengthToMm);
            if (parts.length >= 1 && parts.length <= 4 && parts.every(p => p !== null && p >= 0)) {
                const v = parts as number[];
                margins = v.length === 1 ? [v[0], v[0], v[0], v[0]]
                    : v.length === 2 ? [v[0], v[1], v[0], v[1]]
                    : v.length === 3 ? [v[0], v[1], v[2], v[1]]
                    : [v[0], v[1], v[2], v[3]];
            }
        }
    }

    return {
        landscape,
        pageWidthMm: landscape ? A4_LONG_MM : A4_SHORT_MM,
        pageHeightMm: landscape ? A4_SHORT_MM : A4_LONG_MM,
        marginTopMm: margins[0],
        marginRightMm: margins[1],
        marginBottomMm: margins[2],
        marginLeftMm: margins[3],
    };
};

/**
 * Trasforma un foglio di stile pensato per la stampa in uno applicabile a schermo:
 *  - "@media print { … }"  → "@media all { … }"  (le regole di stampa diventano attive)
 *  - "@media screen { … }" → rimosso             (lo stile dell'anteprima non deve entrare nel PDF)
 * Tutto il resto resta invariato.
 */
export const adaptCssForCapture = (css: string): string => {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let out = '';
    let i = 0;

    while (i < source.length) {
        const at = source.indexOf('@media', i);
        if (at === -1) { out += source.slice(i); break; }

        const open = source.indexOf('{', at);
        if (open === -1) { out += source.slice(i); break; }

        let depth = 1;
        let j = open + 1;
        while (j < source.length && depth > 0) {
            if (source[j] === '{') depth++;
            else if (source[j] === '}') depth--;
            j++;
        }

        const query = source.slice(at + 6, open).trim().toLowerCase();
        const inner = source.slice(open + 1, j - 1);
        const mentionsPrint = /\bprint\b/.test(query) && !/\bnot\s+print\b/.test(query);
        const mentionsScreen = /\bscreen\b/.test(query) && !/\bnot\s+screen\b/.test(query);

        out += source.slice(i, at);
        if (mentionsPrint) {
            out += `@media all {${adaptCssForCapture(inner)}}`;
        } else if (!mentionsScreen) {
            out += `@media ${query} {${adaptCssForCapture(inner)}}`;
        }
        i = j;
    }
    return out;
};

/**
 * Calcola i punti di taglio pagina (coordinate Y in px nel documento).
 *  - forcedBreaks: interruzioni obbligatorie (break-before/after: page).
 *  - avoidBoxes:   riquadri che non devono essere attraversati da un taglio; se uno di essi
 *                  cade sul bordo pagina, il taglio viene anticipato al suo inizio.
 * Un riquadro più alto di una pagina viene ignorato (si spezza dove serve, come in stampa reale).
 */
/**
 * Intestazione di tabella da ripetere in cima a una pagina che inizia alla coordinata `start`:
 * la tabella più interna il cui corpo è attraversato dal taglio.
 */
export const headerForPageStart = (start: number, headers: RepeatHeader[]): RepeatHeader | undefined => {
    let best: RepeatHeader | undefined;
    for (const h of headers) {
        if (h.headBottom <= start + 0.5 && start < h.bottom - 0.5 && start > h.top + 0.5) {
            if (!best || h.bottom - h.top < best.bottom - best.top) best = h;
        }
    }
    return best;
};

export const computePageBreaks = (
    totalHeight: number,
    pageHeight: number,
    avoidBoxes: BreakBox[],
    forcedBreaks: number[] = [],
    repeatHeaders: RepeatHeader[] = [],
): number[] => {
    const EPS = 0.5;
    const cuts: number[] = [0];
    if (totalHeight <= 0 || pageHeight <= 0) return [0, Math.max(0, totalHeight)];

    const usable = avoidBoxes
        .filter(b => b.bottom - b.top > EPS && b.bottom - b.top <= pageHeight)
        .sort((a, b) => a.top - b.top);
    const hardBoxes = usable.filter(b => !b.soft);
    const softBoxes = usable.filter(b => b.soft);
    const forced = Array.from(new Set(forcedBreaks.map(v => Math.floor(v))))
        .filter(v => v > EPS && v < totalHeight - EPS)
        .sort((a, b) => a - b);

    // Anticipa il taglio finché attraversa un riquadro indivisibile iniziato dopo l'inizio pagina.
    const settleOnHardBoxes = (start: number, from: number): number => {
        let cut = from;
        let moved = true;
        while (moved) {
            moved = false;
            for (const box of hardBoxes) {
                if (box.top >= cut) break;
                if (box.bottom > cut + EPS && box.top > start + EPS) {
                    cut = Math.floor(box.top);
                    moved = true;
                }
            }
        }
        return cut;
    };

    let current = 0;
    let guard = 0;
    while (guard++ < 5000) {
        // Se la pagina riparte dentro una tabella, parte dello spazio è occupata dall'intestazione ripetuta.
        const repeated = headerForPageStart(current, repeatHeaders);
        const capacity = repeated
            ? Math.max(pageHeight * 0.5, pageHeight - (repeated.headBottom - repeated.headTop))
            : pageHeight;
        const limit = current + capacity;
        const nextForced = forced.find(v => v > current + EPS);

        let cut: number;
        if (nextForced !== undefined && nextForced <= limit + EPS) {
            cut = nextForced;
        } else if (limit >= totalHeight - EPS) {
            break;
        } else {
            cut = settleOnHardBoxes(current, limit);

            // Vincoli deboli: un solo passaggio, e solo se la pagina resta piena almeno a metà.
            const crossing = softBoxes.find(box => box.top < cut - EPS && box.bottom > cut + EPS && box.top > current + EPS);
            if (crossing) {
                const softCut = settleOnHardBoxes(current, Math.floor(crossing.top));
                if (softCut - current >= capacity * 0.5) cut = softCut;
            }

            if (cut <= current + EPS) cut = limit; // nessun punto utile: taglio secco
        }

        cuts.push(cut);
        current = cut;
    }

    if (totalHeight - current > 1) cuts.push(totalHeight);
    else if (cuts.length === 1) cuts.push(totalHeight);
    return cuts;
};

/** Raggruppa pagine consecutive in bande il cui canvas resta sotto il tetto di pixel. */
export const groupPagesIntoBands = (
    cuts: number[],
    widthPx: number,
    scale: number,
    maxPixels: number = MAX_CANVAS_PIXELS,
): Array<{ start: number; end: number; pages: Array<{ start: number; end: number }> }> => {
    const bands: Array<{ start: number; end: number; pages: Array<{ start: number; end: number }> }> = [];
    const maxBandHeight = maxPixels / (widthPx * scale * scale);

    for (let i = 0; i < cuts.length - 1; i++) {
        const page = { start: cuts[i], end: cuts[i + 1] };
        if (page.end - page.start <= 0) continue;
        const last = bands[bands.length - 1];
        if (last && page.end - last.start <= maxBandHeight) {
            last.end = page.end;
            last.pages.push(page);
        } else {
            bands.push({ start: page.start, end: page.end, pages: [page] });
        }
    }
    return bands;
};

export const sanitizePdfFileName = (title: string): string =>
    ((title || 'Stampa').replace(/[^a-zA-Z0-9_À-ſ-]+/g, '_').replace(/^_+|_+$/g, '') || 'Stampa').slice(0, 80);

// ───────────────────────────── Interfaccia: toast di stato ─────────────────────────────

const removeToast = () => {
    if (typeof document === 'undefined') return;
    document.getElementById(TOAST_ID)?.remove();
};

const TOAST_BASE_CSS = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)',
    'bottom:calc(24px + env(safe-area-inset-bottom, 0px))',
    'max-width:calc(100vw - 32px)', 'box-sizing:border-box',
    'background:rgba(15,23,42,0.94)', 'color:#ffffff', 'border-radius:16px',
    'font:600 13px/1.3 -apple-system,BlinkMacSystemFont,sans-serif',
    'z-index:99999', 'box-shadow:0 8px 24px rgba(0,0,0,0.3)',
    'display:flex', 'align-items:center', 'gap:10px',
    '-webkit-backdrop-filter:blur(10px)', 'backdrop-filter:blur(10px)',
].join(';');

const showProgressToast = (text: string) => {
    if (typeof document === 'undefined') return;
    let el = document.getElementById(TOAST_ID);
    if (!el || el.dataset.kind !== 'progress') {
        removeToast();
        el = document.createElement('div');
        el.id = TOAST_ID;
        el.dataset.kind = 'progress';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.style.cssText = `${TOAST_BASE_CSS};padding:12px 18px;pointer-events:none;white-space:nowrap;`;
        el.innerHTML = `
            <style>@keyframes padel-pdf-spin { to { transform: rotate(360deg); } }</style>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:padel-pdf-spin .8s linear infinite;display:inline-block;flex-shrink:0;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span data-role="label"></span>`;
        document.body.appendChild(el);
    }
    const label = el.querySelector('[data-role="label"]');
    if (label) label.textContent = text;
};

/**
 * Mostra "Documento pronto" con un pulsante: serve quando iOS rifiuta navigator.share() perché
 * il tocco originale è "scaduto" durante la generazione (NotAllowedError). Un nuovo tocco lo sblocca.
 */
const showReadyToast = (onShare: () => void) => {
    if (typeof document === 'undefined') return;
    removeToast();
    const el = document.createElement('div');
    el.id = TOAST_ID;
    el.dataset.kind = 'ready';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Documento pronto per la stampa');
    el.style.cssText = `${TOAST_BASE_CSS};padding:8px 8px 8px 16px;`;

    const label = document.createElement('span');
    label.textContent = 'Documento pronto';
    label.style.cssText = 'white-space:nowrap;';

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.textContent = 'Stampa / Condividi';
    shareBtn.style.cssText = 'min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#0A84FF;color:#fff;font:700 14px -apple-system,BlinkMacSystemFont,sans-serif;white-space:nowrap;';
    shareBtn.addEventListener('click', () => { removeToast(); onShare(); });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Chiudi');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'min-width:44px;min-height:44px;border:0;border-radius:12px;background:rgba(255,255,255,0.14);color:#fff;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;';
    closeBtn.addEventListener('click', removeToast);

    el.append(label, shareBtn, closeBtn);
    document.body.appendChild(el);
    setTimeout(() => { if (document.getElementById(TOAST_ID) === el) el.remove(); }, 120000);
};

// ───────────────────────────── Preparazione del documento ─────────────────────────────

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | void> =>
    Promise.race([promise, new Promise<void>(resolve => setTimeout(resolve, ms))]);

/**
 * Neutralizza, SOLO per la <img> sonda di html2canvas, il "display:block" di Tailwind preflight.
 * È la causa diretta dei testi stampati più in basso delle loro caselle.
 */
const ensureFontProbeFix = () => {
    if (document.getElementById(PROBE_FIX_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PROBE_FIX_STYLE_ID;
    style.textContent = `img[src="${H2C_PROBE_SRC}"]{display:inline !important;float:none !important;position:static !important;max-width:none !important;width:1px !important;height:1px !important;border:0 !important;}`;
    document.head.appendChild(style);
};

/** html2canvas disegna il testo su un canvas del documento principale: i pesi devono essere già caricati lì. */
const loadPrintFonts = async (doc: Document) => {
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) return;
    try {
        await withTimeout(
            Promise.all([
                ...PRINT_FONT_WEIGHTS.map(w => fonts.load(`${w} 12px Manrope`)),
                fonts.ready,
            ]),
            4000,
        );
    } catch { /* offline: si usa il font di ripiego */ }
};

const mountPrintFrame = async (
    html: string,
    widthPx: number,
    heightPx: number,
    normalizeBlocks?: (root: ParentNode) => void,
): Promise<HTMLIFrameElement> => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:${heightPx}px;border:0;opacity:0;pointer-events:none;background:#ffffff;`;
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) throw new Error('iframe di stampa non disponibile');

    doc.open();
    doc.write(html);
    doc.close();

    if (doc.readyState !== 'complete') {
        await withTimeout(new Promise<void>(resolve => win.addEventListener('load', () => resolve(), { once: true })), 6000);
    }

    // Attiva lo stile di stampa e scarta quello dell'anteprima a schermo.
    doc.querySelectorAll('style').forEach(styleEl => {
        styleEl.textContent = adaptCssForCapture(styleEl.textContent || '');
    });
    const captureStyle = doc.createElement('style');
    captureStyle.textContent = `
        html { -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; background: #ffffff; }
        .no-print, .print-toolbar { display: none !important; }
    `;
    doc.head.appendChild(captureStyle);

    try { normalizeBlocks?.(doc); } catch (e) { console.error('normalizeBlocks error:', e); }

    await loadPrintFonts(doc);
    await withTimeout(
        Promise.all(Array.from(doc.images).map(img => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))),
        4000,
    );

    // Le icone SVG inline usano stroke="currentColor": html2canvas le serializza fuori contesto,
    // quindi il colore ereditato va fissato sull'elemento stesso.
    doc.querySelectorAll<SVGSVGElement>('svg').forEach(svg => {
        const color = win.getComputedStyle(svg).color;
        if (color) svg.style.color = color;
    });

    // Due frame per garantire layout stabile dopo font e immagini.
    await new Promise<void>(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
    return iframe;
};

const hasOwnText = (el: Element): boolean => {
    for (let n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 && (n.nodeValue || '').trim().length > 0) return true;
    }
    return false;
};

/** Rileva nel documento impaginato i riquadri da non spezzare e le interruzioni forzate. */
const collectBreakInfo = (
    doc: Document,
    pageHeightPx: number,
): { avoid: BreakBox[]; forced: number[]; headers: RepeatHeader[] } => {
    const win = doc.defaultView!;
    const avoid: BreakBox[] = [];
    const forced: number[] = [];
    const headers: RepeatHeader[] = [];
    const scrollY = win.scrollY || 0;
    const isForced = (v: string) => v === 'page' || v === 'always' || v === 'left' || v === 'right';

    doc.body.querySelectorAll<HTMLElement>('*').forEach(el => {
        const tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME') return;
        if (el.closest('svg') && tag.toLowerCase() !== 'svg') return;

        const rect = el.getBoundingClientRect();
        if (rect.height <= 0 || rect.width <= 0) return;
        const top = rect.top + scrollY;
        const bottom = rect.bottom + scrollY;

        const cs = win.getComputedStyle(el);
        const breakInside = cs.breakInside || cs.getPropertyValue('page-break-inside');
        const breakBefore = cs.breakBefore || cs.getPropertyValue('page-break-before');
        const breakAfter = cs.breakAfter || cs.getPropertyValue('page-break-after');

        if (isForced(breakBefore)) forced.push(top);
        if (isForced(breakAfter)) forced.push(bottom);

        const atomic = breakInside === 'avoid'
            || cs.getPropertyValue('page-break-inside') === 'avoid'
            || el.matches(ATOMIC_SELECTOR)
            || (hasOwnText(el) && rect.height <= pageHeightPx / 3);
        if (atomic) avoid.push({ top, bottom });

        if (tag === 'THEAD') {
            // L'intestazione di colonna resta attaccata alla prima riga di dati…
            avoid.push({ top, bottom: bottom + 30, soft: true });
            // …e viene ripetuta quando la tabella prosegue su una pagina nuova.
            const table = el.closest('table');
            if (table) {
                const tableRect = table.getBoundingClientRect();
                if (bottom - (tableRect.top + scrollY) <= pageHeightPx / 4) {
                    headers.push({
                        top: tableRect.top + scrollY,
                        bottom: tableRect.bottom + scrollY,
                        headTop: tableRect.top + scrollY,
                        headBottom: bottom,
                    });
                }
            }
        }

        // "Resta unito a ciò che segue" (titoli di sezione): il titolo non rimane orfano a fondo pagina.
        if (breakAfter === 'avoid' || cs.getPropertyValue('page-break-after') === 'avoid') {
            const next = el.nextElementSibling as HTMLElement | null;
            if (next) {
                const nextRect = next.getBoundingClientRect();
                if (nextRect.height > 0) {
                    avoid.push({ top, bottom: Math.min(nextRect.bottom, nextRect.top + 56) + scrollY, soft: true });
                }
            }
        }
    });

    return { avoid, forced, headers };
};

// ───────────────────────────── Generazione del PDF ─────────────────────────────

const collectCss = (html: string): string => {
    let css = '';
    const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) css += '\n' + m[1];
    return css;
};

export const renderHtmlDocumentToPdf = async (
    html: string,
    title: string,
    onProgress?: (page: number, total: number) => void,
    normalizeBlocks?: (root: ParentNode) => void,
): Promise<Blob> => {
    const setup = parsePageSetup(collectCss(html));
    const contentWidthMm = setup.pageWidthMm - setup.marginLeftMm - setup.marginRightMm;
    const contentHeightMm = setup.pageHeightMm - setup.marginTopMm - setup.marginBottomMm;
    const widthPx = Math.round(contentWidthMm * PX_PER_MM);
    const pageHeightPx = Math.floor(contentHeightMm * PX_PER_MM);

    const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);

    ensureFontProbeFix();
    await loadPrintFonts(document);

    const iframe = await mountPrintFrame(html, widthPx, pageHeightPx, normalizeBlocks);
    try {
        const doc = iframe.contentDocument!;
        const totalHeight = Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight));
        const { avoid, forced, headers } = collectBreakInfo(doc, pageHeightPx);
        const cuts = computePageBreaks(totalHeight, pageHeightPx, avoid, forced, headers);
        const pageCount = cuts.length - 1;

        // 3× (≈290 dpi) per documenti brevi, 2× (≈195 dpi) per quelli lunghi: nitido in stampa, leggero da condividere.
        const scale = pageCount <= 6 ? 3 : 2;
        const bands = groupPagesIntoBands(cuts, widthPx, scale);

        const pdf = new jsPDF({
            orientation: setup.landscape ? 'landscape' : 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });
        pdf.setProperties({ title: title || 'Stampa', creator: 'Padel ELO Manager' });

        // Rende una fascia orizzontale del documento. Il canvas appartiene al documento dell'iframe:
        // impaginazione e disegno del testo risolvono i font nello stesso documento.
        const renderRegion = (top: number, height: number): Promise<HTMLCanvasElement> => {
            const targetCanvas = doc.createElement('canvas');
            targetCanvas.width = Math.floor(widthPx * scale);
            targetCanvas.height = Math.floor(height * scale);
            return html2canvas(doc.documentElement, {
                canvas: targetCanvas,
                x: 0,
                y: top,
                width: widthPx,
                height,
                windowWidth: widthPx,
                windowHeight: pageHeightPx,
                scrollX: 0,
                scrollY: 0,
                scale,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
            });
        };

        // Intestazioni di colonna da ripetere: una sola resa per tabella, riusata su ogni pagina.
        const headerCanvases = new Map<RepeatHeader, HTMLCanvasElement>();
        const headerCanvasFor = async (header: RepeatHeader): Promise<HTMLCanvasElement> => {
            let canvas = headerCanvases.get(header);
            if (!canvas) {
                canvas = await renderRegion(header.headTop, Math.ceil(header.headBottom - header.headTop));
                headerCanvases.set(header, canvas);
            }
            return canvas;
        };

        let pageIndex = 0;
        for (const band of bands) {
            const bandHeight = Math.ceil(band.end - band.start);
            const bandCanvas = await renderRegion(band.start, bandHeight);

            for (const page of band.pages) {
                const repeated = headerForPageStart(page.start, headers);
                const headerCanvas = repeated ? await headerCanvasFor(repeated) : null;
                const headerHeightPx = repeated ? repeated.headBottom - repeated.headTop : 0;
                const contentHeightPx = page.end - page.start;
                const sliceHeightPx = headerHeightPx + contentHeightPx;

                const headerPixels = Math.round(headerHeightPx * scale);
                const contentPixels = Math.max(1, Math.round(contentHeightPx * scale));
                const slice = document.createElement('canvas');
                slice.width = bandCanvas.width;
                slice.height = headerPixels + contentPixels;
                const ctx = slice.getContext('2d');
                if (!ctx) throw new Error('Canvas 2D non disponibile');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, slice.width, slice.height);
                if (headerCanvas && headerPixels > 0) {
                    ctx.drawImage(headerCanvas, 0, 0, headerCanvas.width, headerPixels, 0, 0, slice.width, headerPixels);
                }
                ctx.drawImage(
                    bandCanvas,
                    0, Math.round((page.start - band.start) * scale), bandCanvas.width, contentPixels,
                    0, headerPixels, slice.width, contentPixels,
                );

                if (pageIndex > 0) pdf.addPage('a4', setup.landscape ? 'landscape' : 'portrait');
                pdf.addImage(
                    slice.toDataURL('image/jpeg', 0.92), 'JPEG',
                    setup.marginLeftMm, setup.marginTopMm,
                    contentWidthMm, sliceHeightPx / PX_PER_MM,
                    undefined, 'FAST',
                );

                // iOS conteggia la memoria dei canvas finché non vengono azzerati.
                slice.width = 0; slice.height = 0;
                pageIndex++;
                onProgress?.(pageIndex, pageCount);
            }
            bandCanvas.width = 0; bandCanvas.height = 0;
            await new Promise<void>(resolve => setTimeout(resolve, 0)); // lascia respirare l'interfaccia
        }

        headerCanvases.forEach(canvas => { canvas.width = 0; canvas.height = 0; });
        return pdf.output('blob');
    } finally {
        iframe.remove();
    }
};

// ───────────────────────────── Consegna al sistema (AirPrint via foglio di condivisione) ─────────────────────────────

const deliverPdf = async (blob: Blob, title: string): Promise<'shared' | 'cancelled' | 'needs-tap' | 'opened'> => {
    const fileName = `${sanitizePdfFileName(title)}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };

    if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
        try {
            await nav.share({ files: [file], title: title || 'Stampa' });
            return 'shared';
        } catch (err: any) {
            if (err?.name === 'AbortError') return 'cancelled';
            if (err?.name === 'NotAllowedError') return 'needs-tap';
            console.warn('navigator.share fallito, apro il PDF nel visualizzatore:', err);
        }
    }

    // Ripiego: visualizzatore PDF di sistema (ha il proprio pulsante di condivisione/stampa).
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank');
    if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return 'opened';
};

let generationInProgress = false;

/**
 * Punto d'ingresso: impagina il documento, genera il PDF e apre il foglio di condivisione di iOS
 * (che contiene "Stampa" con anteprima, scelta stampante, copie e intervallo pagine).
 */
export const printHtmlDocumentAsPdf = async ({ title, html, onError, normalizeBlocks }: PrintAsPdfOptions): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (generationInProgress) return false; // doppio tocco
    generationInProgress = true;

    showProgressToast('Preparazione documento…');
    try {
        const blob = await renderHtmlDocumentToPdf(html, title, (page, total) => {
            showProgressToast(total > 1 ? `Pagina ${page} di ${total}…` : 'Preparazione documento…');
        }, normalizeBlocks);
        removeToast();

        const outcome = await deliverPdf(blob, title);
        if (outcome === 'needs-tap') {
            showReadyToast(() => {
                deliverPdf(blob, title).then(result => {
                    if (result === 'needs-tap') onError?.('Impossibile aprire il foglio di stampa. Riprova.');
                });
            });
        }
        return true;
    } catch (error) {
        removeToast();
        console.error('printHtmlDocumentAsPdf error:', error);
        onError?.('Errore durante la preparazione del documento per la stampa.');
        return false;
    } finally {
        generationInProgress = false;
    }
};
