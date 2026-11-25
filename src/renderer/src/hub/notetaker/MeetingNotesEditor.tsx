import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '../../ui';

const MAX_IMAGES = 10;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, true> = { 'image/png': true, 'image/jpeg': true, 'image/webp': true, 'image/gif': true, 'image/bmp': true };

function imageCount(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
}

function safeHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const element of [...document.body.querySelectorAll('*')]) {
    if (!['DIV', 'P', 'BR', 'IMG'].includes(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attribute of [...element.attributes]) {
      if (!(element.tagName === 'IMG' && ['src', 'alt'].includes(attribute.name))) element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'IMG' && !/^data:image\/(?:png|jpeg|webp|gif|bmp);base64,/i.test(element.getAttribute('src') ?? '')) element.remove();
  }
  return document.body.innerHTML;
}

interface Props {
  html: string;
  onChange(html: string): void;
  onSave(html: string): Promise<void>;
}

export function MeetingNotesEditor({ html, onChange, onSave }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const count = imageCount(html);

  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = safeHtml(html);
  }, [html]);

  const changed = () => onChange(safeHtml(editor.current?.innerHTML ?? ''));
  const insert = (file: File) => {
    if (!ALLOWED_TYPES[file.type]) {
      setError('Choose a PNG, JPEG, WebP, GIF, or BMP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Each image must be 15 MB or smaller.');
      return;
    }
    if (imageCount(editor.current?.innerHTML ?? '') >= MAX_IMAGES) {
      setError('A meeting note can contain up to 10 images.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = document.createElement('img');
      image.src = String(reader.result);
      image.alt = file.name;
      editor.current?.append(image);
      setError(null);
      changed();
    };
    reader.readAsDataURL(file);
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const images = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault();
    images.forEach(insert);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    [...event.dataTransfer.files].forEach(insert);
  };

  return (
    <div className="meeting-notes-editor">
      <div className="meeting-notes-toolbar">
        <Button size="sm" variant="outline" icon={<ImagePlus size={14} />} onClick={() => input.current?.click()} disabled={count >= MAX_IMAGES}>Insert image</Button>
        <span className="nt-subtle">{count} of {MAX_IMAGES} images · 15 MB each</span>
        <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple onChange={(event) => [...(event.target.files ?? [])].forEach(insert)} />
      </div>
      <div
        ref={editor}
        className="thoughts-editor rich-thoughts-editor"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="My notes"
        data-placeholder="Write your notes here. We'll make a separate summary at the end."
        onInput={changed}
        onPaste={paste}
        onDrop={drop}
        onDragOver={(event) => event.preventDefault()}
        onBlur={() => void onSave(safeHtml(editor.current?.innerHTML ?? '')).catch(() => setError("Couldn't save changes."))}
      />
      {error && <span role="alert" className="save-failed">{error}</span>}
    </div>
  );
}
