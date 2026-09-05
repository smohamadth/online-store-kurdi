'use client';

import { useEffect, useState } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

type Msg = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
};

export default function AdminContactPage() {
  const [rows, setRows] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authHttp
      .get<Msg[]>('/contact')
      .then((res) => setRows(res.data || []))
      .catch((e) => setError(errorMessage(e, 'Could not load messages.')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading messages…</p>;
  if (error) return <p style={{ color: '#b91c1c' }}>{error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Contact inbox</h2>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        Messages from the storefront contact form. Newest first.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {rows.length === 0 && <p style={{ color: '#666' }}>No messages yet.</p>}
        {rows.map((m) => (
          <article key={m.id} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700 }}>{m.subject}</div>
            <div style={{ fontSize: 13, color: '#666', margin: '4px 0 8px' }}>
              {m.name} · {m.email} · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: 0 }}>{m.message}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
