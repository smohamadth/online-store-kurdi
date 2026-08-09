'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

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
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

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
      const token = localStorage.getItem('token');
      if (!token) return;

      // Try API
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/categories`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data && data.data.length > 0) {
            setCategories(data.data);
            setApiStatus('connected');
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.log('Categories API not available');
      }

      // Fallback to local storage
      const localCategories = JSON.parse(localStorage.getItem('categories') || '[]');
      setCategories(localCategories);
      setApiStatus('disconnected');
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const slug = formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const categoryData = {
      ...formData,
      slug,
      parentId: formData.parentId || null,
    };

    // Try API
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const url = editingCategory
          ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/categories/${editingCategory.id}`
          : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/categories`;

        const response = await fetch(url, {
          method: editingCategory ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(categoryData),
        });

        if (response.ok) {
          setShowModal(false);
          setEditingCategory(null);
          resetForm();
          fetchCategories();
          return;
        }
      }
    } catch (err) {
      console.log('API not available, saving locally');
    }

    // Save locally
    const localCategories = JSON.parse(localStorage.getItem('categories') || '[]');
    const newCategory = {
      id: editingCategory?.id || Date.now().toString(),
      ...categoryData,
      _count: { products: 0 },
      createdAt: new Date().toISOString(),
    };

    if (editingCategory) {
      const index = localCategories.findIndex((c: any) => c.id === editingCategory.id);
      if (index >= 0) localCategories[index] = newCategory;
    } else {
      localCategories.push(newCategory);
    }

    localStorage.setItem('categories', JSON.stringify(localCategories));
    setCategories(localCategories);
    setShowModal(false);
    setEditingCategory(null);
    resetForm();
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Are you sure? Products in this category will be uncategorized.')) return;

    // Try API
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/categories/${categoryId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      console.log('API not available');
    }

    // Remove locally
    const localCategories = JSON.parse(localStorage.getItem('categories') || '[]');
    const updated = localCategories.filter((c: any) => c.id !== categoryId);
    localStorage.setItem('categories', JSON.stringify(updated));
    setCategories(updated);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      parentId: '',
      isActive: true,
      sortOrder: 0,
    });
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

  // Get parent categories (top-level only)
  const parentCategories = categories.filter(c => !c.parentId);

  // Organize categories hierarchically
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
      {apiStatus === 'disconnected' && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Categories saved locally. Start API for database sync.</p>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Categories</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>{categories.length} categories</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingCategory(null); setShowModal(true); }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add Category
        </button>
      </div>

      {/* Categories List */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Slug</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Description</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Products</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hierarchicalCategories.map((category) => (
              <>
                {/* Parent Category */}
                <tr key={category.id} style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fafafa' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>📁 {category.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666', fontFamily: 'monospace' }}>
                    {category.slug}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                    {category.description || '-'}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    {category._count?.products || 0}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '50px',
                      fontSize: '12px',
                      backgroundColor: category.isActive ? '#d1fae5' : '#fef3c7',
                      color: category.isActive ? '#22c55e' : '#f59e0b',
                    }}>
                      {category.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => startEdit(category)}
                        style={{ padding: '6px 12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
                        style={{ padding: '6px 12px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {/* Child Categories */}
                {category.children.map((child) => (
                  <tr key={child.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '16px', paddingLeft: '48px' }}>
                      <span>📂 {child.name}</span>
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#666', fontFamily: 'monospace' }}>
                      {child.slug}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                      {child.description || '-'}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      {child._count?.products || 0}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '50px',
                        fontSize: '12px',
                        backgroundColor: child.isActive ? '#d1fae5' : '#fef3c7',
                        color: child.isActive ? '#22c55e' : '#f59e0b',
                      }}>
                        {child.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => startEdit(child)}
                          style={{ padding: '6px 12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(child.id)}
                          style={{ padding: '6px 12px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
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
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '32px', width: '500px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Category Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  required
                  placeholder="e.g., Electronics"
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  URL Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="auto-generated-from-name"
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px', fontFamily: 'monospace' }}
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Used in URLs: /products?category={formData.slug || 'slug'}
                </p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  placeholder="Brief description of this category"
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Parent Category
                </label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                >
                  <option value="">None (Top Level)</option>
                  {parentCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    <span style={{ fontSize: '14px' }}>Active</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingCategory(null); }}
                  style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {editingCategory ? 'Update Category' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
