// ---------------------------------------------------------------------------
// /admin/products - the product table + the add/edit modal (the biggest
// form in the admin).
//
// The modal writes through POST/PUT /api/products (the live routes -
// NOT the legacy controller/service). It owns: rich-text description
// (sanitised by the editor AND re-sanitised by the API on write), the
// SEO panel (meta title/description/keywords, slug), the image gallery
// (ImageGalleryUpload -> /api/upload, variants come back per size),
// and the variant quick-add.
//
// The table is a plain fetch of the products list with search +
// category filter; on phones it becomes a horizontal-scroll container
// (the seven columns overflow at 360px).
// ---------------------------------------------------------------------------
'use client';

import { useStoreSettings, formatPrice } from '@/lib/settings';
import RichTextEditor, { htmlToText } from '@/components/RichTextEditor';
import SeoPanel, { SeoValues, slugify, buildMetaTitle, buildMetaDescription, buildKeywords } from '@/components/SeoPanel';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Product, Category, getCategoryEmoji, getImageUrl } from '@/lib/api';
import ImageGalleryUpload from '@/components/ImageGalleryUpload';
import ContentTranslationsEditor from '@/components/ContentTranslationsEditor';
import { PRODUCT_TRANSLATION_FIELDS } from '@/lib/translationFields';
import { API_BASE } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface GalleryImage {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
  variants?: {
    thumbnail?: string;
    medium?: string;
    large?: string;
    zoom?: string;
  };
  sortOrder: number;
}

export default function AdminProductsPage() {
  const { settings } = useStoreSettings();
  // Used to:
  //   1) switch the products list to a horizontal-scroll container with
  //      tightened padding on phones (the seven-column table overflows at
  //      360px);
  //   2) make the add/edit modal full-width on phones instead of fixed
  //      600px (which would clip off the right edge);
  //   3) collapse the 1fr/1fr/1fr form rows into a single column so the
  //      three inputs each get the full viewport width.
  const isMobile = useIsMobile(640);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saveError, setSaveError] = useState('');
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [productImages, setProductImages] = useState<GalleryImage[]>([]);

  // Form state
  const [seo, setSeo] = useState<SeoValues>({
    metaTitle: '', metaDescription: '', metaKeywords: [], slug: '',
  });

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    shortDescription: '',
    price: '',
    compareAtPrice: '',
    quantity: '',
    categoryId: '',
    type: 'physical',
    status: 'active',
    // Digital-product fields. Only sent to the API when
    // type === 'digital'. Empty strings clear the field on save.
    downloadUrl: '',
    downloadLimit: '',
    downloadExpiry: '',
  });

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await api.getCategories();
      if (response.data && Array.isArray(response.data)) {
        setCategories(response.data);
      }
    } catch (err) {
      console.log('Categories API not available');
    }
  };

  const fetchProducts = async () => {
    try {
      // Try API first - get ALL products (including drafts)
      let apiProducts: Product[] = [];
      try {
        const response = await api.getProducts({ limit: 100 });
        apiProducts = response.data || [];
        if (apiProducts.length > 0) {
          setApiStatus('connected');
        }
      } catch (err) {
        console.log('API not available');
        setApiStatus('disconnected');
      }

      // Database is the single source of truth. Merging in localStorage
      // "products" made records look saved when they had never reached the
      // server - they vanished on any other device or browser.
      setProducts(apiProducts);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const res = await fetch(`${API_BASE}/products/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || `Delete failed (${res.status})`);
        return;
      }

      fetchProducts();
    } catch (err) {
      console.error('Failed to delete product:', err);
      alert('Failed to delete product');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');

    // The database generates ids. This used to mint a Date.now() id for the
    // localStorage copy and send it to the API as well.
    const productData: any = {
      name: formData.name,
      sku: formData.sku,
      description: formData.description,
      shortDescription: formData.shortDescription,
      // Slug and meta tags come from the SEO panel, which auto-fills them
      // from the product but lets the admin override each one.
      slug: seo.slug || slugify(formData.name),
      metaTitle: seo.metaTitle || null,
      metaDescription: seo.metaDescription || null,
      metaKeywords: seo.metaKeywords,
      price: parseFloat(formData.price) || 0,
      compareAtPrice: formData.compareAtPrice ? parseFloat(formData.compareAtPrice) : null,
      quantity: parseInt(formData.quantity) || 0,
      categoryId: formData.categoryId,
      images: productImages.map(img => ({
        url: img.url,
        alt: img.alt || formData.name,
        isPrimary: img.isPrimary,
        thumbnail: img.variants?.thumbnail || null,
        medium: img.variants?.medium || null,
        large: img.variants?.large || null,
        zoom: img.variants?.zoom || null,
      })),
      variants: [],
      status: formData.status,
      type: formData.type,
      averageRating: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Digital-product fields. Only sent when the type is
    // "digital" so a physical product never accidentally gets a
    // downloadUrl. Empty strings are normalised to null so a
    // clear() on the input actually clears the column.
    if (formData.type === 'digital') {
      productData.downloadUrl = formData.downloadUrl.trim() || null;
      productData.downloadLimit =
        formData.downloadLimit !== '' && Number(formData.downloadLimit) > 0
          ? Number(formData.downloadLimit)
          : null;
      productData.downloadExpiry =
        formData.downloadExpiry !== '' && Number(formData.downloadExpiry) > 0
          ? Number(formData.downloadExpiry)
          : null;
    }

    // Try API first
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const url = editingProduct 
          ? `${API_BASE}/products/${editingProduct.id}`
          : `${API_BASE}/products`;

        const response = await fetch(url, {
          method: editingProduct ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(productData),
        });

        if (response.ok) {
          setShowAddModal(false);
          setEditingProduct(null);
          resetForm();
          fetchProducts();
          return;
        }

        // Show the real reason instead of pretending the save worked.
        const err = await response.json().catch(() => ({}));
        const detail = Array.isArray(err.errors) && err.errors.length
          ? err.errors.map((e: any) => `${e.field}: ${e.message}`).join(', ')
          : err.message || `Request failed (${response.status})`;
        setSaveError(detail);
        return;
      }

      setSaveError('You are signed out. Please sign in again.');
    } catch (err) {
      // Previously this silently wrote to localStorage and closed the modal,
      // so the product looked saved but never reached the database.
      setSaveError('Could not reach the server. The product was NOT saved.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      description: '',
      shortDescription: '',
      price: '',
      compareAtPrice: '',
      quantity: '',
      categoryId: '',
      type: 'physical',
      status: 'active',
      downloadUrl: '',
      downloadLimit: '',
      downloadExpiry: '',
    });
    setProductImages([]);
    setSeo({ metaTitle: '', metaDescription: '', metaKeywords: [], slug: '' });
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      description: product.description,
      shortDescription: product.shortDescription || '',
      price: String(product.price),
      compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : '',
      quantity: String(product.quantity),
      categoryId: product.category?.id || '',
      type: product.type,
      status: product.status,
      downloadUrl: (product as any).downloadUrl || '',
      downloadLimit: (product as any).downloadLimit
        ? String((product as any).downloadLimit)
        : '',
      downloadExpiry: (product as any).downloadExpiry
        ? String((product as any).downloadExpiry)
        : '',
    });

    // Load stored SEO, falling back to generated values for products created
    // before the SEO panel existed (their meta columns are empty).
    const p: any = product;
    let storedKeywords: string[] = [];
    try {
      const raw = p.metaKeywords;
      storedKeywords = Array.isArray(raw) ? raw : raw ? JSON.parse(raw) : [];
    } catch {
      storedKeywords = [];
    }
    setSeo({
      metaTitle: p.metaTitle || buildMetaTitle(product.name, settings.storeName),
      metaDescription: p.metaDescription || buildMetaDescription(product.description || '', product.name),
      metaKeywords: storedKeywords.length ? storedKeywords : buildKeywords(product.name, product.category?.name, product.description),
      slug: product.slug || slugify(product.name),
    });

    // Load existing images into gallery
    if (product.images && product.images.length > 0) {
      setProductImages(product.images.map((img, i) => ({
        id: img.id || `img-${i}`,
        url: getImageUrl(img.url),
        alt: img.alt || product.name,
        isPrimary: img.isPrimary || i === 0,
        sortOrder: img.sortOrder || i,
      })));
    } else {
      setProductImages([]);
    }
    setShowAddModal(true);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <p style={{ color: '#666' }}>Loading products...</p>
      </div>
    );
  }

  return (
    <div>
      {/* API Status */}
      {apiStatus === 'disconnected' && (
        <div style={{
          padding: '16px 24px',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          marginBottom: '24px',
        }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e', marginTop: '4px' }}>
            Products shown are from database. Start API for full functionality: <code>npm run dev:api</code>
          </p>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Products</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>{products.length} total products</p>
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
            onClick={() => { resetForm(); setEditingProduct(null); setShowAddModal(true); }}
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
            + Add Product
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search products by name or SKU..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #e5e5e5',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      {/* Products Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        // `overflow: 'auto'` (was 'hidden'): on a narrow phone the seven
        // columns don't all fit; allow horizontal scroll inside this
        // container instead of overflowing the document. The previous
        // 'hidden' was hiding the problem and letting rows push past
        // the viewport edge.
        overflow: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Product</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>SKU</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Category</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Price</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Stock</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                      position: 'relative',
                    }}>
                      {product.images && product.images.length > 0 && product.images[0]?.url ? (
                        <img 
                          src={getImageUrl(product.images[0].url)} 
                          alt={product.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: '20px' }}>{getCategoryEmoji(product.category?.name)}</span>
                      )}
                      {product.images && product.images.length > 1 && (
                        <div style={{
                          position: 'absolute',
                          bottom: '2px',
                          right: '2px',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          fontSize: '9px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                        }}>
                          +{product.images.length - 1}
                        </div>
                      )}
                    </div>
                    <div>
                      <p style={{ fontWeight: 500 }}>{product.name}</p>
                      <p style={{ fontSize: '12px', color: '#666' }}>{product.type}</p>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>{product.sku}</td>
                <td style={{ padding: '16px', fontSize: '14px' }}>{product.category?.name}</td>
                <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600 }}>
                  {formatPrice(product.price, settings.currencySymbol)}
                  {product.compareAtPrice && (
                    <span style={{ fontSize: '12px', color: '#666', textDecoration: 'line-through', marginLeft: '8px' }}>
                      ${product.compareAtPrice}
                    </span>
                  )}
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  <span style={{
                    color: product.quantity > 10 ? '#22c55e' : product.quantity > 0 ? '#f59e0b' : '#ef4444',
                    fontWeight: 500,
                  }}>
                    {product.quantity}
                  </span>
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '50px',
                    fontSize: '12px',
                    fontWeight: 500,
                    backgroundColor: product.status === 'active' ? '#d1fae5' : '#fef3c7',
                    color: product.status === 'active' ? '#22c55e' : '#f59e0b',
                    textTransform: 'capitalize',
                  }}>
                    {product.status}
                  </span>
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => startEdit(product)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#f5f5f5',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <Link
                      href={`/admin/products/${product.id}/variants`}
                      data-testid={`variants-link-${product.id}`}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#eef2ff',
                        color: '#3730a3',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        textDecoration: 'none',
                      }}
                    >
                      Variants
                    </Link>
                    <button
                      onClick={() => handleDelete(product.id)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#fef2f2',
                        color: '#ef4444',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredProducts.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
            No products found
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: isMobile ? 'flex-start' : 'center',
          zIndex: 1000,
          // On mobile let the scrim scroll; the modal itself is a child
          // that needs the page to scroll when its content is taller
          // than the viewport.
          overflow: 'auto',
        }}>
          <div
            data-testid="product-modal"
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: isMobile ? '16px' : '32px',
              // Was hard-coded 600px, which clipped off the right edge on
              // any phone. On mobile we go full-width with a small
              // margin; on desktop the 600px is fine.
              width: isMobile ? 'calc(100vw - 24px)' : '600px',
              maxWidth: '100%',
              maxHeight: isMobile ? 'none' : '80vh',
              minHeight: isMobile ? '100vh' : 'auto',
              overflow: 'auto',
              marginTop: isMobile ? '12px' : 0,
            }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              {saveError && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                  fontSize: '14px',
                }}>
                  <strong>Not saved.</strong> {saveError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>SKU *</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({...formData, sku: e.target.value})}
                    required
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Description *</label>
                <RichTextEditor
                  value={formData.description}
                  onChange={(html) => setFormData({ ...formData, description: html })}
                  placeholder="Describe this product - features, materials, sizing…"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    required
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Compare Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.compareAtPrice}
                    onChange={(e) => setFormData({...formData, compareAtPrice: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Quantity</label>
                  <input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Category *</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
                    required
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  >
                    <option value="physical">Physical</option>
                    <option value="digital">Digital</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Image Gallery Upload */}
              <div style={{ marginBottom: '24px' }}>
                <ImageGalleryUpload
                  images={productImages}
                  onChange={setProductImages}
                  maxImages={10}
                />
              </div>

              {/* Digital product fields. Only rendered when the
                  type select is "digital" so the physical-product
                  admin doesn't see fields they can't use. */}
              {formData.type === 'digital' && (
                <div
                  data-testid="digital-product-section"
                  style={{
                    marginBottom: '20px',
                    padding: '16px',
                    border: '1px solid #e0e7ff',
                    borderRadius: '8px',
                    backgroundColor: '#eef2ff',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#3730a3',
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>⬇️</span>
                    <span>Digital product</span>
                  </h3>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 500,
                        marginBottom: '4px',
                        color: '#1f2937',
                      }}
                    >
                      Download URL *
                    </label>
                    <input
                      type="url"
                      data-testid="input-download-url"
                      value={formData.downloadUrl}
                      onChange={(e) =>
                        setFormData({ ...formData, downloadUrl: e.target.value })
                      }
                      placeholder="https://example.com/files/ebook.pdf"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #c7d2fe',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                      }}
                    />
                    <p
                      style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginTop: '4px',
                      }}
                    >
                      The file the customer receives. Customers
                      also get a per-order link with the same
                      content.
                    </p>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 500,
                          marginBottom: '4px',
                          color: '#1f2937',
                        }}
                      >
                        Per-order download limit
                      </label>
                      <input
                        type="number"
                        min="1"
                        data-testid="input-download-limit"
                        value={formData.downloadLimit}
                        onChange={(e) =>
                          setFormData({ ...formData, downloadLimit: e.target.value })
                        }
                        placeholder="5"
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid #c7d2fe',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                        }}
                      />
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginTop: '4px',
                        }}
                      >
                        Max downloads per purchase. Blank = unlimited.
                      </p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 500,
                          marginBottom: '4px',
                          color: '#1f2937',
                        }}
                      >
                        Link expiry (days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        data-testid="input-download-expiry"
                        value={formData.downloadExpiry}
                        onChange={(e) =>
                          setFormData({ ...formData, downloadExpiry: e.target.value })
                        }
                        placeholder="30"
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid #c7d2fe',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                        }}
                      />
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginTop: '4px',
                        }}
                      >
                        Days the link stays valid. Blank = no expiry.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <SeoPanel
                  productName={formData.name}
                  descriptionHtml={formData.description}
                  categoryName={categories.find((c: any) => c.id === formData.categoryId)?.name}
                  storeName={settings.storeName}
                  value={seo}
                  onChange={setSeo}
                />
              </div>

              <ContentTranslationsEditor
                entityType="product"
                entityId={editingProduct ? editingProduct.id : null}
                fields={PRODUCT_TRANSLATION_FIELDS}
              />

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingProduct(null); }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#f5f5f5',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
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
                  {editingProduct ? 'Update Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}