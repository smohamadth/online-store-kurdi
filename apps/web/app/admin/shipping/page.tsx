// /admin/shipping - the shipping zones + methods editor. A zone
// matches countries (plus optional state/zip lists); a method prices
// by flat / weight / price-percentage / item-count (the same four
// types the server's calculator implements). The checkout's
// ShippingSelector queries the public POST /api/shipping/calculate
// with the customer's address, so a method the admin configures here
// only appears at checkout if it matches a zone.
'use client';

import { useStoreSettings, formatPrice } from '@/lib/settings';

import { useState, useEffect } from 'react';
import { API_BASE, authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  isActive: boolean;
  methods: ShippingMethod[];
}

interface ShippingMethod {
  id: string;
  name: string;
  type: string;
  baseRate: number;
  weightUnitRate?: number | null;
  minWeight?: number | null;
  maxWeight?: number | null;
  pricePercentage?: number | null;
  itemCountRate?: number | null;
  minOrderAmount?: number | null;
  maxOrderAmount?: number | null;
  freeShippingThreshold?: number | null;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  isActive: boolean;
}

const METHOD_TYPES: { value: string; label: string }[] = [
  { value: 'flat', label: 'Flat rate' },
  { value: 'weight', label: 'Per weight' },
  { value: 'price', label: 'Percentage of order' },
  { value: 'item_count', label: 'Per item' },
];

export default function AdminShippingPage() {
  const { settings } = useStoreSettings();
  const isMobile = useIsMobile(640);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  // Zone form
  const [zoneForm, setZoneForm] = useState({
    name: '',
    countries: 'US',
    isActive: true,
  });

  // Method form
  const [methodForm, setMethodForm] = useState<any>({
    name: '',
    type: 'flat',
    baseRate: 0,
    weightUnitRate: 0,
    minWeight: 0,
    maxWeight: 0,
    pricePercentage: 0,
    itemCountRate: 0,
    minOrderAmount: 0,
    maxOrderAmount: 0,
    freeShippingThreshold: 0,
    minDeliveryDays: 1,
    maxDeliveryDays: 7,
    isActive: true,
  });

  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/shipping/zones`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setZones(data.data || []);
        setApiStatus('connected');
      } else {
        setApiStatus('disconnected');
      }
    } catch (err) {
      setApiStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  const handleAddZone = async () => {
    try {
      await authHttp.post('/shipping/zones', {
        ...zoneForm,
        countries: zoneForm.countries.split(',').map(c => c.trim()),
      });
      setShowAddZone(false);
      fetchZones();
    } catch (err) {
      console.error('Failed to add zone:', err);
      alert(errorMessage(err, 'Could not create the shipping zone.'));
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm('Delete this zone and stop offering its methods?')) return;
    try {
      await authHttp.delete(`/shipping/zones/${id}`);
      fetchZones();
    } catch (err) {
      alert(errorMessage(err, 'Could not delete the zone.'));
    }
  };

  const setFormNum = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setMethodForm({ ...methodForm, [key]: parseFloat(e.target.value) || 0 });

  const handleAddMethod = async () => {
    if (!selectedZone) return;

    // Send only the fields the chosen type needs (plus the common ones),
    // so a stale value from another type isn't misinterpreted by the
    // calculator. Empty = absent on the server.
    const payload: any = {
      name: methodForm.name,
      type: methodForm.type,
      baseRate: methodForm.baseRate,
      freeShippingThreshold: methodForm.freeShippingThreshold || null,
      minDeliveryDays: methodForm.minDeliveryDays,
      maxDeliveryDays: methodForm.maxDeliveryDays,
      isActive: true,
      zoneId: selectedZone,
    };
    if (methodForm.type === 'weight') {
      payload.weightUnitRate = methodForm.weightUnitRate;
      payload.minWeight = methodForm.minWeight || null;
      payload.maxWeight = methodForm.maxWeight || null;
    } else if (methodForm.type === 'price') {
      payload.pricePercentage = methodForm.pricePercentage;
      payload.minOrderAmount = methodForm.minOrderAmount || null;
      payload.maxOrderAmount = methodForm.maxOrderAmount || null;
    } else if (methodForm.type === 'item_count') {
      payload.itemCountRate = methodForm.itemCountRate;
      payload.minOrderAmount = methodForm.minOrderAmount || null;
      payload.maxOrderAmount = methodForm.maxOrderAmount || null;
    }

    try {
      await authHttp.post('/shipping/methods', payload);
      setShowAddMethod(false);
      fetchZones();
    } catch (err) {
      console.error('Failed to add method:', err);
      alert(errorMessage(err, 'Could not create the shipping method.'));
    }
  };

  const handleDeleteMethod = async (id: string) => {
    if (!confirm('Delete this shipping method?')) return;
    try {
      await authHttp.delete(`/shipping/methods/${id}`);
      fetchZones();
    } catch (err) {
      alert(errorMessage(err, 'Could not delete the shipping method.'));
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading shipping...</div>;
  }

  return (
    <div>
      {/* API Status */}
      {apiStatus === 'disconnected' && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Start API to manage shipping: <code>npm run dev:api</code></p>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Shipping Management</h2>
        <button
          onClick={() => setShowAddZone(true)}
          style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          + Add Zone
        </button>
      </div>

      {/* Zones */}
      {zones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>No shipping zones configured</p>
          <p style={{ color: '#666', marginBottom: '16px' }}>Add a shipping zone to start</p>
          <button
            onClick={() => setShowAddZone(true)}
            style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Add Zone
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {zones.map((zone) => (
            <div key={zone.id} style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontWeight: 600 }}>{zone.name}</h3>
                  <p style={{ fontSize: '14px', color: '#666' }}>
                    Countries: {Array.isArray(zone.countries)
                      ? zone.countries.join(', ')
                      : typeof zone.countries === 'string'
                        ? zone.countries
                        : 'None'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setSelectedZone(zone.id);
                      setShowAddMethod(true);
                    }}
                    style={{ padding: '8px 16px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    + Add Method
                  </button>
                  <button
                    onClick={() => handleDeleteZone(zone.id)}
                    style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Methods */}
              {zone.methods.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {zone.methods.map((method) => (
                    <div key={method.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      backgroundColor: '#f9f9f9',
                      borderRadius: '6px',
                    }}>
                      <div>
                        <p style={{ fontWeight: 500 }}>{method.name}</p>
                        <p style={{ fontSize: '12px', color: '#666' }}>
                          {formatMethodType(method.type)} · {method.minDeliveryDays}-{method.maxDeliveryDays} days
                          {method.minWeight != null && method.maxWeight != null
                            ? ` · ${method.minWeight}-${method.maxWeight}` : ''}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <p style={{ fontWeight: 600 }}>
                            {method.freeShippingThreshold ? 'Free' : formatPrice(method.baseRate, settings.currencySymbol)}
                          </p>
                          {method.freeShippingThreshold ? (
                            <p style={{ fontSize: '12px', color: '#666' }}>
                              Over ${method.freeShippingThreshold}
                            </p>
                          ) : (
                            <p style={{ fontSize: '12px', color: '#666' }}>{methodPricing(method)}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteMethod(method.id)}
                          style={{ padding: '4px 8px', backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#666', fontSize: '14px' }}>No shipping methods added</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Zone Modal */}
      {showAddZone && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>Add Shipping Zone</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Zone Name</label>
              <input
                type="text"
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                placeholder="e.g., Domestic, Europe"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Countries (comma-separated)</label>
              <input
                type="text"
                value={zoneForm.countries}
                onChange={(e) => setZoneForm({ ...zoneForm, countries: e.target.value })}
                placeholder="US, CA"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddZone(false)} style={btnGhost}>Cancel</button>
              <button onClick={handleAddZone} style={btnPrimary}>Add Zone</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Method Modal */}
      {showAddMethod && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '16px' }}>Add Shipping Method</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Method Name</label>
              <input
                type="text"
                value={methodForm.name}
                onChange={(e) => setMethodForm({ ...methodForm, name: e.target.value })}
                placeholder="e.g., Standard Shipping"
                style={inputStyle}
              />
            </div>

            {/* Type selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Pricing type</label>
              <select
                value={methodForm.type}
                onChange={(e) => setMethodForm({ ...methodForm, type: e.target.value })}
                style={inputStyle}
              >
                {METHOD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Type-specific fields */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              {methodForm.type === 'flat' && (
                <>
                  <Field label="Base rate ($)" value={methodForm.baseRate} onChange={setFormNum('baseRate')} />
                  <Field label="Free over ($, 0 = never)" value={methodForm.freeShippingThreshold} onChange={setFormNum('freeShippingThreshold')} />
                </>
              )}
              {methodForm.type === 'weight' && (
                <>
                  <Field label="Base rate ($)" value={methodForm.baseRate} onChange={setFormNum('baseRate')} />
                  <Field label="Rate per unit ($)" value={methodForm.weightUnitRate} onChange={setFormNum('weightUnitRate')} />
                  <Field label="Min weight (units)" value={methodForm.minWeight} onChange={setFormNum('minWeight')} />
                  <Field label="Max weight (units)" value={methodForm.maxWeight} onChange={setFormNum('maxWeight')} />
                  <Field label="Free over ($, 0 = never)" value={methodForm.freeShippingThreshold} onChange={setFormNum('freeShippingThreshold')} />
                </>
              )}
              {methodForm.type === 'price' && (
                <>
                  <Field label="Percent of order (%)" value={methodForm.pricePercentage} onChange={setFormNum('pricePercentage')} />
                  <Field label="Min order ($)" value={methodForm.minOrderAmount} onChange={setFormNum('minOrderAmount')} />
                  <Field label="Max order ($)" value={methodForm.maxOrderAmount} onChange={setFormNum('maxOrderAmount')} />
                  <Field label="Free over ($, 0 = never)" value={methodForm.freeShippingThreshold} onChange={setFormNum('freeShippingThreshold')} />
                </>
              )}
              {methodForm.type === 'item_count' && (
                <>
                  <Field label="Base rate ($)" value={methodForm.baseRate} onChange={setFormNum('baseRate')} />
                  <Field label="Rate per item ($)" value={methodForm.itemCountRate} onChange={setFormNum('itemCountRate')} />
                  <Field label="Min order ($)" value={methodForm.minOrderAmount} onChange={setFormNum('minOrderAmount')} />
                  <Field label="Max order ($)" value={methodForm.maxOrderAmount} onChange={setFormNum('maxOrderAmount')} />
                  <Field label="Free over ($, 0 = never)" value={methodForm.freeShippingThreshold} onChange={setFormNum('freeShippingThreshold')} />
                </>
              )}
            </div>

            {/* Delivery window */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <Field label="Min delivery days" value={methodForm.minDeliveryDays} onChange={setFormNum('minDeliveryDays')} />
              <Field label="Max delivery days" value={methodForm.maxDeliveryDays} onChange={setFormNum('maxDeliveryDays')} />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddMethod(false)} style={btnGhost}>Cancel</button>
              <button onClick={handleAddMethod} style={btnPrimary}>Add Method</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" value={value} onChange={onChange} style={inputStyle} />
    </div>
  );
}

function formatMethodType(type: string): string {
  const found = METHOD_TYPES.find((t) => t.value === type);
  return found ? found.label : type;
}

function methodPricing(method: ShippingMethod): string {
  switch (method.type) {
    case 'weight':
      return method.weightUnitRate != null ? `+ $${method.weightUnitRate}/unit` : '';
    case 'price':
      return method.pricePercentage != null ? `${method.pricePercentage}% of order` : '';
    case 'item_count':
      return method.itemCountRate != null ? `+ $${method.itemCountRate}/item` : '';
    default:
      return 'Flat rate';
  }
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' };
const btnPrimary: React.CSSProperties = { padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' };
