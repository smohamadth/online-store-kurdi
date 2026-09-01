// /admin/inventory/import - the CSV stock import (POST /api/
// inventory/import-csv). The file is parsed server-side
// (parseInventoryCsv); this page uploads it, shows the per-row
// result (applied / skipped / error), and links back to the overview.
'use client';

import { useState, useRef } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

export default function ImportCsvPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await authHttp.post<{ applied: number; results: any[] }>('/inventory/import-csv', text, {
        headers: { 'Content-Type': 'text/csv' },
        rawBody: true,
      });
      setResult({ ok: true, ...res.data });
    } catch (err: any) {
      setResult({ ok: false, error: errorMessage(err), data: err?.response?.data?.data });
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result));
    r.readAsText(f);
  };

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>CSV bulk import</h2>

      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '16px' }}>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          Upload a CSV with one row per SKU. Each line is <code>sku,quantity[,variantSku]</code> where
          quantity is an integer (positive sets the absolute level, negative applies a delta).
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          style={{ marginBottom: '12px' }}
          data-testid="csv-file"
        />
        <textarea
          data-testid="csv-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="SKU-1,25&#10;SKU-2,-3&#10;SHIRT,10,red-m"
          rows={8}
          style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' }}
        />
        <div style={{ marginTop: '12px', textAlign: 'right' }}>
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            data-testid="csv-submit"
            style={{ padding: '10px 20px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: `1px solid ${result.ok ? '#22c55e' : '#ef4444'}` }}>
          {result.ok ? (
            <>
              <p style={{ fontWeight: 600, color: '#22c55e' }}>✓ Imported {result.applied} rows</p>
              <pre style={{ background: '#f9f9f9', padding: '12px', borderRadius: '4px', overflow: 'auto', maxHeight: '300px', fontSize: '12px' }}>
                {JSON.stringify(result.results, null, 2)}
              </pre>
            </>
          ) : (
            <>
              <p style={{ fontWeight: 600, color: '#ef4444' }}>✗ Import failed</p>
              <p style={{ color: '#666' }}>{result.error}</p>
              {result.data && (
                <pre style={{ background: '#fef2f2', padding: '12px', borderRadius: '4px', overflow: 'auto', maxHeight: '300px', fontSize: '12px' }}>
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
