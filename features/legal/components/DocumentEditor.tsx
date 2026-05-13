import React, { useEffect, useRef, useState } from 'react';
import {
    Save,
    Info,
    Bold,
    Italic,
    Underline,
    List,
    AlignLeft,
    AlignCenter,
    AlignRight,
    FileText,
    Settings,
    Ruler,
    Highlighter,
    Eraser,
    CaseSensitive,
} from 'lucide-react';

interface DocumentEditorProps {
    initialContent: string;
    onSave: (content: string) => void;
    clauses: { id: string; label: string; active: boolean; description?: string }[];
    onToggleClause: (id: string) => void;
}

type MarginSide = 'top' | 'right' | 'bottom' | 'left';
type AlignMode = 'left' | 'center' | 'right' | 'justify';
type DragState = { side: MarginSide; axis: 'x' | 'y'; startClient: number; startValue: number } | null;

const PAGE_W = 210;
const PAGE_H = 297;
const RULER = 24;
const MIN_W = 40;
const MIN_H = 40;
const BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, li, td, th, blockquote';
const BUTTON = 'p-1.5 rounded transition-all text-slate-800 hover:bg-slate-100';

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ initialContent, onSave, clauses, onToggleClause }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const horizontalRulerRef = useRef<HTMLDivElement>(null);
    const verticalRulerRef = useRef<HTMLDivElement>(null);
    const selectionRangeRef = useRef<Range | null>(null);
    const lastContentRef = useRef(initialContent);

    const [margins, setMargins] = useState({ top: 30, left: 30, right: 20, bottom: 20 });
    const [fontFamily, setFontFamily] = useState("'Times New Roman', Times, serif");
    const [fontSize, setFontSize] = useState('12pt');
    const [lineHeight, setLineHeight] = useState('1.5');
    const [paragraphIndent, setParagraphIndent] = useState(1.5);
    const [zoom, setZoom] = useState(1);
    const [showPageSettings, setShowPageSettings] = useState(false);
    const [showParagraphMarks, setShowParagraphMarks] = useState(false);
    const [activeAlign, setActiveAlign] = useState<AlignMode>('justify');
    const [isDirty, setIsDirty] = useState(false);
    const [dragState, setDragState] = useState<DragState>(null);

    const markDirty = () => {
        setIsDirty(true);
        if (editorRef.current) {
            lastContentRef.current = editorRef.current.innerHTML;
        }
    };

    const normalizeFontTags = (size?: string) => {
        editorRef.current?.querySelectorAll('font[size]').forEach((node) => {
            const element = node as HTMLElement;
            element.removeAttribute('size');
            if (size) {
                element.style.fontSize = size;
            }
        });
    };

    const closestBlock = (node: Node | null): HTMLElement | null => {
        const root = editorRef.current;
        let current: HTMLElement | null = node instanceof HTMLElement ? node : node?.parentElement || null;
        while (root && current && current !== root) {
            if (current.matches(BLOCKS)) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    };

    const rememberSelection = () => {
        const root = editorRef.current;
        const selection = window.getSelection();
        if (!root || !selection || selection.rangeCount === 0) {
            return;
        }
        const range = selection.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) {
            return;
        }
        selectionRangeRef.current = range.cloneRange();
        const block = closestBlock(selection.anchorNode);
        const align = block?.style.textAlign || (block ? window.getComputedStyle(block).textAlign : '');
        setActiveAlign(align === 'left' || align === 'center' || align === 'right' || align === 'justify' ? align : 'justify');
    };

    const restoreSelection = () => {
        const root = editorRef.current;
        const saved = selectionRangeRef.current;
        if (!root) {
            return;
        }
        root.focus({ preventScroll: true });
        if (!saved) {
            return;
        }
        const selection = window.getSelection();
        if (!selection) {
            return;
        }
        selection.removeAllRanges();
        selection.addRange(saved);
    };

    const currentRange = () => {
        const root = editorRef.current;
        const live = window.getSelection();
        if (root && live && live.rangeCount > 0) {
            const range = live.getRangeAt(0);
            if (root.contains(range.commonAncestorContainer)) {
                return range;
            }
        }
        const saved = selectionRangeRef.current;
        return root && saved && root.contains(saved.commonAncestorContainer) ? saved : null;
    };

    const selectedBlocks = () => {
        const root = editorRef.current;
        const range = currentRange();
        if (!root || !range) {
            return [] as HTMLElement[];
        }
        const blocks = new Set<HTMLElement>();
        const start = closestBlock(range.startContainer);
        if (start) {
            blocks.add(start);
        }
        if (!range.collapsed) {
            root.querySelectorAll<HTMLElement>(BLOCKS).forEach((block) => {
                try {
                    if (range.intersectsNode(block)) {
                        blocks.add(block);
                    }
                } catch {
                    // ignore transient nodes
                }
            });
        }
        return Array.from(blocks);
    };

    const blockIndent = (block: HTMLElement) => {
        const data = parseFloat(block.dataset.paragraphIndentCm || '');
        if (Number.isFinite(data)) {
            return data;
        }
        const inline = parseFloat(block.style.textIndent.replace('cm', '').replace(',', '.'));
        return Number.isFinite(inline) ? inline : paragraphIndent;
    };

    const applyIndent = (block: HTMLElement, value: number) => {
        const next = Math.max(0, Math.min(value, 5));
        block.dataset.paragraphIndentCm = `${next}`;
        if (next === 0) {
            block.dataset.noIndent = 'true';
            block.style.textIndent = '0';
            return;
        }
        delete block.dataset.noIndent;
        block.style.textIndent = `${next}cm`;
    };

    const applyBlocks = (mutator: (block: HTMLElement) => void, wholeDocument = false) => {
        const root = editorRef.current;
        if (!root) {
            return;
        }
        restoreSelection();
        let blocks = selectedBlocks();
        if (!blocks.length && wholeDocument) {
            blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS));
        }
        if (!blocks.length) {
            const current = closestBlock(selectionRangeRef.current?.startContainer || null);
            if (current) {
                blocks = [current];
            }
        }
        if (!blocks.length) {
            return;
        }
        blocks.forEach(mutator);
        markDirty();
        rememberSelection();
    };

    const runCommand = (command: string, value?: string) => {
        restoreSelection();
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand(command, false, value);
        normalizeFontTags();
        markDirty();
        rememberSelection();
    };

    const clampMargin = (side: MarginSide, value: number, current = margins) => {
        const safe = Number.isFinite(value) ? value : 0;
        if (side === 'left') return Math.max(0, Math.min(safe, PAGE_W - current.right - MIN_W));
        if (side === 'right') return Math.max(0, Math.min(safe, PAGE_W - current.left - MIN_W));
        if (side === 'top') return Math.max(0, Math.min(safe, PAGE_H - current.bottom - MIN_H));
        return Math.max(0, Math.min(safe, PAGE_H - current.top - MIN_H));
    };

    const setMargin = (side: MarginSide, value: number) => {
        setMargins((prev) => ({ ...prev, [side]: clampMargin(side, value, prev) }));
        setIsDirty(true);
    };

    const applyAlignment = (align: AlignMode) => {
        applyBlocks((block) => {
            block.style.textAlign = align;
            if (align === 'center') {
                block.classList.add('centered');
                applyIndent(block, 0);
            } else {
                block.classList.remove('centered');
                applyIndent(block, align === 'right' ? 0 : blockIndent(block) || paragraphIndent);
            }
        });
        setActiveAlign(align);
    };

    useEffect(() => {
        if (!editorRef.current || !lastContentRef.current || lastContentRef.current === 'Gerando minuta...') return;
        if (!editorRef.current.innerHTML.trim()) {
            editorRef.current.innerHTML = lastContentRef.current;
        }
    }, []);

    useEffect(() => {
        if (!editorRef.current) return;
        if (initialContent && initialContent !== 'Gerando minuta...' && initialContent !== lastContentRef.current) {
            lastContentRef.current = initialContent;
            editorRef.current.innerHTML = initialContent;
            setIsDirty(false);
            rememberSelection();
        }
    }, [initialContent]);

    useEffect(() => {
        const onSelectionChange = () => rememberSelection();
        document.addEventListener('selectionchange', onSelectionChange);
        return () => document.removeEventListener('selectionchange', onSelectionChange);
    }, []);

    useEffect(() => {
        if (!dragState) return;
        const onMove = (event: PointerEvent) => {
            const hRect = horizontalRulerRef.current?.getBoundingClientRect();
            const vRect = verticalRulerRef.current?.getBoundingClientRect();
            if (!hRect || !vRect) return;
            if (dragState.axis === 'x') {
                const deltaMm = (event.clientX - dragState.startClient) * (PAGE_W / hRect.width);
                setMargin(dragState.side, dragState.side === 'right' ? dragState.startValue - deltaMm : dragState.startValue + deltaMm);
                return;
            }
            const deltaMm = (event.clientY - dragState.startClient) * (PAGE_H / vRect.height);
            setMargin(dragState.side, dragState.side === 'bottom' ? dragState.startValue - deltaMm : dragState.startValue + deltaMm);
        };
        const onUp = () => setDragState(null);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [dragState, margins]);

    const paperStyle: React.CSSProperties & Record<string, string> = {
        width: '210mm',
        minHeight: '297mm',
        fontFamily,
        fontSize,
        lineHeight,
        textAlign: 'justify',
        paddingTop: `${margins.top}mm`,
        paddingLeft: `${margins.left}mm`,
        paddingRight: `${margins.right}mm`,
        paddingBottom: `${margins.bottom}mm`,
        color: '#000',
        boxSizing: 'border-box',
        overflowWrap: 'anywhere',
        whiteSpace: 'normal',
        '--paragraph-indent': `${paragraphIndent}cm`,
        '--editor-line-height': lineHeight,
        '--editor-font-size': fontSize,
    };

    const rulerX = (side: 'left' | 'right') => `${side === 'left' ? margins.left : PAGE_W - margins.right}mm`;
    const rulerY = (side: 'top' | 'bottom') => `${side === 'top' ? margins.top : PAGE_H - margins.bottom}mm`;

    return (
        <div className="space-y-6 flex flex-col h-full bg-slate-100/30 p-4 sm:p-8 rounded-[2.5rem] border border-slate-200/60 shadow-inner backdrop-blur-sm">
            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                        <h4 className="text-[12px] font-black uppercase text-slate-800 tracking-[0.2em]">Clausulas Inteligentes</h4>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {clauses.map((clause) => (
                        <button
                            key={clause.id}
                            type="button"
                            onClick={() => onToggleClause(clause.id)}
                            className={`group relative px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all border-2 flex items-center gap-3 ${clause.active ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/10' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 shadow-sm'}`}
                        >
                            <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-500 ${clause.active ? 'bg-white border-white scale-110' : 'bg-transparent border-slate-300 scale-90'}`} />
                            {clause.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 relative group min-h-[600px] flex flex-col">
                <div className="absolute -inset-2 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative bg-white border border-slate-200 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-500 group-hover:border-indigo-200/50 flex-1">
                    <div className="h-14 bg-slate-100 border-b border-slate-200 flex items-center px-6 gap-2 backdrop-blur-sm overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-2 mr-4">
                            <FileText size={18} className="text-indigo-600" />
                            <span className="text-[10px] font-black uppercase text-slate-700 tracking-[0.3em] whitespace-nowrap">Papel Timbrado Digital</span>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm">
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('bold')} className={BUTTON} title="Negrito"><Bold size={16} /></button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('italic')} className={BUTTON} title="Italico"><Italic size={16} /></button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('underline')} className={BUTTON} title="Sublinhado"><Underline size={16} /></button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('removeFormat')} className={`${BUTTON} text-rose-500 hover:bg-rose-50`} title="Limpar formatacao"><Eraser size={16} /></button>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm ml-2">
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlignment('left')} className={`${BUTTON} ${activeAlign === 'left' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : ''}`} title="Esquerda"><AlignLeft size={16} /></button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlignment('center')} className={`${BUTTON} ${activeAlign === 'center' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : ''}`} title="Centro"><AlignCenter size={16} /></button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlignment('right')} className={`${BUTTON} ${activeAlign === 'right' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : ''}`} title="Direita"><AlignRight size={16} /></button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlignment('justify')} className={`${BUTTON} text-[10px] font-black px-2 ${activeAlign === 'justify' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : ''}`} title="Justificar">Just.</button>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm ml-2">
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertUnorderedList')} className={BUTTON} title="Lista"><List size={16} /></button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('insertOrderedList')} className={`${BUTTON} text-[11px] font-black px-2`} title="Lista numerada">1.</button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyBlocks((block) => applyIndent(block, blockIndent(block) - 0.5))} className={`${BUTTON} text-[11px] font-black px-2`} title="Diminuir recuo">&larr;</button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyBlocks((block) => applyIndent(block, blockIndent(block) + 0.5))} className={`${BUTTON} text-[11px] font-black px-2`} title="Aumentar recuo">&rarr;</button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowParagraphMarks((prev) => !prev)} className={`${BUTTON} text-[12px] font-black px-2 ${showParagraphMarks ? 'bg-indigo-50 text-indigo-600 shadow-sm' : ''}`} title="Marcadores de paragrafo">&para;</button>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm ml-2">
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    restoreSelection();
                                    const color = window.prompt('Cor (hex):', '#000000');
                                    if (color) runCommand('foreColor', color);
                                }}
                                className={BUTTON}
                                title="Cor da fonte"
                            >
                                <CaseSensitive size={16} />
                            </button>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runCommand('hiliteColor', 'yellow')} className={`${BUTTON} text-amber-500 hover:bg-amber-50`} title="Destacar"><Highlighter size={16} /></button>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm ml-2">
                            <select
                                value={fontFamily}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setFontFamily(value);
                                    const range = currentRange();
                                    if (range && !range.collapsed) {
                                        runCommand('fontName', value);
                                        return;
                                    }
                                    applyBlocks((block) => { block.style.fontFamily = value; }, true);
                                }}
                                className="text-[10px] font-bold bg-transparent outline-none px-2 cursor-pointer text-slate-800"
                            >
                                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                                <option value="Arial, sans-serif">Arial</option>
                                <option value="'Courier New', Courier, monospace">Courier New</option>
                                <option value="Georgia, serif">Georgia</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm ml-2">
                            <select
                                value={fontSize}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setFontSize(value);
                                    const range = currentRange();
                                    if (range && !range.collapsed) {
                                        restoreSelection();
                                        document.execCommand('styleWithCSS', false, 'true');
                                        document.execCommand('fontSize', false, '7');
                                        normalizeFontTags(value);
                                        markDirty();
                                        rememberSelection();
                                        return;
                                    }
                                    applyBlocks((block) => { block.style.fontSize = value; }, true);
                                }}
                                className="text-[10px] font-bold bg-transparent outline-none px-2 cursor-pointer text-slate-800"
                            >
                                <option value="10pt">10pt</option>
                                <option value="11pt">11pt</option>
                                <option value="12pt">12pt</option>
                                <option value="14pt">14pt</option>
                                <option value="16pt">16pt</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm ml-2">
                            <select value={lineHeight} onChange={(event) => { const value = event.target.value; setLineHeight(value); applyBlocks((block) => { block.style.lineHeight = value; }, true); }} className="text-[10px] font-bold bg-transparent outline-none px-2 cursor-pointer text-slate-800" title="Espacamento">
                                <option value="1.0">1.0</option>
                                <option value="1.15">1.15</option>
                                <option value="1.5">1.5</option>
                                <option value="2.0">2.0</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-sm ml-2">
                            <select value={`${paragraphIndent}`} onChange={(event) => { const value = Math.max(0, Math.min(parseFloat(event.target.value) || 0, 5)); setParagraphIndent(value); applyBlocks((block) => { if (activeAlign !== 'center' && activeAlign !== 'right') applyIndent(block, value); }, true); }} className="text-[10px] font-bold bg-transparent outline-none px-2 cursor-pointer text-slate-800" title="Recuo">
                                <option value="0">Sem recuo</option>
                                <option value="0.5">0.5 cm</option>
                                <option value="1">1.0 cm</option>
                                <option value="1.5">1.5 cm</option>
                                <option value="2">2.0 cm</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                            <span className="text-[8px] font-black text-slate-400 uppercase">Zoom</span>
                            <input type="range" min="0.5" max="1.5" step="0.1" value={zoom} onChange={(event) => setZoom(parseFloat(event.target.value))} className="w-20 accent-indigo-600 h-1 rounded-lg cursor-pointer" />
                            <span className="text-[8px] font-bold text-slate-600 w-8">{Math.round(zoom * 100)}%</span>
                        </div>

                        <div className="relative ml-auto pr-4">
                            <button type="button" onClick={() => setShowPageSettings(!showPageSettings)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-[9px] font-black uppercase tracking-widest ${showPageSettings ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/10' : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 shadow-sm'}`}>
                                <Settings size={14} />
                                Pagina
                            </button>
                            {showPageSettings && (
                                <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Ruler size={14} className="text-indigo-600" />
                                        <h5 className="text-[10px] font-black uppercase text-slate-800 tracking-widest">Margens (mm)</h5>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Superior</label><input type="number" min="0" value={margins.top} onChange={(event) => setMargin('top', parseFloat(event.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-800 focus:border-indigo-500 transition-all outline-none" /></div>
                                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Inferior</label><input type="number" min="0" value={margins.bottom} onChange={(event) => setMargin('bottom', parseFloat(event.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-800 focus:border-indigo-500 transition-all outline-none" /></div>
                                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Esquerda</label><input type="number" min="0" value={margins.left} onChange={(event) => setMargin('left', parseFloat(event.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-800 focus:border-indigo-500 transition-all outline-none" /></div>
                                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Direita</label><input type="number" min="0" value={margins.right} onChange={(event) => setMargin('right', parseFloat(event.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-800 focus:border-indigo-500 transition-all outline-none" /></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto bg-slate-200/50 p-4 sm:p-8 lg:p-10 custom-scrollbar">
                        <style>{`
                            .premium-paper-editor { font-size: var(--editor-font-size); line-height: var(--editor-line-height); }
                            .premium-paper-editor h1 { font-size: 14pt; font-weight: bold; text-align: center !important; margin-bottom: 25px; line-height: 1.2; text-transform: uppercase; display: block; width: 100%; }
                            .premium-paper-editor .centered { text-align: center !important; display: block; width: 100%; margin-bottom: 1em; }
                            .premium-paper-editor .centered * { text-align: center !important; }
                            .premium-paper-editor p, .premium-paper-editor li, .premium-paper-editor td, .premium-paper-editor th, .premium-paper-editor blockquote { font-size: inherit; line-height: inherit; }
                            .premium-paper-editor p { margin-bottom: 1.2em; }
                            .premium-paper-editor p:not([data-no-indent="true"]), .premium-paper-editor .indent { text-indent: var(--paragraph-indent); }
                            .premium-paper-editor .centered p, .premium-paper-editor p[data-no-indent="true"] { text-indent: 0 !important; }
                            .premium-paper-editor b, .premium-paper-editor strong { font-weight: bold; }
                            .premium-paper-editor table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 1.5pt solid #000; }
                            .premium-paper-editor th, .premium-paper-editor td { border: 1pt solid #000; padding: 10px; text-align: center !important; font-size: 11pt; }
                            .premium-paper-editor ul, .premium-paper-editor ol { margin-left: 2cm; margin-bottom: 1em; }
                            .premium-paper-editor li { margin-bottom: 0.5em; }
                            .premium-paper-editor.show-paragraph-marks p::after, .premium-paper-editor.show-paragraph-marks li::after, .premium-paper-editor.show-paragraph-marks h1::after, .premium-paper-editor.show-paragraph-marks h2::after, .premium-paper-editor.show-paragraph-marks h3::after { content: " \\00B6"; color: #94a3b8; font-size: 10px; font-weight: 700; }
                            .premium-paper-editor.show-paragraph-marks br::after { content: "\\21B5"; color: #94a3b8; font-size: 10px; font-weight: 700; }
                        `}</style>
                        <div className="min-w-full flex justify-center">
                            <div className="relative" style={{ width: `calc((210mm + ${RULER}px) * ${zoom})`, minHeight: `calc((297mm + ${RULER}px) * ${zoom})` }}>
                                <div className="absolute left-0 top-0" style={{ width: `calc(210mm + ${RULER}px)`, minHeight: `calc(297mm + ${RULER}px)`, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                                    <div className="grid overflow-visible" style={{ gridTemplateColumns: `${RULER}px 210mm`, gridTemplateRows: `${RULER}px auto` }}>
                                        <div className="flex items-center justify-center bg-slate-100 border-r border-b border-slate-300 text-[7px] font-black text-slate-400">0</div>
                                        <div ref={horizontalRulerRef} className="relative h-6 bg-slate-100 border-b border-slate-300 overflow-visible select-none" style={{ width: '210mm' }}>
                                            {/* Margens (Área Cinza) */}
                                            <div className="absolute left-0 top-0 bottom-0 bg-slate-300/30" style={{ width: `${margins.left}mm` }} />
                                            <div className="absolute right-0 top-0 bottom-0 bg-slate-200/50" style={{ width: `${margins.right}mm` }} />
                                            
                                            {/* Graduacoes */}
                                            {Array.from({ length: 22 }).map((_, i) => (
                                                <div key={i} className="absolute top-0 bottom-0 flex flex-col items-center z-10" style={{ left: `${i * 10}mm` }}>
                                                    <div className={`w-px bg-slate-400 ${i % 5 === 0 ? 'h-3.5' : 'h-2'}`} />
                                                    {i % 5 === 0 && <span className="text-[7px] text-slate-500 mt-0.5 font-bold">{i}</span>}
                                                </div>
                                            ))}

                                            {/* Linhas Guia de Margem */}
                                            <div className="absolute top-0 h-[297mm] w-px bg-indigo-500/10 pointer-events-none" style={{ left: `${margins.left}mm` }} />
                                            <div className="absolute top-0 h-[297mm] w-px bg-indigo-500/10 pointer-events-none" style={{ left: `${210 - margins.right}mm` }} />

                                            {/* Marcador de Recuo de Paragrafo (First Line Indent) */}
                                            <div 
                                                className="absolute bottom-0 z-30 cursor-ew-resize group/indent"
                                                style={{ left: `${margins.left + (paragraphIndent * 10)}mm` }}
                                                title="Recuo da Primeira Linha"
                                            >
                                                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-indigo-600 -translate-x-1/2" />
                                                <div className="hidden group-hover/indent:block absolute top-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[8px] px-1 rounded whitespace-nowrap">{paragraphIndent}cm</div>
                                            </div>

                                            {/* Controles de Arrastar Margem */}
                                            <div 
                                                className="absolute top-0 z-20 h-full w-2 -translate-x-1/2 cursor-ew-resize group/margin-h"
                                                style={{ left: `${margins.left}mm` }}
                                                onPointerDown={(e) => { e.preventDefault(); setDragState({ side: 'left', axis: 'x', startClient: e.clientX, startValue: margins.left }); }}
                                            >
                                                <div className="absolute inset-y-0 left-1/2 w-[1px] bg-indigo-500/40 group-hover/margin-h:bg-indigo-600" />
                                            </div>
                                            <div 
                                                className="absolute top-0 z-20 h-full w-2 -translate-x-1/2 cursor-ew-resize group/margin-h"
                                                style={{ left: `${210 - margins.right}mm` }}
                                                onPointerDown={(e) => { e.preventDefault(); setDragState({ side: 'right', axis: 'x', startClient: e.clientX, startValue: margins.right }); }}
                                            >
                                                <div className="absolute inset-y-0 left-1/2 w-[1px] bg-indigo-500/40 group-hover/margin-h:bg-indigo-600" />
                                            </div>
                                        </div>
                                        <div ref={verticalRulerRef} className="relative w-6 bg-slate-100 border-r border-slate-300 overflow-visible select-none" style={{ height: '297mm' }}>
                                            {/* Margens (Área Cinza) */}
                                            <div className="absolute top-0 left-0 right-0 bg-slate-300/30" style={{ height: `${margins.top}mm` }} />
                                            <div className="absolute bottom-0 left-0 right-0 bg-slate-200/50" style={{ height: `${margins.bottom}mm` }} />
                                            
                                            {/* Graduacoes */}
                                            {Array.from({ length: 30 }).map((_, i) => (
                                                <div key={i} className="absolute left-0 right-0 flex items-center z-10" style={{ top: `${i * 10}mm` }}>
                                                    {i % 5 === 0 && <span className="text-[7px] text-slate-500 mr-0.5 font-bold">{i}</span>}
                                                    <div className={`h-px bg-slate-400 ${i % 5 === 0 ? 'w-3.5' : 'w-2'}`} />
                                                </div>
                                            ))}

                                            {/* Linhas Guia de Margem */}
                                            <div className="absolute left-0 w-[210mm] h-px bg-indigo-500/5 pointer-events-none" style={{ top: `${margins.top}mm` }} />
                                            <div className="absolute left-0 w-[210mm] h-px bg-indigo-500/5 pointer-events-none" style={{ top: `${297 - margins.bottom}mm` }} />

                                            {/* Controles de Arrastar Margem */}
                                            <div 
                                                className="absolute left-0 z-20 w-full h-2 -translate-y-1/2 cursor-ns-resize group/margin-v"
                                                style={{ top: `${margins.top}mm` }}
                                                onPointerDown={(e) => { e.preventDefault(); setDragState({ side: 'top', axis: 'y', startClient: e.clientY, startValue: margins.top }); }}
                                            >
                                                <div className="absolute inset-x-0 top-1/2 h-[1px] bg-indigo-500/40 group-hover/margin-v:bg-indigo-600" />
                                            </div>
                                            <div 
                                                className="absolute left-0 z-20 w-full h-2 -translate-y-1/2 cursor-ns-resize group/margin-v"
                                                style={{ top: `${297 - margins.bottom}mm` }}
                                                onPointerDown={(e) => { e.preventDefault(); setDragState({ side: 'bottom', axis: 'y', startClient: e.clientY, startValue: margins.bottom }); }}
                                            >
                                                <div className="absolute inset-x-0 top-1/2 h-[1px] bg-indigo-500/40 group-hover/margin-v:bg-indigo-600" />
                                            </div>
                                        </div>
                                        <div className="bg-white shadow-[0_30px_100px_rgba(0,0,0,0.15)] rounded-sm" style={{ width: '210mm', minHeight: '297mm' }}>
                                            <div ref={editorRef} contentEditable suppressContentEditableWarning={true} onInput={() => { markDirty(); rememberSelection(); }} onPaste={() => {}} onMouseUp={rememberSelection} onKeyUp={rememberSelection} className={`premium-paper-editor bg-white outline-none transition-all duration-300 ${showParagraphMarks ? 'show-paragraph-marks' : ''}`} style={paperStyle} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-4 px-4">
                <div className="flex items-center gap-3">
                    <Info size={14} className="text-amber-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Edicao manual permitida, alinhamento, listas, recuo e marcador de paragrafo ativos na minuta</p>
                </div>
                <button type="button" onClick={() => { onSave(editorRef.current?.innerHTML || ''); setIsDirty(false); }} className={`px-10 py-4 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all flex items-center gap-3 shadow-xl active:scale-95 ${isDirty ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/20' : 'bg-slate-950 hover:bg-slate-900'}`}>
                    <Save size={18} /> {isDirty ? 'Salvar Alteracoes' : 'Salvar Minuta'}
                </button>
            </div>
        </div>
    );
};
