'use client';

/**
 * Admin → Appearance → Home page.
 *
 * Lets an admin reorder, hide, re-word and delete every block on the home
 * page, and add new ones. Everything is persisted to /api/home-sections; the
 * UI never claims success unless the API returned 2xx — a save that fails
 * shows the server's real message and the row stays marked as unsaved.
 */

import { useEffect, useState } from 'react';
import ImageUpload from '@/components/ImageUpload';
import { useIsMobile } from '@/lib/hooks';
import { ButtonSpinner, LoadingState } from '@/components/Spinner';
import { errorMessage, http } from '@/lib/http';
import {
  HomeSection,
  TYPE_LABELS,
  TYPE_ICONS,
  CREATABLE_TYPES,
  fetchHomeSections,
  updateHomeSection,
  reorderHomeSections,
  reorderSectionsByDrop,
  createHomeSection,
  deleteHomeSection,
  resetHomeSections,
} from '@/lib/homeSections';

type Notice = { type: 'success' | 'error'; text: string } | null;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #d4d4d4',
  borderRadius: '6px',
  fontSize: '14px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '6px',
};

export default function HomeBuilder() {
  const isMobile = useIsMobile();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  // Drag-and-drop reordering (native HTML5 DnD, no dependency) - same
  // pattern as the page-block editor: the grip handle starts the drag,
  // the cards are drop targets, a thin bar marks the insertion point.
  // The arrow buttons remain as a keyboard-friendly fallback.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ index: number; after: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('richText');
  const [newKey, setNewKey] = useState('');

  const say = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    if (type === 'success') setTimeout(() => setNotice(null), 4000);
  };

  const load = () =>
    fetchHomeSections()
      .then(setSections)
      .catch((e) => say('error', errorMessage(e, 'Could not load the home page layout.')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsaved = Object.values(dirty).some(Boolean);
    if (!unsaved) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  /** Local edit — marks the row dirty until it is saved. */
  const patchLocal = (id: string, patch: Partial<HomeSection>) => {
    setSections((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty((d) => ({ ...d, [id]: true }));
  };

  const patchConfig = (id: string, patch: Record<string, any>) => {
    setSections((rows) =>
      rows.map((r) => (r.id === id ? { ...r, config: { ...r.config, ...patch } } : r))
    );
    setDirty((d) => ({ ...d, [id]: true }));
  };

  const saveRow = async (row: HomeSection) => {
    setBusyId(row.id);
    try {
      const saved = await updateHomeSection(row.id, {
        title: row.title,
        subtitle: row.subtitle,
        isVisible: row.isVisible,
        config: row.config,
      });
      setSections((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
      setDirty((d) => ({ ...d, [row.id]: false }));
      say('success', `“${row.title || TYPE_LABELS[row.type] || row.key}” saved.`);
    } catch (e) {
      // Never clear the dirty flag here: the change was NOT stored.
      say('error', errorMessage(e, 'Save failed. Nothing was stored.'));
    } finally {
      setBusyId(null);
    }
  };

  /** Visibility toggles save immediately — one click, one round trip. */
  const toggleVisible = async (row: HomeSection) => {
    const next = !row.isVisible;
    setBusyId(row.id);
    try {
      const saved = await updateHomeSection(row.id, { isVisible: next });
      setSections((rows) => rows.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)));
    } catch (e) {
      say('error', errorMessage(e, 'Could not change visibility.'));
    } finally {
      setBusyId(null);
    }
  };

  // Persist a new section order (shared by the arrows and drag-and-drop):
  // optimistic update, roll back so the UI matches the database on failure.
  const applyReorder = async (next: HomeSection[]) => {
    const previous = sections;
    setSections(next); // optimistic
    try {
      const saved = await reorderHomeSections(next.map((s) => s.id));
      setSections(saved);
    } catch (e) {
      setSections(previous); // roll back so the UI matches the database
      say('error', errorMessage(e, 'Could not save the new order.'));
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;

    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    await applyReorder(next);
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
    setDropHint((h) => (h && h.index === index && h.after === after ? h : { index, after }));
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragIndex;
    setDragIndex(null);
    const hint = dropHint;
    setDropHint(null);
    if (d === null || d === index) return;
    const after = !!hint && hint.index === index && hint.after;
    // Index math is unit tested: lib/homeSections.test.ts
    // ("reorderSectionsByDrop - drag-and-drop position math").
    void applyReorder(reorderSectionsByDrop(sections, d, index, after));
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropHint(null);
  };

  const add = async () => {
    const key = newKey.trim() || `${newType}-${Date.now().toString(36)}`;
    setAdding(true);
    try {
      const created = await createHomeSection({
        key,
        type: newType,
        title: TYPE_LABELS[newType] || 'New section',
        config: defaultConfigFor(newType),
      });
      setSections((rows) => [...rows, created]);
      setOpenId(created.id);
      setNewKey('');
      say('success', 'Section added. It is live on the home page.');
    } catch (e) {
      say('error', errorMessage(e, 'Could not add the section.'));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (row: HomeSection) => {
    if (!confirm(`Delete “${row.title || row.key}” from the home page? This cannot be undone.`))
      return;
    setBusyId(row.id);
    try {
      await deleteHomeSection(row.id);
      setSections((rows) => rows.filter((r) => r.id !== row.id));
      say('success', 'Section deleted.');
    } catch (e) {
      say('error', errorMessage(e, 'Could not delete the section.'));
    } finally {
      setBusyId(null);
    }
  };

  const resetAll = async () => {
    if (!confirm('Restore the default home page? Your edits to these blocks will be lost.')) return;
    setLoading(true);
    try {
      const rows = await resetHomeSections();
      setSections(rows);
      setDirty({});
      say('success', 'Home page restored to the shipped layout.');
    } catch (e) {
      say('error', errorMessage(e, 'Reset failed.'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading home page layout…" minHeight={300} />;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div
        style={{
          border: '1px solid #e5e5e5',
          borderRadius: '10px',
          padding: '20px',
          backgroundColor: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3 style={{ fontWeight: 700 }}>Home page blocks</h3>
            <p style={{ fontSize: '13px', color: '#666', marginTop: '4px', maxWidth: '620px' }}>
              Drag-free reordering with the arrows, hide anything you don’t need, and edit the
              wording in place. Every change is stored in the database and appears on the storefront
              immediately.
            </p>
          </div>
          <button
            onClick={resetAll}
            style={{
              padding: '8px 14px',
              border: '1px solid #d4d4d4',
              borderRadius: '6px',
              background: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            Restore default layout
          </button>
        </div>

        {notice && (
          <div
            style={{
              marginTop: '14px',
              padding: '11px 14px',
              borderRadius: '8px',
              fontSize: '14px',
              backgroundColor: notice.type === 'success' ? '#dcfce7' : '#fee2e2',
              color: notice.type === 'success' ? '#166534' : '#991b1b',
            }}
          >
            {notice.text}
          </div>
        )}

        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
          {sections.map((row, i) => {
            const open = openId === row.id;
            const isDirty = dirty[row.id];
            const isDragged = dragIndex === i;
            const hintHere = dropHint && dropHint.index === i && dragIndex !== null && dragIndex !== i;
            const dropBar = (
              <div style={{ height: '4px', borderRadius: '2px', backgroundColor: 'var(--brand, #2563eb)' }} />
            );
            return (
              <span key={row.id} style={{ display: 'block' }}>
                {hintHere && !dropHint!.after && dropBar}
              <div
                data-home-row={row.key}
                onDragOver={handleDragOver(i)}
                onDrop={handleDrop(i)}
                style={{
                  border: `1px solid ${isDirty ? '#f59e0b' : '#eee'}`,
                  borderRadius: '10px',
                  backgroundColor: row.isVisible ? '#fff' : '#fafafa',
                  opacity: isDragged ? 0.45 : row.isVisible ? 1 : 0.72,
                }}
              >
                {/* Row header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 14px',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Drag handle - starts the HTML5 drag */}
                  <span
                    draggable
                    onDragStart={handleDragStart(i)}
                    onDragEnd={handleDragEnd}
                    title="Drag to reorder"
                    aria-label="Drag to reorder"
                    style={{ cursor: 'grab', fontSize: '16px', color: '#999', userSelect: 'none' }}
                  >
                    ⠿
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button
                      aria-label="Move up"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      style={arrowBtn(i === 0)}
                    >
                      ▲
                    </button>
                    <button
                      aria-label="Move down"
                      onClick={() => move(i, 1)}
                      disabled={i === sections.length - 1}
                      style={arrowBtn(i === sections.length - 1)}
                    >
                      ▼
                    </button>
                  </div>

                  <span style={{ fontSize: '20px' }} aria-hidden="true">
                    {TYPE_ICONS[row.type] || '🧩'}
                  </span>

                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                      {row.title || TYPE_LABELS[row.type] || row.key}
                      {isDirty && (
                        <span style={{ color: '#b45309', fontWeight: 600, fontSize: '12px' }}>
                          {' '}
                          • unsaved
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {TYPE_LABELS[row.type] || row.type} · {row.key}
                    </div>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={row.isVisible}
                      disabled={busyId === row.id}
                      onChange={() => toggleVisible(row)}
                    />
                    Visible
                  </label>

                  <button
                    onClick={() => setOpenId(open ? null : row.id)}
                    style={{
                      padding: '7px 12px',
                      border: '1px solid #d4d4d4',
                      borderRadius: '6px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                    }}
                  >
                    {open ? 'Close' : 'Edit'}
                  </button>
                </div>

                {/* Editor */}
                {open && (
                  <div style={{ padding: '0 14px 16px', display: 'grid', gap: '14px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                        gap: '14px',
                      }}
                    >
                      <div>
                        <label style={labelStyle}>Heading</label>
                        <input
                          style={inputStyle}
                          value={row.title || ''}
                          placeholder="Leave empty to hide the heading"
                          onChange={(e) => patchLocal(row.id, { title: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Sub-heading</label>
                        <input
                          style={inputStyle}
                          value={row.subtitle || ''}
                          onChange={(e) => patchLocal(row.id, { subtitle: e.target.value })}
                        />
                      </div>
                    </div>

                    <TypeEditor row={row} patchConfig={patchConfig} isMobile={isMobile} />

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => saveRow(row)}
                        disabled={busyId === row.id}
                        style={{
                          padding: '9px 18px',
                          backgroundColor: '#111',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        {busyId === row.id ? (
                          <>
                            <ButtonSpinner /> Saving…
                          </>
                        ) : (
                          'Save this block'
                        )}
                      </button>
                      <button
                        onClick={() => remove(row)}
                        disabled={busyId === row.id}
                        style={{
                          padding: '9px 16px',
                          border: '1px solid #fca5a5',
                          color: '#b91c1c',
                          borderRadius: '6px',
                          background: '#fff',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
                {hintHere && dropHint!.after && dropBar}
              </span>
            );
          })}
        </div>
      </div>

      {/* Add a block */}
      <div
        style={{
          border: '1px solid #e5e5e5',
          borderRadius: '10px',
          padding: '20px',
          backgroundColor: '#fff',
        }}
      >
        <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>Add a block</h3>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '14px' }}>
          New blocks are appended to the bottom of the page — drag the ⠿ handle (or use the
          arrows) to reorder them.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto',
            gap: '12px',
            alignItems: 'end',
          }}
        >
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={newType} onChange={(e) => setNewType(e.target.value)}>
              {CREATABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_ICONS[t]} {TYPE_LABELS[t] || t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Key (optional)</label>
            <input
              style={inputStyle}
              value={newKey}
              placeholder="auto-generated"
              onChange={(e) => setNewKey(e.target.value)}
            />
          </div>
          <button
            onClick={add}
            disabled={adding}
            style={{
              padding: '10px 20px',
              backgroundColor: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              cursor: 'pointer',
              height: '38px',
            }}
          >
            {adding ? 'Adding…' : 'Add block'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-type config editors                                             */
/* ------------------------------------------------------------------ */

function TypeEditor({
  row,
  patchConfig,
  isMobile,
}: {
  row: HomeSection;
  patchConfig: (id: string, patch: Record<string, any>) => void;
  isMobile: boolean;
}) {
  const cfg = row.config || {};

  const listEditor = (
    field: string,
    columns: { key: string; label: string; width?: string }[],
    blank: Record<string, any>
  ) => {
    const items: any[] = Array.isArray(cfg[field]) ? cfg[field] : [];
    const setItems = (next: any[]) => patchConfig(row.id, { [field]: next });

    return (
      <div>
        <label style={labelStyle}>Items</label>
        <div style={{ display: 'grid', gap: '8px' }}>
          {items.map((it, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '1fr auto'
                  : `${columns.map((c) => c.width || '1fr').join(' ')} auto auto auto`,
                gap: '8px',
                alignItems: 'center',
              }}
            >
              {columns.map((c) => (
                <input
                  key={c.key}
                  style={inputStyle}
                  placeholder={c.label}
                  aria-label={c.label}
                  value={it[c.key] ?? ''}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], [c.key]: e.target.value };
                    setItems(next);
                  }}
                />
              ))}
              {/* Element-level reordering: move this item within the list */}
              <button
                aria-label="Move item up"
                disabled={idx === 0}
                onClick={() => {
                  const next = [...items];
                  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                  setItems(next);
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d4d4d4',
                  borderRadius: '6px',
                  background: idx === 0 ? '#f5f5f5' : '#fff',
                  color: idx === 0 ? '#bbb' : '#444',
                  cursor: idx === 0 ? 'default' : 'pointer',
                }}
              >
                ↑
              </button>
              <button
                aria-label="Move item down"
                disabled={idx === items.length - 1}
                onClick={() => {
                  const next = [...items];
                  [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                  setItems(next);
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d4d4d4',
                  borderRadius: '6px',
                  background: idx === items.length - 1 ? '#f5f5f5' : '#fff',
                  color: idx === items.length - 1 ? '#bbb' : '#444',
                  cursor: idx === items.length - 1 ? 'default' : 'pointer',
                }}
              >
                ↓
              </button>
              <button
                aria-label="Remove item"
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  background: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setItems([...items, { ...blank }])}
          style={{
            marginTop: '8px',
            padding: '7px 14px',
            border: '1px dashed #bbb',
            borderRadius: '6px',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          + Add item
        </button>
      </div>
    );
  };

  const textField = (key: string, label: string, placeholder = '') => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        style={inputStyle}
        value={cfg[key] ?? ''}
        placeholder={placeholder}
        onChange={(e) => patchConfig(row.id, { [key]: e.target.value })}
      />
    </div>
  );

  const twoCol = (children: React.ReactNode) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '14px',
      }}
    >
      {children}
    </div>
  );

  switch (row.type) {
    case 'trustBar':
    case 'features':
      return listEditor(
        'items',
        [
          { key: 'icon', label: 'Icon', width: '70px' },
          { key: 'title', label: 'Title' },
          { key: 'text', label: 'Text', width: '1.4fr' },
        ],
        { icon: '✨', title: '', text: '' }
      );

    case 'testimonials':
      return listEditor(
        'items',
        [
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role' },
          { key: 'rating', label: 'Rating 1-5', width: '90px' },
          { key: 'text', label: 'Quote', width: '2fr' },
        ],
        { name: '', role: 'Verified buyer', rating: 5, text: '' }
      );

    case 'stats':
      return listEditor(
        'items',
        [
          { key: 'value', label: 'Value' },
          { key: 'suffix', label: 'Suffix', width: '90px' },
          { key: 'label', label: 'Label', width: '1.6fr' },
        ],
        { value: '0', suffix: '+', label: '' }
      );

    case 'categories':
    case 'featured':
      return twoCol(
        <>
          {textField('linkText', 'Link text', 'View all →')}
          {textField('linkHref', 'Link URL', '/products')}
        </>
      );

    case 'carouselNew':
    case 'carouselTrending':
      return twoCol(<>{textField('linkHref', 'View-all URL', '/products')}</>);

    case 'dealCountdown':
      return (
        <>
          {twoCol(
            <>
              {textField('badge', 'Badge', 'Deal of the day')}
              {textField('buttonText', 'Button text', 'Shop deals')}
            </>
          )}
          {twoCol(
            <>
              {textField('buttonHref', 'Button URL', '/deals')}
              <div>
                <label style={labelStyle}>Gradient</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="color"
                    aria-label="Gradient start"
                    value={cfg.gradientFrom || '#111827'}
                    onChange={(e) => patchConfig(row.id, { gradientFrom: e.target.value })}
                    style={{ ...inputStyle, height: '38px', padding: '3px' }}
                  />
                  <input
                    type="color"
                    aria-label="Gradient end"
                    value={cfg.gradientTo || '#374151'}
                    onChange={(e) => patchConfig(row.id, { gradientTo: e.target.value })}
                    style={{ ...inputStyle, height: '38px', padding: '3px' }}
                  />
                </div>
              </div>
            </>
          )}
        </>
      );

    case 'newsletter':
      return twoCol(
        <>
          {textField('buttonText', 'Button text', 'Subscribe')}
          {textField('placeholder', 'Input placeholder', 'Enter your email')}
        </>
      );

    case 'gallery': {
      const items: any[] = Array.isArray(cfg.items) ? cfg.items : [];
      const setItems = (next: any[]) => patchConfig(row.id, { items: next });
      return (
        <div style={{ display: 'grid', gap: '16px' }}>
          {twoCol(
            <>
              <div>
                <label style={labelStyle}>Layout</label>
                <select
                  style={inputStyle}
                  value={cfg.layout || 'masonry'}
                  onChange={(e) => patchConfig(row.id, { layout: e.target.value })}
                >
                  <option value="masonry">Masonry (varied heights)</option>
                  <option value="grid">Grid (equal squares)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Columns — {cfg.columns || 4}</label>
                <input
                  type="range"
                  min={2}
                  max={6}
                  value={cfg.columns || 4}
                  onChange={(e) => patchConfig(row.id, { columns: parseInt(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          <div>
            <label style={labelStyle}>Images</label>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
              A tile with no image shows a coloured placeholder, so the gallery never
              looks broken before you upload your own photos.
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              {items.map((it, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '150px 1fr auto',
                    gap: '12px',
                    alignItems: 'start',
                  }}
                >
                  <ImageUpload
                    label=""
                    folder="categories"
                    currentImage={it.image || undefined}
                    onUpload={(url) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], image: url };
                      setItems(next);
                    }}
                  />
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <input
                      style={inputStyle}
                      placeholder="Caption"
                      aria-label={`Gallery caption ${idx + 1}`}
                      value={it.caption ?? ''}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], caption: e.target.value };
                        setItems(next);
                      }}
                    />
                    <input
                      style={inputStyle}
                      placeholder="Link URL (optional) e.g. /category/clothing"
                      aria-label={`Gallery link ${idx + 1}`}
                      value={it.linkUrl ?? ''}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], linkUrl: e.target.value };
                        setItems(next);
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <button
                      aria-label="Move image up"
                      disabled={idx === 0}
                      onClick={() => {
                        const next = [...items];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setItems(next);
                      }}
                      style={arrowBtn(idx === 0)}
                    >
                      ▲
                    </button>
                    <button
                      aria-label="Move image down"
                      disabled={idx === items.length - 1}
                      onClick={() => {
                        const next = [...items];
                        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                        setItems(next);
                      }}
                      style={arrowBtn(idx === items.length - 1)}
                    >
                      ▼
                    </button>
                    <button
                      aria-label="Remove image"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #fca5a5',
                        color: '#b91c1c',
                        background: '#fff',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setItems([...items, { image: '', caption: '', linkUrl: '' }])}
              style={{
                marginTop: '10px',
                padding: '8px 14px',
                border: '1px dashed #bbb',
                borderRadius: '6px',
                background: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              + Add image
            </button>
          </div>
        </div>
      );
    }

    case 'richText':
      return (
        <div>
          <label style={labelStyle}>Content (basic HTML allowed)</label>
          <textarea
            value={cfg.html || ''}
            onChange={(e) => patchConfig(row.id, { html: e.target.value })}
            spellCheck={false}
            placeholder="<p>Tell customers about your shop…</p>"
            style={{ ...inputStyle, minHeight: '160px', fontFamily: 'monospace', fontSize: '13px' }}
          />
          <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
            Scripts, iframes and inline event handlers are stripped by the server before saving.
          </p>
          <div style={{ marginTop: '10px' }}>
            <label style={labelStyle}>Alignment</label>
            <select
              style={inputStyle}
              value={cfg.align === 'center' ? 'center' : 'start'}
              onChange={(e) => patchConfig(row.id, { align: e.target.value })}
            >
              <option value="start">Start (reading order)</option>
              <option value="center">Centered</option>
            </select>
          </div>
        </div>
      );

    case 'custom': {
      // The admin-designed section: same rich content as richText, plus
      // background / padding / width so a whole band of the page can be
      // composed (the storefront renders it with CustomSection).
      const select = (
        key: string,
        label: string,
        options: { value: string; text: string }[],
        fallback: string
      ) => (
        <div>
          <label style={labelStyle}>{label}</label>
          <select
            style={inputStyle}
            value={cfg[key] || fallback}
            onChange={(e) => patchConfig(row.id, { [key]: e.target.value })}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
        </div>
      );
      return (
        <div style={{ display: 'grid', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Content (basic HTML allowed)</label>
            <textarea
              value={cfg.html || ''}
              onChange={(e) => patchConfig(row.id, { html: e.target.value })}
              spellCheck={false}
              placeholder="<p>Design this section…</p>"
              style={{ ...inputStyle, minHeight: '160px', fontFamily: 'monospace', fontSize: '13px' }}
            />
            <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
              Scripts, iframes and inline event handlers are stripped by the server before saving.
            </p>
          </div>
          {twoCol(
            <>
              {select('background', 'Background', [
                { value: 'none', text: 'None (page background)' },
                { value: 'soft', text: 'Soft grey' },
                { value: 'brand', text: 'Brand colour' },
                { value: 'dark', text: 'Dark' },
              ], 'soft')}
              {select('width', 'Content width', [
                { value: 'centered', text: 'Centered column' },
                { value: 'full', text: 'Full width' },
              ], 'centered')}
              {select('padding', 'Vertical padding', [
                { value: 'none', text: 'None' },
                { value: 'small', text: 'Small' },
                { value: 'large', text: 'Large' },
              ], 'large')}
              {select('align', 'Alignment', [
                { value: 'start', text: 'Start (reading order)' },
                { value: 'center', text: 'Centered' },
                { value: 'end', text: 'End (reading order)' },
              ], 'start')}
            </>
          )}
        </div>
      );
    }

    case 'hero': {
      // Design options for the hero band. Nested under `cfg.hero` so the
      // block reads as one unit (lib/heroOptions.ts normalises it on the
      // storefront; anything invalid falls back per key).
      const hero = (cfg.hero || {}) as Record<string, any>;
      const patchHero = (patch: Record<string, any>) =>
        patchConfig(row.id, { hero: { ...hero, ...patch } });
      const heroSelect = (
        key: string,
        label: string,
        options: { value: string; text: string }[],
        fallback: string
      ) => (
        <div>
          <label style={labelStyle}>{label}</label>
          <select
            style={inputStyle}
            value={hero[key] || fallback}
            onChange={(e) => patchHero({ [key]: e.target.value })}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.text}
              </option>
            ))}
          </select>
        </div>
      );
      return (
        <div style={{ display: 'grid', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
            The slides themselves (image, copy, buttons, colours, order) are
            managed in <strong>Admin → Banners</strong> (position “hero”). The
            options below shape how the hero band looks.
          </p>
          {twoCol(
            <>
              {heroSelect('layout', 'Layout', [
                { value: 'slideshow', text: 'Slideshow (rotate through the slides)' },
                { value: 'single', text: 'Single slide, full width (no motion)' },
                { value: 'split', text: 'Split — copy beside the image (no motion)' },
              ], 'slideshow')}
              {heroSelect('height', 'Height', [
                { value: 'compact', text: 'Compact' },
                { value: 'standard', text: 'Standard' },
                { value: 'tall', text: 'Tall' },
              ], 'standard')}
            </>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
            }}
          >
            <input
              type="checkbox"
              id="hero-autoplay"
              checked={hero.autoPlay !== false}
              onChange={(e) => patchHero({ autoPlay: e.target.checked })}
            />
            <label htmlFor="hero-autoplay" style={{ fontWeight: 600 }}>
              Autoplay
            </label>
            <input
              type="range"
              min={3}
              max={10}
              value={hero.intervalSec || 6}
              aria-label="Autoplay interval (seconds)"
              disabled={hero.autoPlay === false}
              onChange={(e) => patchHero({ intervalSec: parseInt(e.target.value) })}
              style={{ flex: 1, marginInlineStart: '6px' }}
            />
            <span style={{ fontSize: '13px', color: '#888', whiteSpace: 'nowrap' }}>
              {hero.intervalSec || 6}s
            </span>
          </div>
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={hero.arrows !== false}
                onChange={(e) => patchHero({ arrows: e.target.checked })}
              />
              Prev/next arrows
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={hero.dots !== false}
                onChange={(e) => patchHero({ dots: e.target.checked })}
              />
              Slide dots
            </label>
          </div>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
            These options apply to the platform hero (the Default theme and
            themes without their own hero). A theme that ships its own hero
            design — Bold, Dawnlight, Minimal, Pulse — keeps its look and
            only honours the “Single” and “Split” layout choices (both show
            the first slide only).
          </p>
        </div>
      );
    }

    case 'faq':
      return <FaqEditor cfg={cfg} patch={(patch) => patchConfig(row.id, patch)} isMobile={isMobile} />;

    case 'logos':
      return <LogosEditor cfg={cfg} patch={(patch) => patchConfig(row.id, patch)} />;

    case 'video':
      return <VideoEditor cfg={cfg} patch={(patch) => patchConfig(row.id, patch)} />;

    case 'comparison':
      return <ComparisonEditor cfg={cfg} patch={(patch) => patchConfig(row.id, patch)} isMobile={isMobile} />;

    case 'quote':
      return <QuoteEditor cfg={cfg} patch={(patch) => patchConfig(row.id, patch)} isMobile={isMobile} />;

    case 'lookbook':
      return <LookbookEditor cfg={cfg} patch={(patch) => patchConfig(row.id, patch)} />;

    case 'showcaseRow':
      return <ShowcaseEditor cfg={cfg} patch={(patch) => patchConfig(row.id, patch)} />;

    case 'promo':
      return (
        <p style={{ fontSize: '13px', color: '#666' }}>
          Tiles for this block are managed in <strong>Admin → Banners</strong> (position “promo”).
        </p>
      );

    case 'bannerStrip':
      return (
        <p style={{ fontSize: '13px', color: '#666' }}>
          The wording, image, colours, buttons and schedule for this banner are edited in{' '}
          <strong>Admin → Banners</strong> (position “Call-to-action banner”). Use the arrows
          here to move it anywhere on the page.
        </p>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Editors for the rich prebuilt blocks (faq, logos, video,           */
/* comparison, quote, lookbook, showcaseRow).                          */
/* ------------------------------------------------------------------ */

function ItemListCard({
  idx,
  children,
  onUp,
  onDown,
  onRemove,
  upDisabled,
  downDisabled,
}: {
  idx: number;
  children: React.ReactNode;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
}) {
  return (
    <div
      style={{
        border: '1px solid #eee',
        borderRadius: '8px',
        padding: '12px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'grid', gap: '8px' }}>{children}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button aria-label="Move item up" disabled={upDisabled} onClick={onUp} style={arrowBtn(upDisabled)}>
          ▲
        </button>
        <button aria-label="Move item down" disabled={downDisabled} onClick={onDown} style={arrowBtn(downDisabled)}>
          ▼
        </button>
        <button
          aria-label="Remove item"
          onClick={onRemove}
          style={{
            padding: '6px 10px',
            border: '1px solid #fca5a5',
            color: '#b91c1c',
            background: '#fff',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function AddItemButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: '8px',
        padding: '8px 14px',
        border: '1px dashed #bbb',
        borderRadius: '6px',
        background: '#fff',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

/** Faq — question/answer accordion items + layout toggles. */
function FaqEditor({
  cfg,
  patch,
  isMobile,
}: {
  cfg: Record<string, any>;
  patch: (patch: Record<string, any>) => void;
  isMobile: boolean;
}) {
  const items: any[] = Array.isArray(cfg.items) ? cfg.items : [];
  const setItems = (next: any[]) => patch({ items: next });
  const row = (i: number) => (
    <div style={{ display: 'grid', gap: '8px' }}>
      <input
        style={inputStyle}
        placeholder="Question"
        aria-label={`Question ${i + 1}`}
        value={items[i]?.q ?? ''}
        onChange={(e) => {
          const next = [...items];
          next[i] = { ...next[i], q: e.target.value };
          setItems(next);
        }}
      />
      <textarea
        style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' }}
        placeholder="Answer"
        aria-label={`Answer ${i + 1}`}
        value={items[i]?.a ?? ''}
        onChange={(e) => {
          const next = [...items];
          next[i] = { ...next[i], a: e.target.value };
          setItems(next);
        }}
      />
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '14px',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={labelStyle}>Columns</label>
          <select
            style={inputStyle}
            value={cfg.columns === 'one' ? 'one' : 'two'}
            onChange={(e) => patch({ columns: e.target.value })}
          >
            <option value="two">Two columns (desktop)</option>
            <option value="one">One column</option>
          </select>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            paddingBottom: '9px',
          }}
        >
          <input
            type="checkbox"
            checked={cfg.openFirst !== false}
            onChange={(e) => patch({ openFirst: e.target.checked })}
          />
          Open the first question on load
        </label>
      </div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {items.map((_, idx) => (
          <ItemListCard
            key={idx}
            idx={idx}
            upDisabled={idx === 0}
            downDisabled={idx === items.length - 1}
            onUp={() => {
              const next = [...items];
              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
              setItems(next);
            }}
            onDown={() => {
              const next = [...items];
              [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
              setItems(next);
            }}
            onRemove={() => setItems(items.filter((_, i) => i !== idx))}
          >
            {row(idx)}
          </ItemListCard>
        ))}
      </div>
      <AddItemButton label="+ Add question" onClick={() => setItems([...items, { q: '', a: '' }])} />
    </div>
  );
}

/** Logos — brand marks (image or wordmark) + grayscale toggle. */
function LogosEditor({
  cfg,
  patch,
}: {
  cfg: Record<string, any>;
  patch: (patch: Record<string, any>) => void;
}) {
  const items: any[] = Array.isArray(cfg.items) ? cfg.items : [];
  const setItems = (next: any[]) => patch({ items: next });
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
        <input
          type="checkbox"
          checked={cfg.grayscale !== false}
          onChange={(e) => patch({ grayscale: e.target.checked })}
        />
        Desaturate logos (even “trusted by” strip)
      </label>
      <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
        Upload a logo image, or leave the image empty and the brand name renders as a wordmark.
      </p>
      <div style={{ display: 'grid', gap: '8px' }}>
        {items.map((_, idx) => (
          <ItemListCard
            key={idx}
            idx={idx}
            upDisabled={idx === 0}
            downDisabled={idx === items.length - 1}
            onUp={() => {
              const next = [...items];
              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
              setItems(next);
            }}
            onDown={() => {
              const next = [...items];
              [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
              setItems(next);
            }}
            onRemove={() => setItems(items.filter((_, i) => i !== idx))}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', alignItems: 'start' }}>
              <ImageUpload
                label=""
                folder="categories"
                currentImage={items[idx]?.image || undefined}
                onUpload={(url) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], image: url };
                  setItems(next);
                }}
              />
              <input
                style={inputStyle}
                placeholder="Brand name (also the image alt text)"
                aria-label={`Brand name ${idx + 1}`}
                value={items[idx]?.name ?? ''}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setItems(next);
                }}
              />
            </div>
          </ItemListCard>
        ))}
      </div>
      <AddItemButton label="+ Add logo" onClick={() => setItems([...items, { name: '', image: '' }])} />
    </div>
  );
}

/** Video — provider URL + playback options. */
function VideoEditor({
  cfg,
  patch,
}: {
  cfg: Record<string, any>;
  patch: (patch: Record<string, any>) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div>
        <label style={labelStyle}>Video URL</label>
        <input
          style={inputStyle}
          value={cfg.url ?? ''}
          placeholder="https://www.youtube.com/watch?v=… · https://vimeo.com/… · https://….mp4"
          onChange={(e) => patch({ url: e.target.value })}
        />
        <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
          YouTube, Vimeo or a direct .mp4/.webm file. The block hides itself until a URL is set.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '14px',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={labelStyle}>Aspect ratio</label>
          <select
            style={inputStyle}
            value={cfg.aspect || '16:9'}
            onChange={(e) => patch({ aspect: e.target.value })}
          >
            <option value="16:9">Widescreen 16:9</option>
            <option value="4:3">Classic 4:3</option>
            <option value="21:9">Cinema 21:9</option>
            <option value="1:1">Square 1:1</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Poster image URL (video file only)</label>
          <input
            style={inputStyle}
            value={cfg.poster ?? ''}
            placeholder="optional"
            onChange={(e) => patch({ poster: e.target.value })}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={Boolean(cfg.autoplay)}
              onChange={(e) =>
                patch(e.target.checked ? { autoplay: true, muted: true } : { autoplay: false })
              }
            />
            Autoplay
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={Boolean(cfg.muted) || Boolean(cfg.autoplay)}
              disabled={Boolean(cfg.autoplay)}
              onChange={(e) => patch({ muted: e.target.checked })}
            />
          Muted
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <input
            type="checkbox"
            checked={Boolean(cfg.loop)}
            onChange={(e) => patch({ loop: e.target.checked })}
          />
          Loop
        </label>
      </div>
      <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
        Autoplay forces the player muted — browsers block unmuted autoplay.
      </p>
    </div>
  );
}

/** Comparison — columns, feature rows with one value per column, highlight. */
function ComparisonEditor({
  cfg,
  patch,
  isMobile,
}: {
  cfg: Record<string, any>;
  patch: (patch: Record<string, any>) => void;
  isMobile: boolean;
}) {
  const cols: any[] = Array.isArray(cfg.columns) ? cfg.columns : [];
  const rows: any[] = Array.isArray(cfg.rows) ? cfg.rows : [];
  const setCols = (next: any[]) => patch({ columns: next });
  const setRows = (next: any[]) => patch({ rows: next });
  const colCount = Math.max(1, cols.length);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div>
        <label style={labelStyle}>Compared items (columns)</label>
        <div style={{ display: 'grid', gap: '8px' }}>
          {cols.map((_, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  style={inputStyle}
                  placeholder={`Column name ${idx + 1} (e.g. Basic)`}
                  aria-label={`Column name ${idx + 1}`}
                  value={cols[idx]?.name ?? ''}
                  onChange={(e) => {
                    const next = [...cols];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setCols(next);
                  }}
                />
                <input
                  style={inputStyle}
                  placeholder="Sub-line (e.g. price)"
                  aria-label={`Column sub-line ${idx + 1}`}
                  value={cols[idx]?.sub ?? ''}
                  onChange={(e) => {
                    const next = [...cols];
                    next[idx] = { ...next[idx], sub: e.target.value };
                    setCols(next);
                  }}
                />
              </div>
              <button
                aria-label={`Remove column ${idx + 1}`}
                onClick={() => setCols(cols.filter((_, i) => i !== idx))}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  background: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setCols([...cols, { name: '', sub: '' }])}
          style={{
            marginTop: '8px',
            padding: '7px 14px',
            border: '1px dashed #bbb',
            borderRadius: '6px',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          + Add item
        </button>
      </div>

      <div>
        <label style={labelStyle}>Feature rows</label>
        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>
          Type <code>true</code> for a ✓ or <code>false</code> for a ✕; anything else shows as
          text. Leave a cell empty for a dash.
        </p>
        <div style={{ display: 'grid', gap: '8px' }}>
          {rows.map((_, ri) => (
            <ItemListCard
              key={ri}
              idx={ri}
              upDisabled={ri === 0}
              downDisabled={ri === rows.length - 1}
              onUp={() => {
                const next = [...rows];
                [next[ri - 1], next[ri]] = [next[ri], next[ri - 1]];
                setRows(next);
              }}
              onDown={() => {
                const next = [...rows];
                [next[ri + 1], next[ri]] = [next[ri], next[ri + 1]];
                setRows(next);
              }}
              onRemove={() => setRows(rows.filter((_, i) => i !== ri))}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : `minmax(120px, 1.2fr) repeat(${colCount}, minmax(70px, 1fr))`,
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <input
                  style={inputStyle}
                  placeholder="Feature label (e.g. Free shipping)"
                  aria-label={`Feature label ${ri + 1}`}
                  value={rows[ri]?.label ?? ''}
                  onChange={(e) => {
                    const next = [...rows];
                    next[ri] = { ...next[ri], label: e.target.value };
                    setRows(next);
                  }}
                />
                {Array.from({ length: colCount }).map((_, ci) => (
                  <input
                    key={ci}
                    style={inputStyle}
                    placeholder={ci === 0 ? 'value' : ''}
                    aria-label={`Row ${ri + 1} column ${ci + 1}`}
                    value={rows[ri]?.values?.[ci] ?? ''}
                    onChange={(e) => {
                      const next = [...rows];
                      const values = Array.isArray(next[ri]?.values) ? [...next[ri].values] : [];
                      values[ci] = e.target.value;
                      next[ri] = { ...next[ri], values };
                      setRows(next);
                    }}
                  />
                ))}
              </div>
            </ItemListCard>
          ))}
        </div>
        <AddItemButton
          label="+ Add feature row"
          onClick={() =>
            setRows([...rows, { label: '', values: Array.from({ length: colCount }, () => '') }])
          }
        />
      </div>

      <div>
        <label style={labelStyle}>Highlighted column</label>
        <select
          style={inputStyle}
          value={cfg.highlight ?? 0}
          onChange={(e) => patch({ highlight: Number(e.target.value) })}
        >
          <option value={0}>None</option>
          {cols.map((_, i) => (
            <option key={i} value={i + 1}>
              Column {i + 1}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Quote — statement + attribution + band background. */
function QuoteEditor({
  cfg,
  patch,
  isMobile,
}: {
  cfg: Record<string, any>;
  patch: (patch: Record<string, any>) => void;
  isMobile: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div>
        <label style={labelStyle}>Quote</label>
        <textarea
          style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
          value={cfg.quote ?? ''}
          onChange={(e) => patch({ quote: e.target.value })}
          placeholder="One powerful sentence about your store or your promise…"
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: '14px',
        }}
      >
        <div>
          <label style={labelStyle}>Author</label>
          <input
            style={inputStyle}
            value={cfg.author ?? ''}
            onChange={(e) => patch({ author: e.target.value })}
            placeholder="e.g. The founder"
          />
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <input
            style={inputStyle}
            value={cfg.role ?? ''}
            onChange={(e) => patch({ role: e.target.value })}
            placeholder="e.g. Founder, Your Store"
          />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Background</label>
        <select
          style={inputStyle}
          value={cfg.background || 'soft'}
          onChange={(e) => patch({ background: e.target.value })}
        >
          <option value="soft">Soft grey band</option>
          <option value="none">None (page background)</option>
          <option value="brand">Brand colour</option>
          <option value="dark">Dark band</option>
        </select>
      </div>
    </div>
  );
}

/** Lookbook — editorial photo + copy + CTA. */
function LookbookEditor({
  cfg,
  patch,
}: {
  cfg: Record<string, any>;
  patch: (patch: Record<string, any>) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div>
        <label style={labelStyle}>Photo</label>
        <ImageUpload
          label=""
          folder="categories"
          currentImage={cfg.image || undefined}
          onUpload={(url) => patch({ image: url })}
        />
        <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
          The heading and sub-heading above appear on the copy side. No photo? The band shows the
          copy alone, full width.
        </p>
      </div>
      <div>
        <label style={labelStyle}>Description (copy side)</label>
        <textarea
          style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }}
          value={cfg.description ?? ''}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="A sentence or two telling the story of this look / range…"
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '14px',
        }}
      >
        <div>
          <label style={labelStyle}>Photo side</label>
          <select
            style={inputStyle}
            value={cfg.imagePosition === 'end' ? 'end' : 'start'}
            onChange={(e) => patch({ imagePosition: e.target.value })}
          >
            <option value="start">Start (first in reading order)</option>
            <option value="end">End (after the copy)</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Button text</label>
          <input
            style={inputStyle}
            value={cfg.buttonText ?? ''}
            onChange={(e) => patch({ buttonText: e.target.value })}
            placeholder="Shop the look"
          />
        </div>
        <div>
          <label style={labelStyle}>Button URL</label>
          <input
            style={inputStyle}
            value={cfg.linkUrl ?? ''}
            onChange={(e) => patch({ linkUrl: e.target.value })}
            placeholder="/products"
          />
        </div>
      </div>
    </div>
  );
}

/** Showcase — pick a category; the row renders that range's products. */
function ShowcaseEditor({
  cfg,
  patch,
}: {
  cfg: Record<string, any>;
  patch: (patch: Record<string, any>) => void;
}) {
  const [options, setOptions] = useState<{ name: string; slug: string }[]>([]);
  const [listId] = useState(() => `showcase-cats-${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => {
    let alive = true;
    http
      .get<any[]>('/categories')
      .then((r) => alive && setOptions((r.data || []).map((c: any) => ({ name: c.name, slug: c.slug }))))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div>
        <label style={labelStyle}>Category</label>
        <input
          style={inputStyle}
          list={listId}
          value={cfg.category ?? ''}
          onChange={(e) => patch({ category: e.target.value })}
          placeholder={options.length ? 'Pick a category…' : 'Category slug, e.g. clothing'}
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.name}
            </option>
          ))}
        </datalist>
        <p style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
          The block hides itself until a category is chosen. The row uses the theme’s product
          grid and links “View all” to /category/&lt;slug&gt;.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '14px',
          alignItems: 'end',
        }}
      >
        <div>
          <label style={labelStyle}>Products — {cfg.limit || 8}</label>
          <input
            type="range"
            min={4}
            max={12}
            step={2}
            value={cfg.limit || 8}
            onChange={(e) => patch({ limit: parseInt(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={labelStyle}>View-all link text</label>
          <input
            style={inputStyle}
            value={cfg.viewAllText ?? ''}
            onChange={(e) => patch({ viewAllText: e.target.value })}
            placeholder="View all →"
          />
        </div>
      </div>
    </div>
  );
}

function defaultConfigFor(type: string): Record<string, any> {
  switch (type) {
    case 'richText':
      return { html: '<p>Write something about your store here.</p>', align: 'start' };
    case 'custom':
      return {
        html: '<p>Design this section - content, background, spacing and width are all yours.</p>',
        background: 'soft',
        align: 'start',
        padding: 'large',
        width: 'centered',
      };
    case 'trustBar':
    case 'features':
      return {
        items: [
          { icon: '🚚', title: 'Free shipping', text: 'On orders over 50' },
          { icon: '🔒', title: 'Secure checkout', text: 'Encrypted payments' },
        ],
      };
    case 'testimonials':
      return {
        items: [{ name: 'Customer', role: 'Verified buyer', rating: 5, text: 'Great service!' }],
      };
    case 'stats':
      return { items: [{ value: '1000', suffix: '+', label: 'Happy customers' }] };
    case 'gallery':
      return {
        layout: 'masonry',
        columns: 4,
        items: [
          { image: '', caption: 'New arrivals', linkUrl: '/products?sort=newest', tone: '#2563eb' },
          { image: '', caption: 'Best sellers', linkUrl: '/products?sort=popular', tone: '#0ea5e9' },
          { image: '', caption: 'On sale', linkUrl: '/deals', tone: '#f97316' },
          { image: '', caption: 'Shop all', linkUrl: '/products', tone: '#16a34a' },
        ],
      };
    case 'faq':
      return {
        columns: 'two',
        openFirst: true,
        items: [
          { q: 'How long does delivery take?', a: 'Orders usually arrive within 3–5 working days.' },
          { q: 'What is your return policy?', a: 'Unwanted items can be returned within 30 days of delivery.' },
        ],
      };
    case 'logos':
      return {
        grayscale: true,
        items: [
          { name: 'Your brand', image: '' },
          { name: 'Partner one', image: '' },
          { name: 'Partner two', image: '' },
        ],
      };
    case 'video':
      return {
        url: '',
        aspect: '16:9',
        autoplay: false,
        muted: false,
        loop: false,
        poster: '',
      };
    case 'comparison':
      return {
        highlight: 2,
        columns: [
          { name: 'Basic', sub: '' },
          { name: 'Pro', sub: 'Most popular' },
          { name: 'Plus', sub: '' },
        ],
        rows: [
          { label: 'Free shipping', values: ['false', 'true', 'true'] },
          { label: 'Priority support', values: ['false', 'false', 'true'] },
          { label: '30-day returns', values: ['true', 'true', 'true'] },
        ],
      };
    case 'quote':
      return {
        quote:
          'We believe great products start with great people — and end with happy customers.',
        author: 'The team',
        role: 'Your store',
        background: 'soft',
      };
    case 'lookbook':
      return {
        image: '',
        imagePosition: 'start',
        description: '',
        buttonText: 'Shop the look',
        linkUrl: '/products',
      };
    case 'showcaseRow':
      return { category: '', limit: 8, viewAllText: 'View all →' };
    default:
      return {};
  }
}

function arrowBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '26px',
    height: '18px',
    lineHeight: '10px',
    fontSize: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? '#ccc' : '#444',
    padding: 0,
  };
}
