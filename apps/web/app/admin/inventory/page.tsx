'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  variants: any[];
  category: { name: string };
}

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [adjustment, setAdjustment] = useState({ quantity: 0, reason: 'adjustment', notes: '' });
  const [apiConnected, setApiConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, lowStock: 0, outOfStock: 0 });

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await authHttp.get<any[]>('/inventory');
      const allProducts = res.data || [];
      setProducts(allProducts);
      setApiConnected(true);

      setStats({
        total: allProducts.length,
        lowStock: allProducts.filter((p: any) => p.quantity > 0 && p.quantity <= p.lowStockThreshold).length,
        outOfStock: allProducts.filter((p: any) => p.quantity === 0).length,
      });
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!selectedProduct) return;

    try {
      await authHttp.post('/inventory/adjust', {
        productId: selectedProduct.id,
        quantityChange: adjustment.quantity,
        reason: adjustment.reason,
        notes: adjustment.notes,
      });

      setShowAdjustModal(false);
      setAdjustment({ quantity: 0, reason: 'adjustment', notes: '' });
      fetchInventory();
    } catch (err) {
      // Previously a failed adjustment left the modal open with NO message:
      // the admin could not tell whether the stock change had been saved.
      console.error('Failed to adjust stock:', err);
      alert(errorMessage(err, 'Could not adjust stock. Nothing was saved.'));
    }
  };

  const getStockStatus = (quantity: number, threshold: number) => {
    if (quantity === 0) return { label: 'Out of Stock', color: '#ef4444' };
    if (quantity <= threshold) return { label: 'Low Stock', color: '#f59e0b' };
    return { label: 'In Stock', color: '#22c55e' };
  };

  const filteredProducts = products.filter(p => {
    if (filter === 'low_stock') return p.quantity > 0 && p.quantity <= p.lowStockThreshold;
    if (filter === 'out_of_stock') return p.quantity === 0;
    return true;
  });

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading inventory...</div>;
  }

  return (
    <div>
      {/* API Status */}
      {!apiConnected && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Start API to manage inventory: <code>npm run dev:api</code></p>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666' }}>Total Products</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.total}</p>
        </div>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666' }}>Low Stock</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.lowStock}</p>
        </div>
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '14px', color: '#666' }}>Out of Stock</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>{stats.outOfStock}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[
          { value: 'all', label: 'All Products' },
          { value: 'low_stock', label: 'Low Stock' },
          { value: 'out_of_stock', label: 'Out of Stock' },
        ].map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)} style={{ padding: '8px 16px', backgroundColor: filter === f.value ? '#000' : 'white', color: filter === f.value ? '#fff' : '#000', border: '1px solid #e5e5e5', borderRadius: '6px', cursor: 'pointer' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Inventory Table */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Product</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>SKU</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>Stock</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>Threshold</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => {
              const status = getStockStatus(product.quantity, product.lowStockThreshold);
              return (
                <tr key={product.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <td style={{ padding: '16px' }}>
                    <p style={{ fontWeight: 500 }}>{product.name}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>{product.category?.name}</p>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>{product.sku}</td>
                  <td style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>{product.quantity}</td>
                  <td style={{ padding: '16px', textAlign: 'center', color: '#666' }}>{product.lowStockThreshold}</td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <span style={{ padding: '4px 8px', borderRadius: '50px', fontSize: '12px', backgroundColor: `${status.color}20`, color: status.color }}>
                      {status.label}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button onClick={() => { setSelectedProduct(product); setShowAdjustModal(true); }} style={{ padding: '6px 12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Adjust Modal */}
      {showAdjustModal && selectedProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '32px', width: '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>Adjust Stock: {selectedProduct.name}</h3>
            <p style={{ marginBottom: '16px', color: '#666' }}>Current: {selectedProduct.quantity} units</p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Change (negative to decrease)</label>
              <input type="number" value={adjustment.quantity} onChange={(e) => setAdjustment({ ...adjustment, quantity: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Reason</label>
              <select value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}>
                <option value="adjustment">Manual Adjustment</option>
                <option value="restock">Restock</option>
                <option value="return">Return</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdjustModal(false)} style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdjustStock} style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Adjust</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}