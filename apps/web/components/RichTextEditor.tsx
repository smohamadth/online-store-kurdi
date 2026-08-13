'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Lightweight rich text editor built on contentEditable.
 *
 * Deliberately dependency-free: the project has no editor library, and pulling
 * in TipTap/Slate would add a large bundle for what product descriptions need.
 * Output is sanitised HTML that the storefront renders.
 */

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
  'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'A', 'SPAN', 'DIV',
]);

/**
 * Strip anything that could execute. The same sanitiser runs again on the
 * server, but cleaning here keeps the stored value tidy and gives the admin
 * immediate feedback.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html;

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Keep the text, drop the tag.
        const text = doc.createTextNode(child.textContent || '');
        child.replaceWith(text);
        continue;
      }

      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();
        const isSafeHref =
          name === 'href' &&
          !val.startsWith('javascript:') &&
          !val.startsWith('data:');
        const isSafeLinkAttr = name === 'target' || name === 'rel';

        if (!(isSafeHref || isSafeLinkAttr)) {
          child.removeAttribute(attr.name);
        }
      }

      if (child.tagName === 'A') {
        child.setAttribute('rel', 'nofollow noopener');
        child.setAttribute('target', '_blank');
      }

      walk(child);
    }
  };

  walk(root);
  return root.innerHTML;
}

/** Plain text from HTML — used for meta descriptions and length counts. */
export function htmlToText(html: string): string {
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Describe this product…',
  minHeight = 220,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [focused, setFocused] = useState(false);

  // Only write into the DOM when the incoming value differs, otherwise every
  // keystroke would reset the caret to the start of the field.
  useEffect(() => {
    if (ref.current && !focused && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value, focused]);

  const emit = useCallback(() => {
    if (ref.current) onChange(sanitizeHtml(ref.current.innerHTML));
  }, [onChange]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    // execCommand is deprecated but still the only cross-browser way to do
    // this without a dependency, and it is well supported in practice.
    document.execCommand(cmd, false, arg);
    emit();
  };

  const addLink = () => {
    const url = prompt('Link URL (https://…)');
    if (!url) return;
    if (/^javascript:/i.test(url.trim())) {
      alert('That link type is not allowed.');
      return;
    }
    exec('createLink', url);
  };

  const btn = (label: string, title: string, action: () => void, bold = false) => (
    <button
      key={title}
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep the selection
      onClick={action}
      style={{
        minWidth: '32px',
        height: '30px',
        padding: '0 8px',
        border: '1px solid #d9d9d9',
        borderRadius: '5px',
        background: '#fff',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: bold ? 700 : 500,
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );

  const text = htmlToText(value);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '5px',
          flexWrap: 'wrap',
          padding: '8px',
          border: '1px solid #d4d4d4',
          borderBottom: 'none',
          borderRadius: '6px 6px 0 0',
          backgroundColor: '#fafafa',
        }}
      >
        {btn('B', 'Bold', () => exec('bold'), true)}
        {btn('I', 'Italic', () => exec('italic'))}
        {btn('U', 'Underline', () => exec('underline'))}
        <span style={{ width: '1px', background: '#e0e0e0', margin: '0 3px' }} />
        {btn('H2', 'Heading', () => exec('formatBlock', '<h2>'))}
        {btn('H3', 'Subheading', () => exec('formatBlock', '<h3>'))}
        {btn('¶', 'Paragraph', () => exec('formatBlock', '<p>'))}
        <span style={{ width: '1px', background: '#e0e0e0', margin: '0 3px' }} />
        {btn('• List', 'Bullet list', () => exec('insertUnorderedList'))}
        {btn('1. List', 'Numbered list', () => exec('insertOrderedList'))}
        {btn('❝', 'Quote', () => exec('formatBlock', '<blockquote>'))}
        <span style={{ width: '1px', background: '#e0e0e0', margin: '0 3px' }} />
        {btn('🔗', 'Insert link', addLink)}
        {btn('✕', 'Clear formatting', () => exec('removeFormat'))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowSource((s) => !s)}
          style={{
            height: '30px',
            padding: '0 10px',
            border: '1px solid #d9d9d9',
            borderRadius: '5px',
            background: showSource ? '#111' : '#fff',
            color: showSource ? '#fff' : '#111',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          HTML
        </button>
      </div>

      {showSource ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: `${minHeight}px`,
            padding: '12px',
            border: '1px solid #d4d4d4',
            borderRadius: '0 0 6px 6px',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={() => {
            setFocused(false);
            emit();
          }}
          onFocus={() => setFocused(true)}
          onPaste={(e) => {
            // Paste as plain text so Word/Docs markup cannot smuggle styles
            // or scripts into the description.
            e.preventDefault();
            const t = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, t);
          }}
          data-placeholder={placeholder}
          style={{
            minHeight: `${minHeight}px`,
            padding: '12px',
            border: '1px solid #d4d4d4',
            borderRadius: '0 0 6px 6px',
            fontSize: '14px',
            lineHeight: 1.7,
            outline: 'none',
            overflowY: 'auto',
          }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ fontSize: '12px', color: '#888' }}>
          Bold, headings, lists and links. Pasted text is cleaned automatically.
        </span>
        <span style={{ fontSize: '12px', color: '#888' }}>{text.length} characters</span>
      </div>

      <style jsx>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #aaa;
        }
      `}</style>
    </div>
  );
}
