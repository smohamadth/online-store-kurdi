'use client';

import { useState, useEffect } from 'react';
import ImageUpload from '@/components/ImageUpload';
import { getImageUrl } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import { LoadingState, ButtonSpinner } from '@/components/Spinner';
import { API_BASE, authHttp, errorMessage } from '@/lib/http';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image: string;
  mobileImage: string | null;
  linkUrl: string | null;
  buttonText: string | null;
  secondaryText: string | null;
  secondaryUrl: string | null;
  badge: string | null;
  textColor: string;
  overlayColor: string;
  align: string;
  position: string;
  sortOrder: number;
  isActive: boolean;
}

const empty = {
  title: '',
  subtitle: '',
  description: '',
  image: '',
  mobileImage: '',
  linkUrl: '/products',
  buttonText: 'Shop Now',
  secondaryText: '',
  secondaryUrl: '',
  badge: '',
  textColor: '#ffffff',
  overlayColor: 'rgba(0,0,0,0.35)',
  align: 'left',
  position: 'hero',
  sortOrder: 0,
  isActive: true,
};

export default function AdminBannersPage() {
  const isMobile = useIsMobile();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [importing, setImporting] = useState(false);
  const getToken = () => localStorage.getItem('token');

  useEffect(() => {
    fetchBanners();
  }, []);

  const notify = (type: string, text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const fetchBanners = async () => {
    try {
      const res = await fetch(`${API_BASE}/banners/all`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBanners(data.data || []);
      }
    } catch {
      notify('error', 'Could not load banners');
    } finally {
      setLoading(false);
    }
  };

  // The homepage falls back to hardcoded slides when the table is empty, which
  // makes the gallery look uneditable. This turns those placeholders into real
  // rows so they can actually be managed.
  const DEFAULTS = [
    { title: 'Discover Amazing Products', subtitle: 'New Season', description: 'Shop the latest electronics, clothing, books and digital products with fast shipping and great support.', linkUrl: '/products', buttonText: 'Shop Now', secondaryText: 'View Deals', secondaryUrl: '/deals', badge: 'Featured', overlayColor: 'linear-gradient(120deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', position: 'hero', sortOrder: 0 },
    { title: 'Up to 50% Off Selected Items', subtitle: 'Limited Time', description: 'Grab the best deals of the season before they are gone.', linkUrl: '/deals', buttonText: 'Browse Deals', overlayColor: 'linear-gradient(120deg,#7f1d1d 0%,#b91c1c 55%,#f97316 100%)', position: 'hero', sortOrder: 1 },
    { title: 'Free Shipping On Orders Over 50', subtitle: 'Every Day', description: 'Fast, tracked delivery straight to your door.', linkUrl: '/products', buttonText: 'Start Shopping', overlayColor: 'linear-gradient(120deg,#064e3b 0%,#047857 60%,#10b981 100%)', position: 'hero', sortOrder: 2 },
    { title: 'New Arrivals', subtitle: 'Just In', linkUrl: '/products?sort=newest', buttonText: 'Explore', overlayColor: 'linear-gradient(120deg,#312e81,#6366f1)', position: 'promo', sortOrder: 0 },
    { title: 'Best Sellers', subtitle: 'Top Rated', linkUrl: '/products?sort=popular', buttonText: 'See All', overlayColor: 'linear-gradient(120deg,#7c2d12,#ea580c)', position: 'promo', sortOrder: 1 },
    { title: 'Clearance', subtitle: 'Final Sale', linkUrl: '/deals', buttonText: 'Save Now', overlayColor: 'linear-gradient(120deg,#0c4a6e,#0ea5e9)', position: 'promo', sortOrder: 2 },
  ];

  const importDefaults = async () => {
    setImporting(true);
    try {
      for (const d of DEFAULTS) {
        const res = await fetch(`${API_BASE}/banners`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ ...d, image: '', isActive: true }),
        });
        if (!res.ok) throw new Error('Import failed');
      }
      notify('success', 'Default slides imported - you can edit them now');
      fetchBanners();
    } catch {
      notify('error', 'Could not import the default slides');
    } finally {
      setImporting(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty, sortOrder: banners.length });
    setShowModal(true);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({
      title: b.title || '',
      subtitle: b.subtitle || '',
      description: b.description || '',
      image: b.image || '',
      mobileImage: b.mobileImage || '',
      linkUrl: b.linkUrl || '',
      buttonText: b.buttonText || '',
      secondaryText: b.secondaryText || '',
      secondaryUrl: b.secondaryUrl || '',
      badge: b.badge || '',
      textColor: b.textColor || '#ffffff',
      overlayColor: b.overlayColor || 'rgba(0,0,0,0.35)',
      align: b.align || 'left',
      position: b.position || 'hero',
      sortOrder: b.sortOrder ?? 0,
      isActive: b.isActive,
    });
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return notify('error', 'Title is required');
    try {
      const payload: any = { ...form, image: form.image || '' };
      const res = await fetch(
        editing ? `${API_BASE}/banners/${editing.id}` : `${API_BASE}/banners`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        notify('success', editing ? 'Banner updated' : 'Banner created');
        setShowModal(false);
        fetchBanners();
      } else {
        const d = await res.json().catch(() => ({}));
        notify('error', d.message || 'Save failed');
      }
    } catch {
      notify('error', 'Network error');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    const res = await fetch(`${API_BASE}/banners/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      notify('success', 'Banner deleted');
      fetchBanners();
    } else notify('error', 'Delete failed');
  };

  const toggleActive = async (b: Banner) => {
    try {
      // The response was previously ignored, so a rejected toggle silently
      // did nothing and the row flipped back on the next refresh.
      await authHttp.put(`/banners/${b.id}`, { isActive: !b.isActive });
      fetchBanners();
    } catch (err) {
      notify('error', errorMessage(err, 'Could not update the banner.'));
    }
  };

  const move = async (b: Banner, dir: -1 | 1) => {
    const group = banners.filter((x) => x.position === b.position);
    const idx = group.findIndex((x) => x.id === b.id);
    const target = idx + dir;
    if (target < 0 || target >= group.length) return;
    // Reorder the array then renumber sequentially. Swapping the two stored
    // values fails when several banners share the same sortOrder (e.g. all 0).
    const reordered = [...group];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    const items = reordered.map((x, i) => ({ id: x.id, sortOrder: i }));
    try {
      await authHttp.put('/banners/bulk/reorder', { items });
      fetchBanners();
    } catch (err) {
      notify('error', errorMessage(err, 'Could not reorder the banners.'));
    }
  };

  const input: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d4d4d4',
    borderRadius: '6px',
    fontSize: '14px',
    marginTop: '6px',
  };
  const label: React.CSSProperties = { fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '2px' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700 }}>Homepage Gallery</h1>
          <p style={{ color: '#666', marginTop: '4px', fontSize: '14px' }}>
            Manage hero slider slides and promotional banners shown on the home page.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ padding: '10px 18px', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          + New Banner
        </button>
      </div>

      {message.text && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: message.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '14px',
          }}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <LoadingState message="Loading banners…" minHeight={260} />
      ) : banners.length === 0 ? (
        <div style={{ marginTop: '32px', padding: '48px', textAlign: 'center', border: '2px dashed #e5e5e5', borderRadius: '12px' }}>
          <div style={{ fontSize: '44px' }}>🖼️</div>
          <h3 style={{ marginTop: '12px', fontWeight: 700 }}>No banners yet</h3>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '6px', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Your homepage is currently showing three <strong>built-in placeholder slides</strong>.
            They are not database records, so there is nothing here to edit yet.
            Import them to turn them into real, editable banners &mdash; or create your own from scratch.
          </p>
          <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={importDefaults}
              disabled={importing}
              style={{
                padding: '11px 20px',
                backgroundColor: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: importing ? 'default' : 'pointer',
                fontWeight: 600,
                opacity: importing ? 0.7 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {importing ? <><ButtonSpinner /> Importing…</> : 'Import the default slides'}
            </button>
            <button onClick={openCreate} style={{ ...btn, padding: '11px 20px' }}>
              Create my own
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '24px', display: 'grid', gap: '14px' }}>
          {banners.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '180px 1fr auto',
                gap: '16px',
                alignItems: 'center',
                border: '1px solid #e5e5e5',
                borderRadius: '10px',
                padding: '14px',
                backgroundColor: '#fff',
                opacity: b.isActive ? 1 : 0.55,
              }}
            >
              <div
                style={{
                  height: '96px',
                  borderRadius: '8px',
                  background: b.image && b.image.trim()
                    ? `url(${getImageUrl(b.image)}) center/cover no-repeat`
                    : b.overlayColor?.includes('gradient')
                    ? b.overlayColor
                    : 'linear-gradient(120deg,#1a1a2e,#16213e)',
                }}
              />
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '16px' }}>{b.title}</strong>
                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#f3f4f6', fontWeight: 700, textTransform: 'uppercase' }}>
                    {b.position}
                  </span>
                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: b.isActive ? '#dcfce7' : '#fee2e2', color: b.isActive ? '#166534' : '#991b1b', fontWeight: 700 }}>
                    {b.isActive ? 'Active' : 'Hidden'}
                  </span>
                </div>
                {b.subtitle && <p style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{b.subtitle}</p>}
                <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                  Link: {b.linkUrl || '—'} · Order: {b.sortOrder}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={() => move(b, -1)} style={btn}>↑</button>
                <button onClick={() => move(b, 1)} style={btn}>↓</button>
                <button onClick={() => toggleActive(b)} style={btn}>{b.isActive ? 'Hide' : 'Show'}</button>
                <button onClick={() => openEdit(b)} style={btn}>Edit</button>
                <button onClick={() => remove(b.id)} style={{ ...btn, color: '#b91c1c', borderColor: '#fca5a5' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '24px',
            overflowY: 'auto',
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
            style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '720px' }}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>
              {editing ? 'Edit Banner' : 'New Banner'}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={label}>Title *</label>
                <input style={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label style={label}>Subtitle (small text above title)</label>
                <input style={input} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={label}>Description</label>
              <textarea style={{ ...input, minHeight: '70px' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div style={{ marginTop: '18px' }}>
              <ImageUpload
                label="Desktop Image (recommended 1920×800)"
                folder="banners"
                currentImage={form.image || undefined}
                onUpload={(url) => setForm({ ...form, image: url })}
              />
            </div>

            <div style={{ marginTop: '18px' }}>
              <ImageUpload
                label="Mobile Image (optional, portrait crop)"
                folder="banners"
                currentImage={form.mobileImage || undefined}
                onUpload={(url) => setForm({ ...form, mobileImage: url })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginTop: '14px' }}>
              <div>
                <label style={label}>Primary button text</label>
                <input style={input} value={form.buttonText} onChange={(e) => setForm({ ...form, buttonText: e.target.value })} />
              </div>
              <div>
                <label style={label}>Primary link URL</label>
                <input style={input} value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/products" />
              </div>
              <div>
                <label style={label}>Secondary button text</label>
                <input style={input} value={form.secondaryText} onChange={(e) => setForm({ ...form, secondaryText: e.target.value })} />
              </div>
              <div>
                <label style={label}>Secondary link URL</label>
                <input style={input} value={form.secondaryUrl} onChange={(e) => setForm({ ...form, secondaryUrl: e.target.value })} />
              </div>
              <div>
                <label style={label}>Badge</label>
                <input style={input} value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="New Season" />
              </div>
              <div>
                <label style={label}>Position</label>
                <select style={input} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                  <option value="hero">Hero slider</option>
                  <option value="promo">Promo grid</option>
                </select>
              </div>
              <div>
                <label style={label}>Text alignment</label>
                <select style={input} value={form.align} onChange={(e) => setForm({ ...form, align: e.target.value })}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div>
                <label style={label}>Text color</label>
                <input type="color" style={{ ...input, height: '42px', padding: '4px' }} value={form.textColor} onChange={(e) => setForm({ ...form, textColor: e.target.value })} />
              </div>
              <div>
                <label style={label}>Background gradient (used if no image)</label>
                <input style={input} value={form.overlayColor} onChange={(e) => setForm({ ...form, overlayColor: e.target.value })} placeholder="linear-gradient(120deg,#1a1a2e,#0f3460)" />
              </div>
              <div>
                <label style={label}>Sort order</label>
                <input type="number" style={input} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '14px' }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (visible on storefront)
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '22px' }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ ...btn, padding: '10px 18px' }}>Cancel</button>
              <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                {editing ? 'Save Changes' : 'Create Banner'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '7px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: '6px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
};
