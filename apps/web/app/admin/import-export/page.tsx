'use client';

/**
 * Bulk Import / Export (products, categories, customers, orders).
 *
 * Export: download the full catalogue (CSV or JSON, nested variants and
 * images included) or a one-row template to fill in.
 * Import: pick a file (or paste) -> Preview classifies every row as
 * create / update / error without writing anything -> Commit applies the
 * whole file all-or-nothing. The server re-validates on commit, so the
 * preview is a convenience, not a contract.
 *
 * For products you can also attach image files. Reference an attached
 * image from a row's `images` column as `@file:<original filename>` (e.g.
 * `{"url":"@file:photo.jpg"}`); the server uploads it and resolves the
 * placeholder to the served URL. When images are attached the request is
 * sent as multipart to /import-export/import.
 */
import { useState, useRef } from 'react';
import { authHttp, errorMessage, API_BASE, getToken } from '@/lib/http';

type Entity = 'products' | 'categories' | 'customers' | 'orders';
type Format = 'csv' | 'json';

interface PreviewRow {
  row: number;
  status: 'create' | 'update' | 'error';
  sku?: string;
  name?: string;
  email?: string;
  orderNumber?: string;
  errors: string[];
}
interface PreviewResult {
  entity: Entity;
  total: number;
  summary: { create: number; update: number; error: number };
  rows: PreviewRow[];
}
interface CommitRowError {
  row: number;
  sku?: string;
  name?: string;
  email?: string;
  orderNumber?: string;
  errors: string[];
}
interface CommitResult {
  entity: Entity;
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: CommitRowError[];
}

const STATUS_STYLE: Record<PreviewRow['status'], { color: string; bg: string; label: string }> = {
  create: { color: '#16a34a', bg: '#dcfce7', label: 'Create' },
  update: { color: '#2563eb', bg: '#dbeafe', label: 'Update' },
  error: { color: '#dc2626', bg: '#fee2e2', label: 'Error' },
};

const card: React.CSSProperties = {
  background: 'white',
  padding: '20px',
  borderRadius: '8px',
  border: '1px solid #e5e5e5',
  marginBottom: '16px',
};
const primaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  background: '#000',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  background: 'white',
  color: '#000',
  border: '1px solid #000',
  borderRadius: '6px',
  fontWeight: 600,
  cursor: 'pointer',
};

// Small pill used in the preview table to show a row's classification
// (create / update / error). Colours are defined once in STATUS_STYLE so
// the preview table and the summary chips stay visually in sync.
function Badge({ status }: { status: PreviewRow['status'] }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      data-testid={`ie-status-${status}`}
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        color: s.color,
        background: s.bg,
      }}
    >
      {s.label}
    </span>
  );
}

export default function AdminImportExportPage() {
  const [entity, setEntity] = useState<Entity>('products');
  const [format, setFormat] = useState<Format>('csv');
  const [text, setText] = useState('');
  // Image files attached for a product import (referenced as @file:<name>).
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  // Switching entity invalidates any preview or commit result for the
  // previous entity, so clear them to avoid showing stale results for the
  // wrong entity. Images only make sense for products, so drop them too.
  const switchEntity = (e: Entity) => {
    setEntity(e);
    setPreview(null);
    setCommitResult(null);
    setImageFiles([]);
    if (imageRef.current) imageRef.current.value = '';
    setError('');
  };

  // Read the chosen file's text into the textarea (the API parses the raw
  // text, not a multipart upload). Reading as text means the same textarea
  // works for both "pick a file" and "paste contents" flows.
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setText(String(r.result ?? ''));
      setPreview(null);
      setCommitResult(null);
      setError('');
    };
    r.onerror = () => setError('Could not read the selected file.');
    r.readAsText(f);
  };

  // Collect the selected image files (products only). They are sent to the
  // server as multipart and referenced from the file as @file:<filename>.
  const onImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageFiles(Array.from(e.target.files ?? []));
    setPreview(null);
    setCommitResult(null);
    setError('');
  };

  /** Fetch an export as a blob and trigger a browser download. */
  const downloadFile = async (sample: boolean) => {
    setDownloadBusy(true);
    setError('');
    try {
      const token = getToken();
      const res = await fetch(
        `${API_BASE}/import-export/export/${entity}?format=${format}${sample ? '&sample=1' : ''}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        let msg = `Download failed (${res.status})`;
        try {
          msg = (await res.json()).message || msg;
        } catch {
          /* non-JSON error body */
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?$/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] || `${entity}-${sample ? 'template' : 'export'}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err, 'Download failed.'));
    } finally {
      setDownloadBusy(false);
    }
  };

  /** Fetch the one-row template into the textarea so the admin can edit it. */
  const loadTemplate = async () => {
    setDownloadBusy(true);
    setError('');
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/import-export/export/${entity}?format=${format}&sample=1`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setError(`Could not load the template (${res.status}).`);
        return;
      }
      setText(await res.text());
      setPreview(null);
      setCommitResult(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the template.'));
    } finally {
      setDownloadBusy(false);
    }
  };

  /**
   * Run a preview or commit against the server.
   *
   * Plain imports (no attached images, or any non-product entity) post the
   * raw text as JSON to /import-export/preview|commit. A product import with
   * attached image files sends a multipart request to /import-export/import
   * (form fields: entity, format, action, file + one `images` field per file),
   * which uploads the images and resolves `@file:<name>` placeholders in the
   * rows. Returns whichever payload the action produced.
   */
  const sendImport = async (action: 'preview' | 'commit') => {
    const usesMultipart = entity === 'products' && imageFiles.length > 0;
    if (usesMultipart) {
      const fd = new FormData();
      fd.append('entity', entity);
      fd.append('format', format);
      fd.append('action', action);
      fd.append('file', new Blob([text], { type: format === 'csv' ? 'text/csv' : 'application/json' }), `import.${format}`);
      for (const f of imageFiles) fd.append('images', f);
      const token = getToken();
      const res = await fetch(`${API_BASE}/import-export/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        let msg = `Import failed (${res.status})`;
        try {
          msg = (await res.json()).message || msg;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(msg);
      }
      return (await res.json()).data as PreviewResult | CommitResult;
    }
    const path = action === 'preview' ? '/import-export/preview' : '/import-export/commit';
    const res = await authHttp.post<PreviewResult | CommitResult>(path, { entity, format, text });
    return res.data;
  };

  // Dry run: ask the server to parse + validate the file and classify each
  // row as create / update / error. Writes nothing - the admin reviews the
  // result before committing.
  const runPreview = async () => {
    setPreviewBusy(true);
    setError('');
    setCommitResult(null);
    try {
      const data = await sendImport('preview');
      setPreview(data as PreviewResult);
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setPreviewBusy(false);
    }
  };

  // Apply the file for real. The server re-validates the raw text (the
  // preview is a convenience, not a contract) and applies all rows in one
  // all-or-nothing transaction. On success the editor is cleared so the
  // same file can't be re-imported by accident.
  const runCommit = async () => {
    setCommitBusy(true);
    setError('');
    try {
      const data = await sendImport('commit');
      setCommitResult(data as CommitResult);
      if ((data as CommitResult).failed === 0) {
        setPreview(null);
        setText('');
        setImageFiles([]);
        if (fileRef.current) fileRef.current.value = '';
        if (imageRef.current) imageRef.current.value = '';
      }
    } catch (err) {
      setCommitResult(null);
      setError(errorMessage(err));
    } finally {
      setCommitBusy(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Import / Export</h2>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Bulk-manage products, categories, customers and orders with CSV or JSON files.
        </p>
      </div>

      {/* Entity + format switcher */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['products', 'categories', 'customers', 'orders'] as Entity[]).map((e) => (
            <button
              key={e}
              data-testid={`ie-entity-${e}`}
              onClick={() => switchEntity(e)}
              style={entity === e ? { ...primaryBtn, cursor: 'pointer' } : { ...secondaryBtn, cursor: 'pointer' }}
            >
              {e === 'products' ? 'Products' : e === 'categories' ? 'Categories' : e === 'customers' ? 'Customers' : 'Orders'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['csv', 'json'] as Format[]).map((f) => (
            <button
              key={f}
              data-testid={`ie-format-${f}`}
              onClick={() => setFormat(f)}
              style={format === f ? { ...primaryBtn, padding: '8px 16px' } : { ...secondaryBtn, padding: '8px 16px' }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Export */}
      <div style={card}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Export</h3>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          {entity === 'products'
            ? 'Download every product, including variants, images and SEO fields.'
            : entity === 'categories'
              ? 'Download every category, including parent links.'
              : entity === 'customers'
                ? 'Download every customer account and their addresses.'
                : 'Download every order with its customer, line items and shipping address.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button data-testid="ie-export" onClick={() => downloadFile(false)} disabled={downloadBusy} style={primaryBtn}>
            {downloadBusy ? 'Downloading…' : `Download ${format.toUpperCase()} export`}
          </button>
          <button data-testid="ie-export-template" onClick={() => downloadFile(true)} disabled={downloadBusy} style={secondaryBtn}>
            Download template
          </button>
        </div>
      </div>

      {/* Import */}
      <div style={card}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Import</h3>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          {entity === 'products'
            ? 'Products are matched by SKU: a new SKU creates the product, an existing SKU updates it.'
            : entity === 'categories'
              ? 'Categories are matched by slug, then name (case-insensitive). The parent column links to an existing category name or slug.'
              : entity === 'customers'
                ? 'Customers are matched by email (case-insensitive). On create they get a placeholder password to reset later.'
                : 'Orders are matched by orderNumber; a new one creates the order. Items resolve by product SKU, the customer by email (auto-created if missing).'}
          {format === 'csv' ? ' One row per record; nested data (images, variants, items, addresses) travels as JSON strings in its column.' : ''}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <input
            ref={fileRef}
            data-testid="ie-file"
            type="file"
            accept={format === 'csv' ? '.csv,text/csv' : '.json,application/json'}
            onChange={onFile}
          />
          <button data-testid="ie-load-template" onClick={loadTemplate} disabled={downloadBusy} style={secondaryBtn}>
            Paste template
          </button>
        </div>
        {entity === 'products' && (
          <div style={{ marginBottom: '12px', padding: '12px', border: '1px dashed #d0d0d0', borderRadius: '6px' }}>
            <label
              data-testid="ie-images-label"
              style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px', cursor: 'pointer' }}
            >
              Attach product images (optional)
            </label>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 8px' }}>
              Reference an attached file from the <code>images</code> column as{' '}
              <code>{'{"url":"@file:photo.jpg"}'}</code> — the server uploads it and fills in the URL. Files are
              matched by their original filename.
            </p>
            <input
              ref={imageRef}
              data-testid="ie-images"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={onImages}
            />
            {imageFiles.length > 0 && (
              <p data-testid="ie-images-count" style={{ fontSize: '13px', color: '#16a34a', margin: '8px 0 0' }}>
                {imageFiles.length} image{imageFiles.length === 1 ? '' : 's'} attached
              </p>
            )}
          </div>
        )}
        <textarea
          data-testid="ie-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
            setCommitResult(null);
          }}
          placeholder={format === 'csv' ? '…or paste the file contents here' : '…or paste the JSON here'}
          rows={8}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #e5e5e5',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '13px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            data-testid="ie-preview"
            onClick={runPreview}
            disabled={previewBusy || commitBusy || !text.trim()}
            style={{ ...secondaryBtn, opacity: previewBusy || commitBusy || !text.trim() ? 0.5 : 1 }}
          >
            {previewBusy ? 'Checking…' : '1. Preview (no changes)'}
          </button>
          <button
            data-testid="ie-commit"
            onClick={runCommit}
            disabled={commitBusy || previewBusy || !text.trim()}
            style={{ ...primaryBtn, opacity: commitBusy || previewBusy || !text.trim() ? 0.5 : 1 }}
          >
            {commitBusy ? 'Importing…' : '2. Import (all-or-nothing)'}
          </button>
        </div>
        {error && (
          <p data-testid="ie-error" style={{ color: '#dc2626', fontSize: '14px', marginTop: '12px' }}>
            {error}
          </p>
        )}
      </div>

      {/* Preview result */}
      {preview && (
        <div style={{ ...card, borderColor: preview.summary.error > 0 ? '#f59e0b' : '#22c55e' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
            Preview — {preview.total} row{preview.total === 1 ? '' : 's'}
          </h3>
          <div data-testid="ie-summary" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {(
              [
                [preview.summary.create, 'create' as const, 'to create'],
                [preview.summary.update, 'update' as const, 'to update'],
                [preview.summary.error, 'error' as const, preview.summary.error === 1 ? 'error' : 'errors'],
              ] as [number, keyof typeof STATUS_STYLE, string][]
            ).map(([n, st, label]) => (
              <span
                key={st}
                style={{
                  padding: '2px 10px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: STATUS_STYLE[st].color,
                  background: STATUS_STYLE[st].bg,
                }}
              >
                {n} {label}
              </span>
            ))}
          </div>
          {preview.summary.error > 0 ? (
            <p style={{ fontSize: '14px', color: '#92400e', marginBottom: '12px' }}>
              Fix the rows below in your file and try again — with any error present the import commits nothing.
            </p>
          ) : (
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
              Everything looks good. “Import” applies all rows in one transaction.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px 8px 0' }}>Row</th>
                  <th style={{ padding: '8px 12px' }}>{entity === 'orders' ? 'Customer' : 'Name'}</th>
                  {entity === 'products' && <th style={{ padding: '8px 12px' }}>SKU</th>}
                  {entity === 'customers' && <th style={{ padding: '8px 12px' }}>Email</th>}
                  {entity === 'orders' && <th style={{ padding: '8px 12px' }}>Order #</th>}
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Errors</th>
                </tr>
              </thead>
              <tbody data-testid="ie-preview-rows">
                {preview.rows.map((r) => (
                  <tr key={r.row} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px 8px 0', color: '#666' }}>{r.row}</td>
                    <td style={{ padding: '8px 12px' }}>{r.name || '—'}</td>
                    {entity === 'products' && <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.sku || '—'}</td>}
                    {entity === 'customers' && <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.sku || '—'}</td>}
                    {entity === 'orders' && <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.sku || '—'}</td>}
                    <td style={{ padding: '8px 12px' }}>
                      <Badge status={r.status} />
                    </td>
                    <td style={{ padding: '8px 12px', color: '#dc2626' }}>{r.errors.join('; ') || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commit result */}
      {commitResult && (
        <div
          data-testid="ie-commit-result"
          style={{
            ...card,
            borderColor: commitResult.failed === 0 ? '#22c55e' : '#ef4444',
            background: commitResult.failed === 0 ? '#f0fdf4' : '#fef2f2',
          }}
        >
          {commitResult.failed === 0 ? (
            <>
              <p style={{ fontWeight: 600, color: '#16a34a', fontSize: '16px' }}>
                ✓ Imported {commitResult.total} {commitResult.entity}: {commitResult.created} created,{' '}
                {commitResult.updated} updated.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontWeight: 600, color: '#dc2626', fontSize: '16px' }}>
                ✗ Import failed — nothing was imported (all-or-nothing).
              </p>
              <ul style={{ margin: '8px 0 0 20px', color: '#666', fontSize: '14px' }}>
                {commitResult.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}
                    {e.sku ? ` (${e.sku})` : e.name ? ` (${e.name})` : ''}: {e.errors.join('; ')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
