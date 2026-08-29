'use client';

/**
 * Bulk Import / Export (products & categories).
 *
 * Export: download the full catalogue (CSV or JSON, nested variants and
 * images included) or a one-row template to fill in.
 * Import: pick a file (or paste) -> Preview classifies every row as
 * create / update / error without writing anything -> Commit applies the
 * whole file all-or-nothing. The server re-validates on commit, so the
 * preview is a convenience, not a contract.
 */
import { useState, useRef } from 'react';
import { authHttp, errorMessage, API_BASE, getToken } from '@/lib/http';

type Entity = 'products' | 'categories';
type Format = 'csv' | 'json';

interface PreviewRow {
  row: number;
  status: 'create' | 'update' | 'error';
  sku?: string;
  name?: string;
  category?: string;
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
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const switchEntity = (e: Entity) => {
    setEntity(e);
    setPreview(null);
    setCommitResult(null);
    setError('');
  };

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

  const runPreview = async () => {
    setPreviewBusy(true);
    setError('');
    setCommitResult(null);
    try {
      const res = await authHttp.post<PreviewResult>('/import-export/preview', { entity, format, text });
      setPreview(res.data);
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setPreviewBusy(false);
    }
  };

  const runCommit = async () => {
    setCommitBusy(true);
    setError('');
    try {
      const res = await authHttp.post<CommitResult>('/import-export/commit', { entity, format, text });
      setCommitResult(res.data);
      if (res.data.failed === 0) {
        setPreview(null);
        setText('');
        if (fileRef.current) fileRef.current.value = '';
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
          Bulk-manage products and categories with CSV or JSON files.
        </p>
      </div>

      {/* Entity + format switcher */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['products', 'categories'] as Entity[]).map((e) => (
            <button
              key={e}
              data-testid={`ie-entity-${e}`}
              onClick={() => switchEntity(e)}
              style={entity === e ? { ...primaryBtn, cursor: 'pointer' } : { ...secondaryBtn, cursor: 'pointer' }}
            >
              {e === 'products' ? 'Products' : 'Categories'}
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
            : 'Download every category, including parent links.'}
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
            ? 'Products are matched by SKU: a new SKU creates the product, an existing SKU updates it. Categories are matched by slug, then name.'
            : 'Categories are matched by slug, then name (case-insensitive). The parent column links to an existing category name or slug.'}
          {format === 'csv' ? ' One row per record; nested data (images, variants) travels as JSON strings in its column.' : ''}
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
                  <th style={{ padding: '8px 12px' }}>Name</th>
                  {entity === 'products' && <th style={{ padding: '8px 12px' }}>SKU</th>}
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
