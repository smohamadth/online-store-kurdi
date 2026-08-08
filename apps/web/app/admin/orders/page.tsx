'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await api.getOrders(token);
      setOrders(response.data || []);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      // Refresh orders
      fetchOrders();
    } catch (err) {
      console.error('Failed to update order:', err);
      alert('Failed to update order status');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return '#22c55e';
      case 'processing': return '#f59e0b';
      case 'shipped': return '#3b82f6';
      case 'cancelled': return '#ef4444';
      case 'pending': return '#6b7280';
      default: return '#666';
    }
  };

  const filteredOrders = filterStatus === 'all'
    ? orders
    : orders.filter(o => o.status?.toLowerCase() === filterStatus);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <p style={{ color: '#666' }}>Loading orders...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Orders</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>{orders.length} total orders</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: '8px 16px',
              backgroundColor: filterStatus === status ? '#000' : 'white',
              color: filterStatus === status ? '#fff' : '#000',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Order</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Customer</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Date</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Total</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                <td style={{ padding: '16px' }}>
                  <p style={{ fontWeight: 500 }}>#{order.orderNumber || order.id}</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>{order.items?.length || 0} items</p>
                </td>
                <td style={{ padding: '16px' }}>
                  <p style={{ fontWeight: 500 }}>{order.user?.firstName || 'Guest'} {order.user?.lastName || ''}</p>
                  <p style={{ fontSize: '12px', color: '#666' }}>{order.user?.email || 'N/A'}</p>
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                </td>
                <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600 }}>
                  ${Number(order.totalAmount || 0).toFixed(2)}
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <select
                    value={order.status || 'pending'}
                    onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '50px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: `${getStatusColor(order.status)}20`,
                      color: getStatusColor(order.status),
                      border: `1px solid ${getStatusColor(order.status)}40`,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td style={{ padding: '16px', textAlign: 'right' }}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      color: '#000',
                      fontSize: '12px',
                    }}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredOrders.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
            No orders found
          </div>
        )}
      </div>
    </div>
  );
}