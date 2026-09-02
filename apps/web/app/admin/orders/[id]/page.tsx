// ---------------------------------------------------------------------------
// /admin/orders/[id] - the order detail: items, address, payment +
// status, the tracking-number and admin-notes editors, and the status
// transition buttons (PUT /api/orders/:id/status).
//
// The status buttons are the admin's fulfilment workflow: pending ->
// processing -> shipped (with tracking number, which triggers the
// customer's shipping email) -> delivered, plus cancel/refund. The
// server validates each transition.
// ---------------------------------------------------------------------------
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { api } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { API_BASE, authHttp, errorMessage } from '@/lib/http';

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { settings } = useStoreSettings();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleMsg, setSettleMsg] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  // When set, the refund returns value to the customer's store-credit
  // balance instead of cash/gateway money (the only way to refund the
  // wallet-credit portion of an order).
  const [refundToCredit, setRefundToCredit] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Try API
      try {
        const response = await api.getOrder(token, orderId);
        if (response.data) {
          setOrder(response.data);
          setTrackingNumber(response.data.trackingNumber || '');
          setAdminNotes(response.data.adminNotes || '');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.log('API not available');
      }

      // No localStorage fallback: an order that is not in the database does
      // not exist, and showing a browser-local copy hid that fact.
    } catch (err) {
      console.error('Failed to fetch order:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Try API
      const res = await fetch(
        `${API_BASE}/orders/${orderId}/status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: newStatus, trackingNumber, adminNotes }),
        }
      );

      if (!res.ok) {
        // The old code ignored the response and updated the UI plus
        // localStorage regardless, so a rejected status change still looked
        // applied - and the customer never saw it.
        const err = await res.json().catch(() => ({}));
        alert(err.message || `Could not update the order (${res.status}). Nothing was saved.`);
        return;
      }

      const saved = await res.json();
      setOrder(saved.data || { ...order, status: newStatus, trackingNumber, adminNotes });
    } catch (err) {
      console.error('Failed to update order:', err);
      alert('Could not reach the server. The order was NOT updated.');
    } finally {
      setUpdating(false);
    }
  };

  // Record a payment for an order paid offline (COD / bank transfer).
  // Calls the staff-only POST /api/payments/process, which creates the
  // Payment row, marks the order paid and moves it to processing. This is the
  // admin end of the COD flow: the customer picked COD at checkout, and the
  // staff confirms the cash/transfer was collected here.
  const handleMarkPaid = async () => {
    setSettling(true);
    setSettleMsg('');
    try {
      await authHttp.post('/payments/process', {
        orderId,
        paymentMethod: order.paymentMethod || 'bank_transfer',
      });
      setSettleMsg('Payment recorded — the order is now paid and processing.');
      setOrder((prev: any) => ({ ...prev, paymentStatus: 'completed', status: 'processing' }));
    } catch (err: any) {
      setSettleMsg(errorMessage(err) || 'Could not record the payment. Please try again.');
    } finally {
      setSettling(false);
    }
  };

  // Refund a completed payment. Calls the admin-only POST /api/payments/refund.
  // For gateway payments (Stripe, PayPal, ZainCash, Zarinpal, FIB) the server
  // actually refunds the money before marking the order refunded; if the
  // gateway is disabled / has no API refund (IDPay) / rejects it, the server
  // returns an error and the order stays 'completed' — never falsely refunded.
  const handleRefund = async () => {
    if (!window.confirm('Issue a refund for this order? This cannot be undone.')) return;
    setRefunding(true);
    setRefundMsg('');
    const parsedAmount = refundAmount ? Number(refundAmount) : undefined;
    if (parsedAmount !== undefined && (isNaN(parsedAmount) || parsedAmount <= 0)) {
      setRefundMsg('Please enter a valid refund amount (or leave it blank for a full refund).');
      return;
    }
    try {
      await authHttp.post('/payments/refund', {
        orderId,
        ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}),
        reason: refundReason || 'Admin refund',
        ...(refundToCredit ? { creditToStoreCredit: true } : {}),
      });
      setRefundMsg(refundToCredit ? 'Refund issued to store credit.' : 'Refund issued.');
      setRefundAmount('');
      setRefundToCredit(false);
      // A full refund marks the order refunded; a partial one leaves it
      // partially_refunded — reload to reflect the server's real state.
      await fetchOrder();
    } catch (err: any) {
      setRefundMsg(errorMessage(err) || 'Could not issue the refund. Please try again.');
    } finally {
      setRefunding(false);
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

  const getStatusStep = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 0;
      case 'processing': return 1;
      case 'shipped': return 2;
      case 'delivered': return 3;
      case 'cancelled': return -1;
      default: return 0;
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading order...</div>;
  }

  if (!order) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <p style={{ marginBottom: '16px' }}>Order not found</p>
        <Link href="/admin/orders" style={{ color: '#000' }}>Back to Orders</Link>
      </div>
    );
  }

  const statusStep = getStatusStep(order.status);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <Link href="/admin/orders" style={{ fontSize: '14px', color: '#666', textDecoration: 'none', marginBottom: '8px', display: 'block' }}>
            <DirectionArrow kind="back" /> Back to Orders
          </Link>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Order #{order.orderNumber || order.id}</h2>
          <p style={{ color: '#666', marginTop: '4px' }}>
            Placed on {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'N/A'}
          </p>
          {/* Admin/manager receipt downloads. */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} data-testid="receipt-actions">
            <a
              href={`/api/orders/${order.id}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 12px',
                backgroundColor: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              📄 Receipt
            </a>
            <a
              href={`/api/orders/${order.id}/receipt.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 12px',
                backgroundColor: '#f5f5f5',
                color: '#000',
                border: '1px solid #e5e5e5',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              ⬇ PDF
            </a>
          </div>
        </div>
        <span style={{
          padding: '8px 16px',
          borderRadius: '50px',
          backgroundColor: `${getStatusColor(order.status)}20`,
          color: getStatusColor(order.status),
          fontWeight: 600,
          textTransform: 'capitalize',
        }}>
          {order.status || 'pending'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
        {/* Left Column */}
        <div>
          {/* Status Timeline */}
          {statusStep >= 0 && (
            <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Status</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '12px', left: '50px', right: '50px', height: '4px', backgroundColor: '#e5e5e5', zIndex: 0 }}>
                  <div style={{ width: `${(statusStep / 3) * 100}%`, height: '100%', backgroundColor: '#22c55e' }} />
                </div>
                {['Pending', 'Processing', 'Shipped', 'Delivered'].map((step, index) => (
                  <div key={step} style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      backgroundColor: index <= statusStep ? '#22c55e' : '#e5e5e5',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 8px', color: 'white', fontSize: '12px', fontWeight: 'bold',
                    }}>
                      {index <= statusStep ? '✓' : index + 1}
                    </div>
                    <span style={{ fontSize: '12px' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Items */}
          <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Items</h3>
            {order.items?.map((item: any, index: number) => (
              <div key={item.id || index} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: index < order.items.length - 1 ? '1px solid #e5e5e5' : 'none',
              }}>
                <div>
                  <p style={{ fontWeight: 500 }}>{item.name || item.product?.name || 'Product'}</p>
                  {item.variant && <p style={{ fontSize: '14px', color: '#666' }}>{item.variant}</p>}
                  <p style={{ fontSize: '14px', color: '#666' }}>Qty: {item.quantity}</p>
                </div>
                <span style={{ fontWeight: 600 }}>{formatPrice(item.price * item.quantity, settings.currencySymbol)}</span>
              </div>
            ))}
          </div>

          {/* Update Status */}
          <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Update Order</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Status</label>
              <select
                value={order.status}
                onChange={(e) => updateOrderStatus(e.target.value)}
                disabled={updating}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              >
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Tracking Number</label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number"
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Admin Notes</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="Internal notes..."
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>

            <button
              onClick={() => updateOrderStatus(order.status)}
              disabled={updating}
              style={{
                padding: '10px 24px',
                backgroundColor: updating ? '#ccc' : '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: updating ? 'not-allowed' : 'pointer',
              }}
            >
              {updating ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* Customer Info */}
          <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Customer</h3>
            <p style={{ fontWeight: 500 }}>
              {order.user?.firstName || order.shippingAddress?.firstName || 'Guest'} {order.user?.lastName || order.shippingAddress?.lastName || ''}
            </p>
            <p style={{ fontSize: '14px', color: '#666' }}>
              {order.user?.email || order.shippingAddress?.email || 'N/A'}
            </p>
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Shipping Address</h3>
              <p>{order.shippingAddress.firstName} {order.shippingAddress.lastName}</p>
              <p style={{ color: '#666' }}>{order.shippingAddress.address}</p>
              <p style={{ color: '#666' }}>
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}
              </p>
              <p style={{ color: '#666' }}>{order.shippingAddress.country}</p>
            </div>
          )}

          {/* Payment Info */}
          <div style={{ padding: '24px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Payment</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#666' }}>Method</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{order.paymentMethod || 'Credit Card'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>Status</span>
              <span style={{ fontWeight: 500, color: order.paymentStatus === 'completed' ? '#22c55e' : '#f59e0b', textTransform: 'capitalize' }}>
                {order.paymentStatus || 'pending'}
              </span>
            </div>
            {/* Wallet credit applied at checkout: totalAmount keeps the
                full order value, so the applied columns show how much of
                it was covered by credit rather than cash. */}
            {(order.storeCreditApplied || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ color: '#666' }}>Paid with store credit</span>
                <span style={{ fontWeight: 500, color: '#16a34a' }}>
                  -{formatPrice(order.storeCreditApplied)}
                </span>
              </div>
            )}
            {(order.giftCardApplied || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ color: '#666' }}>
                  Paid with gift card{order.giftCardCode ? ` (${order.giftCardCode})` : ''}
                </span>
                <span style={{ fontWeight: 500, color: '#16a34a' }}>
                  -{formatPrice(order.giftCardApplied)}
                </span>
              </div>
            )}
            {(order.paymentStatus === 'pending' || order.paymentStatus === 'failed') && (
              <>
                <button
                  onClick={handleMarkPaid}
                  disabled={settling}
                  style={{
                    marginTop: '16px',
                    width: '100%',
                    padding: '10px 20px',
                    backgroundColor: settling ? '#ccc' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: settling ? 'not-allowed' : 'pointer',
                  }}
                >
                  {settling ? 'Recording…' : 'Mark as paid'}
                </button>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                  Record cash collected or a bank transfer received for this order.
                </p>
              </>
            )}
            {(order.paymentStatus === 'completed' || order.paymentStatus === 'partially_refunded') && (
              <>
                <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
                  <input
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`Refund amount (default: full ${formatPrice(order.totalAmount - (order.storeCreditApplied || 0) - (order.giftCardApplied || 0))})`}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '13px', marginBottom: '8px' }}
                  />
                  <input
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Refund reason (optional)"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e5e5', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={refundToCredit}
                      onChange={(e) => setRefundToCredit(e.target.checked)}
                    />
                    Return the value to the customer's store credit (instead of cash/gateway refund)
                  </label>
                  <button
                    onClick={handleRefund}
                    disabled={refunding}
                    style={{
                      marginTop: '10px',
                      width: '100%',
                      padding: '10px 20px',
                      backgroundColor: refunding ? '#ccc' : '#dc2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: refunding ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {refunding ? 'Refunding…' : 'Refund order'}
                  </button>
                  <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                    Leave the amount blank to refund the full remaining balance. For online payments this refunds the customer at the gateway before marking the order refunded. Orders paid with store credit / gift cards have no cash to refund — use the store-credit option for the credit-covered portion.
                  </p>
                </div>
              </>
            )}
            {refundMsg && (
              <p style={{ fontSize: '13px', marginTop: '10px', color: '#374151' }}>{refundMsg}</p>
            )}
            {settleMsg && (
              <p style={{ fontSize: '13px', marginTop: '10px', color: '#374151' }}>{settleMsg}</p>
            )}
          </div>

          {/* Order Summary */}
          <div style={{ padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Order Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span>{formatPrice(order.subtotal || 0, settings.currencySymbol)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e' }}>
                  <span>Discount</span>
                  <span>-{formatPrice(order.discountAmount, settings.currencySymbol)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Shipping</span>
                <span>{Number(order.shippingAmount) === 0 ? 'Free' : `${formatPrice(order.shippingAmount || 0, settings.currencySymbol)}`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Tax</span>
                <span>{formatPrice(order.taxAmount || 0, settings.currencySymbol)}</span>
              </div>
              <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '8px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px' }}>
                  <span>Total</span>
                  <span>{formatPrice(order.totalAmount || 0, settings.currencySymbol)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
