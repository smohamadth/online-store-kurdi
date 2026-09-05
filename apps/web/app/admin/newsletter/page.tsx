'use client';

import { useEffect, useState } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

export default function AdminNewsletterPage() {
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authHttp
      .get<{ count: number; subscribers: string[] }>('/newsletter/subscribers')
      .then((res) => setEmails(res.data?.subscribers || []))
      .catch((e) => setError(errorMessage(e, 'Could not load subscribers.')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading subscribers…</p>;
  if (error) return <p style={{ color: '#b91c1c' }}>{error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Newsletter subscribers</h2>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        {emails.length} currently subscribed. Unsubscribed addresses are not listed.
      </p>
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12 }}>Email</th>
            </tr>
          </thead>
          <tbody>
            {emails.length === 0 && (
              <tr>
                <td style={{ padding: 24, color: '#666' }}>No subscribers yet.</td>
              </tr>
            )}
            {emails.map((e) => (
              <tr key={e} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: 12, fontSize: 14 }}>{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
