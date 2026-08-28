'use client';

/**
 * Page layout block editor (admin → Pages → edit).
 *
 * Composes a page from ordered blocks - the same model as the home
 * builder, so the admin thinks about "sections" the same way in both
 * places. Each block row is a card with its type-specific fields;
 * up/down/delete controls keep the list ordered.
 *
 * The host (the page edit route) owns the `blocks` array; this
 * component is a pure controlled editor.
 */

import { useState } from 'react';
import RichTextEditor from '@/components/RichTextEditor';
import ImageUpload from '@/components/ImageUpload';
import {
  PageBlock,
  PageBlockType,
  PAGE_BLOCK_TYPES,
  PAGE_BLOCK_LABELS,
  PAGE_BLOCK_ICONS,
  newBlock,
  newBlockId,
} from '@/lib/pageBlocks';

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e0e0e0',
  borderRadius: '6px',
  fontSize: '14px',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
  outline: 'none',
};

const smallSelectStyle: React.CSSProperties = { ...fieldStyle, width: 'auto', padding: '6px 8px', fontSize: '13px' };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#555',
  marginBottom: '4px',
};

const iconButtonStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #e0e0e0',
  borderRadius: '6px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
  color: '#444',
  padding: 0,
};

function BlockFields({
  block,
  onPatch,
}: {
  block: PageBlock;
  onPatch: (config: Record<string, any>) => void;
}) {
  const c = block.config || {};
  const set = (key: string, value: any) => onPatch({ ...c, [key]: value });

  switch (block.type) {
    case 'richText':
      return (
        <RichTextEditor
          value={c.html || ''}
          onChange={(html) => set('html', html)}
          placeholder="Write this section…"
          minHeight={160}
        />
      );

    case 'heading':
      return (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...fieldStyle, flex: 1, minWidth: '180px' }}
            value={c.text || ''}
            onChange={(e) => set('text', e.target.value)}
            placeholder="Section heading"
            data-testid={`page-block-field-${block.id}-text`}
          />
          <select style={smallSelectStyle} value={c.level === 3 ? 3 : 2} onChange={(e) => set('level', Number(e.target.value))}>
            <option value={2}>Large (H2)</option>
            <option value={3}>Small (H3)</option>
          </select>
          <select style={smallSelectStyle} value={c.align || 'left'} onChange={(e) => set('align', e.target.value)}>
            <option value="left">Align left</option>
            <option value="center">Center</option>
            <option value="right">Align right</option>
          </select>
        </div>
      );

    case 'image':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <ImageUpload
            currentImage={c.url || null}
            folder="pages"
            label="Upload image"
            onUpload={(url) => set('url', url)}
          />
          <input
            style={fieldStyle}
            value={c.url || ''}
            onChange={(e) => set('url', e.target.value)}
            placeholder="…or paste an image URL"
          />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              style={{ ...fieldStyle, flex: 1, minWidth: '140px' }}
              value={c.alt || ''}
              onChange={(e) => set('alt', e.target.value)}
              placeholder="Alt text (accessibility)"
            />
            <input
              style={{ ...fieldStyle, flex: 1, minWidth: '140px' }}
              value={c.caption || ''}
              onChange={(e) => set('caption', e.target.value)}
              placeholder="Caption (optional)"
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select style={smallSelectStyle} value={c.align || 'center'} onChange={(e) => set('align', e.target.value)}>
              <option value="left">Align left</option>
              <option value="center">Center</option>
              <option value="right">Align right</option>
            </select>
            <select style={smallSelectStyle} value={c.width || 'full'} onChange={(e) => set('width', e.target.value)}>
              <option value="full">Full width</option>
              <option value="half">Half width</option>
            </select>
          </div>
        </div>
      );

    case 'columns':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Left column</label>
            <RichTextEditor value={c.left || ''} onChange={(html) => set('left', html)} placeholder="Left column…" minHeight={110} />
          </div>
          <div>
            <label style={labelStyle}>Right column</label>
            <RichTextEditor value={c.right || ''} onChange={(html) => set('right', html)} placeholder="Right column…" minHeight={110} />
          </div>
        </div>
      );

    case 'callout':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea
            style={{ ...fieldStyle, minHeight: '64px', resize: 'vertical' }}
            value={c.text || ''}
            onChange={(e) => set('text', e.target.value)}
            placeholder="Short note shown in a coloured box - e.g. a warranty note or shipping reminder."
            data-testid={`page-block-field-${block.id}-text`}
          />
          <select style={smallSelectStyle} value={c.tone || 'info'} onChange={(e) => set('tone', e.target.value)}>
            <option value="info">Blue — information</option>
            <option value="success">Green — good news</option>
            <option value="warning">Amber — heads up</option>
            <option value="danger">Red — important</option>
          </select>
        </div>
      );

    case 'quote':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea
            style={{ ...fieldStyle, minHeight: '70px', resize: 'vertical', fontStyle: 'italic' }}
            value={c.text || ''}
            onChange={(e) => set('text', e.target.value)}
            placeholder="The quote itself"
            data-testid={`page-block-field-${block.id}-text`}
          />
          <input
            style={fieldStyle}
            value={c.attribution || ''}
            onChange={(e) => set('attribution', e.target.value)}
            placeholder="Attribution, e.g. “Dana, shop owner” (optional)"
          />
        </div>
      );

    case 'gallery': {
      const images: { url?: string; caption?: string; alt?: string }[] = Array.isArray(c.images)
        ? c.images
        : [];
      const patchImage = (index: number, patch: Record<string, string>) => {
        const next = images.map((im, i) => (i === index ? { ...im, ...patch } : im));
        set('images', next);
      };
      const removeImage = (index: number) => set('images', images.filter((_, i) => i !== index));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {images.map((im, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) auto',
                gap: '10px',
                alignItems: 'center',
                padding: '10px',
                border: '1px solid #eee',
                borderRadius: '8px',
                backgroundColor: '#fff',
              }}
            >
              <ImageUpload
                currentImage={im.url || undefined}
                folder="pages"
                label={`Image ${i + 1}`}
                onUpload={(url) => patchImage(i, { url })}
              />
              <input
                style={fieldStyle}
                value={im.url || ''}
                onChange={(e) => patchImage(i, { url: e.target.value })}
                placeholder={`…or paste an image URL`}
              />
              <input
                style={fieldStyle}
                value={im.caption || ''}
                onChange={(e) => patchImage(i, { caption: e.target.value })}
                placeholder={`Caption (optional)`}
              />
              <button
                type="button"
                title="Remove image"
                style={{ ...iconButtonStyle, color: '#b91c1c', borderColor: '#fecaca' }}
                onClick={() => removeImage(i)}
                data-testid={`page-block-image-remove-${block.id}-${i}`}
              >
                ✕
              </button>
            </div>
          ))}
          {images.length < 4 && (
            <button
              type="button"
              onClick={() => set('images', [...images, { url: '', caption: '' }])}
              data-testid={`page-block-gallery-add-${block.id}`}
              style={{
                alignSelf: 'flex-start',
                padding: '8px 14px',
                border: '1px dashed #c0c0c0',
                borderRadius: '6px',
                backgroundColor: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                color: '#555',
                cursor: 'pointer',
              }}
            >
              + Add image ({images.length}/4)
            </button>
          )}
        </div>
      );
    }

    case 'cta':
      return (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...fieldStyle, flex: '1 1 140px', minWidth: '140px' }}
            value={c.label || ''}
            onChange={(e) => set('label', e.target.value)}
            placeholder="Button label"
            data-testid={`page-block-field-${block.id}-label`}
          />
          <input
            style={{ ...fieldStyle, flex: '2 1 200px', minWidth: '180px' }}
            value={c.href || ''}
            onChange={(e) => set('href', e.target.value)}
            placeholder="Link, e.g. /contact or /products"
          />
          <select style={smallSelectStyle} value={c.variant || 'primary'} onChange={(e) => set('variant', e.target.value)}>
            <option value="primary">Solid</option>
            <option value="outline">Outline</option>
          </select>
        </div>
      );

    case 'divider':
      return <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>A thin horizontal line. No settings.</p>;

    case 'spacer':
      return (
        <select style={smallSelectStyle} value={c.size || 'md'} onChange={(e) => set('size', e.target.value)}>
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      );

    default:
      return null;
  }
}

export function PageBlocksEditor({
  blocks,
  onChange,
}: {
  blocks: PageBlock[];
  onChange: (blocks: PageBlock[]) => void;
}) {
  // ----- Drag-and-drop reordering ------------------------------------------
  // Native HTML5 DnD (no dependency): the grip handle starts the drag,
  // the cards are the drop targets, and a thin bar marks the insertion
  // point. The up/down buttons remain as a keyboard-friendly fallback.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ index: number; after: boolean } | null>(null);

  const addBlock = (type: PageBlockType) => {
    onChange([...blocks, newBlock(type)]);
  };

  const duplicate = (index: number) => {
    const next = [...blocks];
    next.splice(index + 1, 0, {
      ...next[index],
      id: newBlockId(),
      config: { ...next[index].config },
    });
    onChange(next);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
  };

  const patchConfig = (id: string, config: Record<string, any>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, config } : b)));
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires some data for a drag to start.
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    if (dragIndex === null) return;
    e.preventDefault(); // mark the card as a valid drop target
    e.dataTransfer.dropEffect = 'move';
    // Insert above the card when the cursor is in its top half, below
    // when in the bottom half.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropHint((h) => (h && h.index === index && h.after === after ? h : { index: index, after }));
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndex;
    const after = dropHint?.index === index ? dropHint.after : false;
    setDragIndex(null);
    setDropHint(null);
    if (from === null || from === index) return;
    let to = after ? index + 1 : index;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    if (from < to) to -= 1;
    if (to === from) return; // dropped back on itself
    next.splice(to, 0, moved);
    onChange(next);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropHint(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {blocks.length === 0 && (
        <div
          style={{
            padding: '24px',
            border: '1px dashed #d0d0d0',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#888',
            fontSize: '14px',
          }}
        >
          This page has no sections yet. Add one below - text, headings,
          images, columns, callouts, quotes, galleries, buttons and more.
          Drag sections by the ⠿ handle (or use the arrows) to reorder.
        </div>
      )}

      {blocks.map((block, i) => (
        <div
          key={block.id}
          data-testid={`page-block-${block.id}`}
          data-block-type={block.type}
          onDragOver={handleDragOver(i)}
          onDrop={handleDrop(i)}
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: '#fafafa',
            padding: '12px 14px',
            // The card being dragged fades so the drop hint reads clearly.
            opacity: dragIndex === i ? 0.45 : 1,
          }}
        >
          {dropHint && dropHint.index === i && !dropHint.after && (
            <div
              data-testid={`page-block-drop-above-${block.id}`}
              style={{ height: 3, borderRadius: 2, backgroundColor: 'var(--brand, #111)', margin: '-6px 0 8px' }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <button
              type="button"
              title="Drag to reorder"
              aria-label={`Reorder ${PAGE_BLOCK_LABELS[block.type]} section`}
              draggable
              onDragStart={handleDragStart(i)}
              onDragEnd={handleDragEnd}
              data-testid={`page-block-drag-${block.id}`}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'grab',
                fontSize: '14px',
                color: '#aaa',
                padding: '2px 4px',
                lineHeight: 1,
              }}
            >
              ⠿
            </button>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#555',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                flex: 1,
              }}
            >
              {PAGE_BLOCK_LABELS[block.type]}
            </span>
            <button
              type="button"
              title="Move up"
              style={iconButtonStyle}
              disabled={i === 0}
              onClick={() => move(i, -1)}
              data-testid={`page-block-move-up-${block.id}`}
            >
              ↑
            </button>
            <button
              type="button"
              title="Move down"
              style={iconButtonStyle}
              disabled={i === blocks.length - 1}
              onClick={() => move(i, 1)}
              data-testid={`page-block-move-down-${block.id}`}
            >
              ↓
            </button>
            <button
              type="button"
              title="Duplicate section"
              style={iconButtonStyle}
              onClick={() => duplicate(i)}
              data-testid={`page-block-duplicate-${block.id}`}
            >
              ⧉
            </button>
            <button
              type="button"
              title="Remove section"
              style={{ ...iconButtonStyle, color: '#b91c1c', borderColor: '#fecaca' }}
              onClick={() => remove(block.id)}
              data-testid={`page-block-delete-${block.id}`}
            >
              ✕
            </button>
          </div>
          <BlockFields block={block} onPatch={(config) => patchConfig(block.id, config)} />
          {dropHint && dropHint.index === i && dropHint.after && (
            <div
              data-testid={`page-block-drop-below-${block.id}`}
              style={{ height: 3, borderRadius: 2, backgroundColor: 'var(--brand, #111)', margin: '8px 0 -6px' }}
            />
          )}
        </div>
      ))}

      {/* Visual add-picker: one tap per section type. New sections are
          added with starter content (see defaultBlockConfig) so they are
          visible in the preview immediately. */}
      <div
        style={{
          padding: '12px 14px',
          border: '1px dashed #d0d0d0',
          borderRadius: '8px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '10px' }}>
          Add a section:
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '8px',
          }}
        >
          {PAGE_BLOCK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addBlock(t)}
              data-testid={`page-blocks-add-${t}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 8px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                color: '#333',
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }} aria-hidden="true">
                {PAGE_BLOCK_ICONS[t]}
              </span>
              {PAGE_BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
