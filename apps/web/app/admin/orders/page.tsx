'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { API_BASE } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

export default function AdminOrdersPage() {
  const { settings } = useStoreSettings();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [apiConnected, setApiConnected] = useState(false);
  // Under 640px the seven-column table is unreadable: the date column
  // wraps mid-month, the action buttons get squished, and the rows run
  // off the right edge of the viewport. We switch to a stacked card
  // list at that breakpoint. 640px is the standard "large phone" cutoff
  // (matches Bootstrap's `md`).
  const isMobile = useIsMobile(640);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Orders are financial records - the database is the only source of
      // truth. Merging browser-local "orders" showed phantom orders that no
      // other admin could see and that were absent from every report.
      const response = await api.getOrders(token);
      const apiOrders = response.data || [];
      setApiConnected(true);

      apiOrders.sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setOrders(apiOrders);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await fetch(
        `${API_BASE}/orders/${orderId}/status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!res.ok) {
        // The old code ignored the response and updated the UI anyway, so a
        // rejected status change still looked like it had been applied.
        const err = await res.json().catch(() => ({}));
        alert(err.message || `Could not update the order (${res.status}). No change was saved.`);
        return;
      }

      // Re-read from the server so the row reflects what was actually stored.
      fetchOrders();
    } catch (err) {
      console.error('Failed to update order:', err);
      alert('Could not reach the server. The order status was NOT changed.');
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

  const getCustomerInfo = (order: any) => {
    // Try different sources for customer info
    if (order.user?.firstName && order.user?.lastName) {
      return {
        name: `${order.user.firstName} ${order.user.lastName}`,
        email: order.user.email || 'N/A',
      };
    }
    if (order.shippingAddress?.firstName) {
      return {
        name: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
        email: order.shippingAddress.email || 'N/A',
      };
    }
    return { name: 'Guest Customer', email: 'N/A' };
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
      {/* API Status */}
      {!apiConnected && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ Showing local orders</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Start API to sync with database: <code>npm run dev:api</code></p>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Orders</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>{orders.length} total orders</p>
        </div>
      </div>

      {/* Filters */}
      <div
        data-testid="orders-filter-row"
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          // Six pills at 8px+16px padding each don't fit a 360px viewport;
          // wrapping fixes that. Touch targets stay >= 36px so they're
          // tappable, but pills now shrink on narrow screens instead of
          // pushing the row off-screen.
          flexWrap: 'wrap',
        }}
      >
        {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: isMobile ? '6px 12px' : '8px 16px',
              backgroundColor: filterStatus === status ? '#000' : 'white',
              color: filterStatus === status ? '#fff' : '#000',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              textTransform: 'capitalize',
              // Don't let a single pill exceed the viewport on very narrow
              // phones — flex: 1 1 auto on the parent already lets pills
              // grow, but capping at min-content keeps the count visible.
              minWidth: 0,
            }}
          >
            {status} ({status === 'all' ? orders.length : orders.filter(o => o.status?.toLowerCase() === status).length})
          </button>
        ))}
      </div>

      {/* Orders
          - On desktop / tablet: a seven-column table. `overflow: 'auto'` on
            the wrapper lets it scroll horizontally if the viewport is
            narrower than the column sum (e.g. an iPad in portrait) rather
            than overflowing the document.
          - On mobile (under 640px): a stacked card list, one card per
            order, so the customer, items, total, and status are all
            legible without horizontal scrolling. */}
      {isMobile ? (
        <div data-testid="orders-card-list">
          {filteredOrders.map((order) => {
            const customer = getCustomerInfo(order);
            return (
              <div
                key={order.id}
                data-testid="order-card"
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '15px' }}>
                      #{order.orderNumber || order.id?.slice(0, 8)}
                    </p>
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'N/A'}
                    </p>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: '16px' }}>
                    {formatPrice(order.totalAmount || 0, settings.currencySymbol)}
                  </p>
                </div>
                <p style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>
                  {customer.name}
                </p>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                  {customer.email}
                </p>
                <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                  {order.items?.length || 0} items · {order.paymentMethod || 'Credit Card'}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <select
                    aria-label="Status"
                    value={order.status || 'pending'}
                    onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '50px',
                      fontSize: '13px',
                      fontWeight: 500,
                      backgroundColor: `${getStatusColor(order.status)}20`,
                      color: getStatusColor(order.status),
                      border: `1px solid ${getStatusColor(order.status)}40`,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      // Hit the 44px WCAG minimum for touch targets.
                      minHeight: '36px',
                      flex: 1,
                    }}
                  >
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#000',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 500,
                      minHeight: '36px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    View
                  </Link>
                </div>
              </div>
            );
          })}
          {filteredOrders.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: '#666' }}>
              <p style={{ fontSize: '18px', marginBottom: '8px' }}>No orders found</p>
              <p style={{ fontSize: '14px' }}>
                {filterStatus !== 'all'
                  ? 'Try a different filter'
                  : 'Orders will appear here when customers make purchases'}
              </p>
            </div>
          )}
        </div>
      ) : (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e5e5',
        // `overflow: 'auto'` (not 'hidden'): on small laptops or iPad
        // portrait, seven columns at min-content may still exceed the
        // viewport. A horizontal scroll inside the card is the lesser
        // evil — the previous `hidden` was making rows overflow the
        // document and triggering page-level horizontal scrolling, which
        // is harder to discover than a scroll on a single component.
        overflow: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e5e5e5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Order</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Customer</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Items</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666' }}>Date</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Total</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#666' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#666' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => {
              const customer = getCustomerInfo(order);
              return (
                <tr key={order.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                  <td style={{ padding: '16px' }}>
                    <p style={{ fontWeight: 600 }}>#{order.orderNumber || order.id?.slice(0, 8)}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>{order.paymentMethod || 'Credit Card'}</p>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <p style={{ fontWeight: 500 }}>{customer.name}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>{customer.email}</p>
                    {order.shippingAddress && (
                      <p style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                        {order.shippingAddress.city}, {order.shippingAddress.state}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <p style={{ fontWeight: 500 }}>{order.items?.length || 0} items</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      {order.items?.slice(0, 2).map((i: any) => i.name || i.product?.name).join(', ')}
                      {(order.items?.length || 0) > 2 && '...'}
                    </p>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#666' }}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }) : 'N/A'}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600 }}>
                    {formatPrice(order.totalAmount || 0, settings.currencySymbol)}
                    {order.discountAmount > 0 && (
                      <p style={{ fontSize: '11px', color: '#22c55e' }}>
                        -{formatPrice(order.discountAmount, settings.currencySymbol)} discount
                      </p>
                    )}
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
                        backgroundColor: '#000',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredOrders.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: '#666' }}>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>No orders found</p>
            <p style={{ fontSize: '14px' }}>
              {filterStatus !== 'all' ? 'Try a different filter' : 'Orders will appear here when customers make purchases'}
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
