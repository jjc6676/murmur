import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Bold, Braces, Italic, Link2, List, ListChecks, ListOrdered, Quote, Table2, Underline } from 'lucide-react';
import { api } from '../lib/api';
import styles from './Scratchpad.module.css';

const ALLOWED: Record<string, true> = { P: true, DIV: true, BR: true, STRONG: true, B: true, EM: true, I: true, U: true, BLOCKQUOTE: true, CODE: true, UL: true, OL: true, LI: true, A: true, TABLE: true, TBODY: true, TR: true, TD: true, TH: true, IMG: true };

function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      if (!ALLOWED[child.tagName]) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attribute of [...child.attributes]) {
        if (!((child.tagName === 'A' && attribute.name === 'href') || (child.tagName === 'IMG' && ['src', 'alt'].includes(attribute.name)) || (child.tagName === 'LI' && attribute.name === 'data-check'))) child.removeAttribute(attribute.name);
      }
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') ?? '';
        if (!/^(https?:|mailto:)/i.test(href)) child.removeAttribute('href');
      }
      if (child.tagName === 'IMG' && !/^murmur-image:/i.test(child.getAttribute('src') ?? '')) child.remove();
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

function selectionIn(root: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

function wrapSelection(root: HTMLElement, tag: keyof HTMLElementTagNameMap): void {
  const range = selectionIn(root);
  if (!range || range.collapsed) return;
  const wrapper = document.createElement(tag);
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.selectAllChildren(wrapper);
}

interface Props { noteId: string; html: string; showFormatting?: boolean; onChange(html: string, source?: 'typed' | 'dictated'): void }

export function RichEditor({ noteId, html, showFormatting = true, onChange }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('https://');
  const savedRange = useRef<Range | null>(null);
  const nextSource = useRef<'typed' | 'dictated'>('typed');

  useEffect(() => {
    if (root.current && root.current.innerHTML !== html) root.current.innerHTML = sanitize(html);
  }, [html, noteId]);

  const changed = () => {
    onChange(sanitize(root.current?.innerHTML ?? ''), nextSource.current);
    nextSource.current = 'typed';
  };
  const apply = (fn: () => void) => { fn(); changed(); root.current?.focus(); };
  const list = (ordered: boolean, checklist = false) => apply(() => {
    const range = root.current && selectionIn(root.current);
    if (!range) return;
    const container = document.createElement(ordered ? 'ol' : 'ul');
    const item = document.createElement('li');
    if (checklist) item.dataset.check = 'false';
    item.append(range.extractContents());
    container.append(item);
    range.insertNode(container);
  });
  const table = () => apply(() => {
    const range = root.current && selectionIn(root.current);
    if (!range) return;
    const element = document.createElement('table');
    element.innerHTML = '<tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody>';
    range.deleteContents();
    range.insertNode(element);
  });
  const openLink = () => {
    const range = root.current && selectionIn(root.current);
    if (!range) return;
    savedRange.current = range.cloneRange();
    setLinkText(range.toString());
    const anchor = range.commonAncestorContainer.parentElement?.closest('a');
    setLinkUrl(anchor?.getAttribute('href') || 'https://');
    setLinkOpen(true);
  };
  const applyLink = () => apply(() => {
    const range = savedRange.current;
    if (!range || !/^(https?:|mailto:)/i.test(linkUrl)) return;
    const anchor = document.createElement('a');
    anchor.href = linkUrl;
    anchor.textContent = linkText || linkUrl;
    range.deleteContents();
    range.insertNode(anchor);
    setLinkOpen(false);
  });
  const removeLink = () => apply(() => {
    const anchor = savedRange.current?.commonAncestorContainer.parentElement?.closest('a');
    if (anchor) anchor.replaceWith(...anchor.childNodes);
    setLinkOpen(false);
  });
  const insertImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      const src = await api.notes.addImage(noteId, String(reader.result), { width, height, bytes: file.size });
      bitmap.close();
      const image = document.createElement('img');
      image.src = src;
      image.alt = file.name;
      image.width = width;
      image.height = height;
      root.current?.append(image);
      changed();
    };
    reader.readAsDataURL(file);
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const image = [...event.clipboardData.files].find((file) => file.type.startsWith('image/'));
    if (image) { event.preventDefault(); void insertImage(image); }
    else nextSource.current = 'dictated';
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    for (const file of [...event.dataTransfer.files]) void insertImage(file);
  };
  const tableAction = (action: 'row-above' | 'row-below' | 'column-left' | 'column-right' | 'delete-row' | 'delete-column' | 'delete-table') => apply(() => {
    const range = root.current && selectionIn(root.current);
    const cell = range?.commonAncestorContainer.parentElement?.closest('td,th') as HTMLTableCellElement | null;
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const tableElement = cell?.closest('table');
    if (!cell || !row || !tableElement) return;
    const index = cell.cellIndex;
    if (action === 'row-above' || action === 'row-below') {
      const newRow = row.cloneNode(true) as HTMLTableRowElement;
      for (const c of [...newRow.cells]) c.innerHTML = '<br>';
      row.parentElement?.insertBefore(newRow, action === 'row-above' ? row : row.nextSibling);
    } else if (action === 'column-left' || action === 'column-right') {
      for (const r of [...tableElement.rows]) r.insertCell(index + (action === 'column-right' ? 1 : 0)).append(document.createElement('br'));
    } else if (action === 'delete-row') row.remove();
    else if (action === 'delete-column') for (const r of [...tableElement.rows]) r.cells[index]?.remove();
    else tableElement.remove();
  });

  return <div className={`${styles.editorWrap} ${showFormatting ? '' : styles.noFormatting}`}>
    {showFormatting && <div className={styles.formatting} aria-label="Formatting toolbar">
      <button aria-label="Bold" title="Bold" onMouseDown={(e) => { e.preventDefault(); apply(() => root.current && wrapSelection(root.current, 'strong')); }}><Bold size={16} /></button>
      <button aria-label="Italic" title="Italic" onMouseDown={(e) => { e.preventDefault(); apply(() => root.current && wrapSelection(root.current, 'em')); }}><Italic size={16} /></button>
      <button aria-label="Underline" title="Underline" onMouseDown={(e) => { e.preventDefault(); apply(() => root.current && wrapSelection(root.current, 'u')); }}><Underline size={16} /></button>
      <button aria-label="Blockquote" title="Blockquote" onMouseDown={(e) => { e.preventDefault(); apply(() => root.current && wrapSelection(root.current, 'blockquote')); }}><Quote size={16} /></button>
      <button aria-label="Inline code" title="Inline code" onMouseDown={(e) => { e.preventDefault(); apply(() => root.current && wrapSelection(root.current, 'code')); }}><Braces size={16} /></button>
      <button aria-label="Bullet list" title="Bullet list" onMouseDown={(e) => { e.preventDefault(); list(false); }}><List size={16} /></button>
      <button aria-label="Numbered list" title="Numbered list" onMouseDown={(e) => { e.preventDefault(); list(true); }}><ListOrdered size={16} /></button>
      <button aria-label="Checklist" title="Checklist" onMouseDown={(e) => { e.preventDefault(); list(false, true); }}><ListChecks size={16} /></button>
      <button aria-label="Link" title="Link" onMouseDown={(e) => { e.preventDefault(); openLink(); }}><Link2 size={16} /></button>
      <button aria-label="Insert table" title="Insert table" onMouseDown={(e) => { e.preventDefault(); table(); }}><Table2 size={16} /></button>
      <select aria-label="Table actions" defaultValue="" onChange={(e) => { if (e.target.value) tableAction(e.target.value as Parameters<typeof tableAction>[0]); e.target.value = ''; }}>
        <option value="">Table…</option><option value="row-above">Add row above</option><option value="row-below">Add row below</option><option value="column-left">Add column left</option><option value="column-right">Add column right</option><option value="delete-row">Delete row</option><option value="delete-column">Delete column</option><option value="delete-table">Delete table</option>
      </select>
    </div>}
    <div ref={root} className={styles.editor} contentEditable suppressContentEditableWarning aria-label="Note body" data-placeholder="Start writing…" onInput={changed} onPaste={paste} onDrop={drop} onDragOver={(e) => e.preventDefault()} />
    <div className={styles.dropHint}>Drop images to attach</div>
    {linkOpen && <div className={styles.linkDialog} role="dialog" aria-label="Edit link">
      <label>Text<input value={linkText} onChange={(e) => setLinkText(e.target.value)} /></label>
      <label>URL<input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></label>
      <div><button onClick={removeLink}>Remove</button><button onClick={() => setLinkOpen(false)}>Cancel</button><button className={styles.primary} onClick={applyLink}>Apply</button></div>
    </div>}
  </div>;
}
