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
  const [newType, setNewType] = useState<PageBlockType>('richText');

  const addBlock = () => {
    onChange([...blocks, { id: newBlockId(), type: newType, config: {} }]);
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
          This page has no sections yet. Add one below - text, images, callouts,
          columns and buttons.
        </div>
      )}

      {blocks.map((block, i) => (
        <div
          key={block.id}
          data-testid={`page-block-${block.id}`}
          data-block-type={block.type}
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: '#fafafa',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
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
              title="Remove section"
              style={{ ...iconButtonStyle, color: '#b91c1c', borderColor: '#fecaca' }}
              onClick={() => remove(block.id)}
              data-testid={`page-block-delete-${block.id}`}
            >
              ✕
            </button>
          </div>
          <BlockFields block={block} onPatch={(config) => patchConfig(block.id, config)} />
        </div>
      ))}

      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '12px 14px',
          border: '1px dashed #d0d0d0',
          borderRadius: '8px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>Add section:</span>
        <select
          style={smallSelectStyle}
          value={newType}
          onChange={(e) => setNewType(e.target.value as PageBlockType)}
          data-testid="page-blocks-type-select"
        >
          {PAGE_BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {PAGE_BLOCK_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addBlock}
          data-testid="page-blocks-add-btn"
          style={{
            padding: '8px 16px',
            backgroundColor: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add section
        </button>
      </div>
    </div>
  );
}
