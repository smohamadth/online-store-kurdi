// /admin/categories - the category tree editor (name, slug, image,
// parent for one level of nesting, sort order, active flag). Delete
// is refused by the API while products reference the category, so the
// error here is expected behaviour, not a bug.
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { http, authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  _count?: { products: number };
  children?: Category[];
}

export default function AdminCategoriesPage() {
  // Used to collapse the name/slug row of the category form on mobile
  // so the inputs get the full viewport width.
  const isMobile = useIsMobile(640);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    parentId: '',
    isActive: true,
    sortOrder: 0,
  });

  useEffect(() => {
    fetchCategories();
  }, []);


  const fetchCategories = async () => {
    try {
      // GET /api/categories is public, no auth needed for reading
      const res = await http.get<any[]>('/categories');
      setCategories(res.data || []);
      setApiConnected(true);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    try {
      const slug = formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      const body = {
        name: formData.name,
        slug,
        description: formData.description || null,
        parentId: formData.parentId || null,
        isActive: formData.isActive,
        sortOrder: formData.sortOrder,
      };

      if (editingCategory) {
        await authHttp.put(`/categories/${editingCategory.id}`, body);
      } else {
        await authHttp.post('/categories', body);
      }

      setMessage({ type: 'success', text: `Category ${editingCategory ? 'updated' : 'created'} successfully!` });
      setShowModal(false);
      setEditingCategory(null);
      resetForm();
      fetchCategories();
    } catch (err) {
      // Shows the server's real reason, e.g. "slug: already exists".
      setMessage({ type: 'error', text: errorMessage(err, 'Failed to save category.') });
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await authHttp.delete(`/categories/${categoryId}`);
      setMessage({ type: 'success', text: 'Category deleted successfully' });
      fetchCategories();
    } catch (err) {
      // e.g. "Cannot delete a category that still has products"
      setMessage({ type: 'error', text: errorMessage(err, 'Failed to delete category.') });
    }
  };

  const resetForm = () => {
    setFormData({ name: '', slug: '', description: '', parentId: '', isActive: true, sortOrder: 0 });
  };

  const startEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      parentId: category.parentId || '',
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    });
    setShowModal(true);
  };

  // Organize categories hierarchically
  const parentCategories = categories.filter(c => !c.parentId);
  const hierarchicalCategories = parentCategories.map(parent => ({
    ...parent,
    children: categories.filter(c => c.parentId === parent.id),
  }));

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading categories...</div>;
  }

  return (
    <div>
      {/* API Status */}
      {!apiConnected && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Start API to manage categories: <code>npm run dev:api</code></p>
        </div>
      )}

      {/* Message */}
      {message.text && (
        <div style={{ padding: '12px 16px', backgroundColor: message.type === 'success' ? '#d1fae5' : '#fef2f2', border: `1px solid ${message.type === 'success' ? '#22c55e' : '#fecaca'}`, borderRadius: '6px', color: message.type === 'success' ? '#22c55e' : '#ef4444', marginBottom: '24px' }}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Categories</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>{categories.length} categories</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link
            href="/admin/import-export"
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#000',
              border: '1px solid #000',
              borderRadius: '6px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ⇅ Import / Export
          </Link>
          <button
            onClick={() => { resetForm(); setEditingCategory(null); setShowModal(true); }}
            style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Add Category
          </button>
        </div>
      </div>

      {/* Categories Table */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Slug</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Products</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hierarchicalCategories.map((category) => (
              <React.Fragment key={category.id}>
                <tr style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fafafa' }}>
                  <td style={{ padding: '16px', fontWeight: 600 }}>📁 {category.name}</td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666', fontFamily: 'monospace' }}>{category.slug}</td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>{category._count?.products || 0}</td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '50px', fontSize: '12px', backgroundColor: category.isActive ? '#d1fae5' : '#fef3c7', color: category.isActive ? '#22c55e' : '#f59e0b' }}>
                      {category.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button onClick={() => startEdit(category)} style={{ padding: '6px 12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '8px' }}>Edit</button>
                    <button onClick={() => handleDelete(category.id)} style={{ padding: '6px 12px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                  </td>
                </tr>
                {category.children?.map((child) => (
                  <tr key={child.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '16px', paddingLeft: '48px' }}>📂 {child.name}</td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#666', fontFamily: 'monospace' }}>{child.slug}</td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>{child._count?.products || 0}</td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '50px', fontSize: '12px', backgroundColor: child.isActive ? '#d1fae5' : '#fef3c7', color: child.isActive ? '#22c55e' : '#f59e0b' }}>
                        {child.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <button onClick={() => startEdit(child)} style={{ padding: '6px 12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '8px' }}>Edit</button>
                      <button onClick={() => handleDelete(child.id)} style={{ padding: '6px 12px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {categories.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: '#666' }}>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>No categories yet</p>
            <p style={{ fontSize: '14px' }}>Create your first category to organize products</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: isMobile ? 'flex-start' : 'center', zIndex: 1000, overflow: 'auto' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '500px', maxWidth: '100%', maxHeight: isMobile ? 'none' : '80vh', minHeight: isMobile ? '100vh' : 'auto', overflow: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Category Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>URL Slug</label>
                <input type="text" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder="auto-generated-from-name" style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px', fontFamily: 'monospace' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Parent Category</label>
                <select value={formData.parentId} onChange={(e) => setFormData({ ...formData, parentId: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}>
                  <option value="">None (Top Level)</option>
                  {parentCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Sort Order</label>
                  <input type="number" value={formData.sortOrder} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} />
                    <span style={{ fontSize: '14px' }}>Active</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowModal(false); setEditingCategory(null); }} style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                  {editingCategory ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
