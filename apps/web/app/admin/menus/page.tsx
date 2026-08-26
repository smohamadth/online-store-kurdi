'use client';

import React, { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/http';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

interface MenuItem {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  target: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  children?: MenuItem[];
}

interface Menu {
  id: string;
  name: string;
  location: string;
  isActive: boolean;
  items: MenuItem[];
  _count?: { items: number };
}

export default function AdminMenusPage() {
  const isMobile = useIsMobile();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const getToken = () => localStorage.getItem('token');

  const [menuForm, setMenuForm] = useState({ name: '', location: 'header' });
  const [itemForm, setItemForm] = useState({
    label: '',
    url: '',
    icon: '',
    target: '_self' as '_self' | '_blank',
    parentId: '',
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    fetchMenus();
  }, []);

  const fetchMenus = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/menus`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setMenus(data.data || []);
      }
    } catch (err) {
      console.log('API not available');
    } finally {
      setLoading(false);
    }
  };

  const fetchMenuDetails = async (menuId: string) => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/menus/${menuId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedMenu(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch menu details');
    }
  };

  const handleCreateMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/menus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(menuForm),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Menu created successfully!' });
        setShowMenuModal(false);
        setMenuForm({ name: '', location: 'header' });
        fetchMenus();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.message || 'Failed to create menu' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const handleDeleteMenu = async (menuId: string) => {
    if (!confirm('Are you sure you want to delete this menu and all its items?')) return;

    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/menus/${menuId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Menu deleted successfully' });
        setSelectedMenu(null);
        fetchMenus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete menu' });
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMenu) return;

    try {
      const token = getToken();
      if (!token) return;

      const url = editingItem
        ? `${API_BASE}/menus/items/${editingItem.id}`
        : `${API_BASE}/menus/${selectedMenu.id}/items`;

      const response = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...itemForm,
          parentId: itemForm.parentId || null,
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: `Menu item ${editingItem ? 'updated' : 'added'} successfully!` });
        setShowItemModal(false);
        setEditingItem(null);
        resetItemForm();
        fetchMenuDetails(selectedMenu.id);
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.message || 'Failed to save item' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Delete this menu item?')) return;
    if (!selectedMenu) return;

    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/menus/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Item deleted' });
        fetchMenuDetails(selectedMenu.id);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete item' });
    }
  };

  const resetItemForm = () => {
    setItemForm({
      label: '',
      url: '',
      icon: '',
      target: '_self',
      parentId: '',
      sortOrder: 0,
      isActive: true,
    });
  };

  const startEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      label: item.label,
      url: item.url,
      icon: item.icon || '',
      target: item.target as '_self' | '_blank',
      parentId: item.parentId || '',
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    });
    setShowItemModal(true);
  };

  const getLocationIcon = (location: string) => {
    switch (location) {
      case 'header': return '🔝';
      case 'footer': return '⬇️';
      case 'sidebar': return '📋';
      default: return '📌';
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}><p style={{ color: '#666' }}>Loading menus...</p></div>;
  }

  return (
    <div>
      {message.text && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#22c55e' : '#fecaca'}`,
          borderRadius: '6px',
          color: message.type === 'success' ? '#22c55e' : '#ef4444',
          fontSize: '14px',
          marginBottom: '20px',
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Menu Management</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Create and manage navigation menus for your store</p>
        </div>
        <button
          onClick={() => { setMenuForm({ name: '', location: 'header' }); setShowMenuModal(true); }}
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
          + Create Menu
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '24px' }}>
        {/* Menu List */}
        <div>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e5e5', backgroundColor: '#f9f9f9' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Menus</h3>
            </div>
            {menus.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                <p>No menus yet</p>
                <p style={{ fontSize: '13px', marginTop: '4px' }}>Create your first menu</p>
              </div>
            ) : (
              <div>
                {menus.map((menu) => (
                  <div
                    key={menu.id}
                    onClick={() => fetchMenuDetails(menu.id)}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                      backgroundColor: selectedMenu?.id === menu.id ? '#f0f0f0' : 'white',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: 500, fontSize: '14px' }}>
                        {getLocationIcon(menu.location)} {menu.name}
                      </p>
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                        {menu.location} • {menu._count?.items || 0} items
                      </p>
                    </div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '50px',
                      fontSize: '11px',
                      backgroundColor: menu.isActive ? '#d1fae5' : '#fef3c7',
                      color: menu.isActive ? '#22c55e' : '#f59e0b',
                    }}>
                      {menu.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Menu Items */}
        <div>
          {selectedMenu ? (
            <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e5e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{selectedMenu.name}</h3>
                  <p style={{ fontSize: '13px', color: '#666' }}>Location: {selectedMenu.location}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { resetItemForm(); setEditingItem(null); setShowItemModal(true); }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    + Add Item
                  </button>
                  <button
                    onClick={() => handleDeleteMenu(selectedMenu.id)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#fef2f2',
                      color: '#ef4444',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete Menu
                  </button>
                </div>
              </div>

              {/* Menu Items List */}
              <div style={{ padding: '16px' }}>
                {selectedMenu.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#666' }}>
                    <p>No items in this menu</p>
                    <p style={{ fontSize: '13px', marginTop: '4px' }}>Add items to build your navigation</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedMenu.items.map((item) => (
                      <React.Fragment key={item.id}>
                        <div style={{
                          padding: '12px 16px',
                          border: '1px solid #e5e5e5',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: item.isActive ? 'white' : '#f9f9f9',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {item.icon && <span style={{ fontSize: '18px' }}>{item.icon}</span>}
                            <div>
                              <p style={{ fontWeight: 500, fontSize: '14px' }}>{item.label}</p>
                              <p style={{ fontSize: '12px', color: '#666' }}>{item.url}</p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: '#999', padding: '2px 6px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                              {item.target === '_blank' ? '↗️ New Tab' : '→ Same Tab'}
                            </span>
                            <button
                              onClick={() => startEditItem(item)}
                              style={{ padding: '4px 10px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              style={{ padding: '4px 10px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {/* Children */}
                        {item.children?.map((child) => (
                          <div key={child.id} style={{
                            padding: '10px 16px',
                            border: '1px solid #f0f0f0',
                            borderRadius: '6px',
                            marginLeft: '32px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: child.isActive ? '#fafafa' : '#f5f5f5',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {child.icon && <span style={{ fontSize: '16px' }}>{child.icon}</span>}
                              <div>
                                <p style={{ fontWeight: 500, fontSize: '13px' }}>↳ {child.label}</p>
                                <p style={{ fontSize: '11px', color: '#666' }}>{child.url}</p>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => startEditItem(child)}
                                style={{ padding: '3px 8px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteItem(child.id)}
                                style={{ padding: '3px 8px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
              padding: '64px',
              textAlign: 'center',
              color: '#666',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Select a Menu</h3>
              <p style={{ fontSize: '14px' }}>Choose a menu from the list to manage its items</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Menu Modal */}
      {showMenuModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '400px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Create New Menu</h2>
            <form onSubmit={handleCreateMenu}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Menu Name *</label>
                <input
                  type="text"
                  value={menuForm.name}
                  onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })}
                  placeholder="e.g., Main Navigation"
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Location *</label>
                <select
                  value={menuForm.location}
                  onChange={(e) => setMenuForm({ ...menuForm, location: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                >
                  <option value="header">🔝 Header Navigation</option>
                  <option value="footer">⬇️ Footer Navigation</option>
                  <option value="sidebar">📋 Sidebar Navigation</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowMenuModal(false)} style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Create Menu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showItemModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '500px', maxHeight: '85vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
              {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
            </h2>
            <form onSubmit={handleSaveItem}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Label *</label>
                <input
                  type="text"
                  value={itemForm.label}
                  onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })}
                  placeholder="e.g., Products"
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>URL *</label>
                <input
                  type="text"
                  value={itemForm.url}
                  onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })}
                  placeholder="e.g., /products or https://example.com"
                  required
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Icon (emoji)</label>
                  <input
                    type="text"
                    value={itemForm.icon}
                    onChange={(e) => setItemForm({ ...itemForm, icon: e.target.value })}
                    placeholder="e.g., 📦"
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Open In</label>
                  <select
                    value={itemForm.target}
                    onChange={(e) => setItemForm({ ...itemForm, target: e.target.value as '_self' | '_blank' })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                  >
                    <option value="_self">Same Tab</option>
                    <option value="_blank">New Tab</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Parent Item</label>
                  <select
                    value={itemForm.parentId}
                    onChange={(e) => setItemForm({ ...itemForm, parentId: e.target.value })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                  >
                    <option value="">None (Top Level)</option>
                    {selectedMenu?.items.filter(i => !i.parentId).map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Sort Order</label>
                  <input
                    type="number"
                    value={itemForm.sortOrder}
                    onChange={(e) => setItemForm({ ...itemForm, sortOrder: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm({ ...itemForm, isActive: e.target.checked })} />
                  <span style={{ fontSize: '14px' }}>Active</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowItemModal(false); setEditingItem(null); }} style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                  {editingItem ? 'Update' : 'Add'} Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
