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
  freeShippingThreshold: number | null;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  isActive: boolean;
}

export default function AdminShippingPage() {
  const { settings } = useStoreSettings();
  // The shipping form has two 1fr/1fr rows (name/rate, min/max).
  // Stack under 640px.
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
  const [methodForm, setMethodForm] = useState({
    name: '',
    type: 'flat',
    baseRate: 0,
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
      // A rejected create used to leave the modal open with no explanation.
      console.error('Failed to add zone:', err);
      alert(errorMessage(err, 'Could not create the shipping zone.'));
    }
  };

  const handleAddMethod = async () => {
    if (!selectedZone) return;

    try {
      await authHttp.post('/shipping/methods', { ...methodForm, zoneId: selectedZone });
      setShowAddMethod(false);
      fetchZones();
    } catch (err) {
      console.error('Failed to add method:', err);
      alert(errorMessage(err, 'Could not create the shipping method.'));
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
                <button
                  onClick={() => {
                    setSelectedZone(zone.id);
                    setShowAddMethod(true);
                  }}
                  style={{ padding: '8px 16px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  + Add Method
                </button>
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
                          {method.minDeliveryDays}-{method.maxDeliveryDays} days
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 600 }}>
                          {method.freeShippingThreshold ? 'Free' : formatPrice(method.baseRate, settings.currencySymbol)}
                        </p>
                        {method.freeShippingThreshold && (
                          <p style={{ fontSize: '12px', color: '#666' }}>
                            Over ${method.freeShippingThreshold}
                          </p>
                        )}
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
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Countries (comma-separated)</label>
              <input
                type="text"
                value={zoneForm.countries}
                onChange={(e) => setZoneForm({ ...zoneForm, countries: e.target.value })}
                placeholder="US, CA"
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddZone(false)}
                style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddZone}
                style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Add Zone
              </button>
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
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '500px' }}>
            <h3 style={{ marginBottom: '16px' }}>Add Shipping Method</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Method Name</label>
              <input
                type="text"
                value={methodForm.name}
                onChange={(e) => setMethodForm({ ...methodForm, name: e.target.value })}
                placeholder="e.g., Standard Shipping"
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Rate ($)</label>
                <input
                  type="number"
                  value={methodForm.baseRate}
                  onChange={(e) => setMethodForm({ ...methodForm, baseRate: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Free Over ($)</label>
                <input
                  type="number"
                  value={methodForm.freeShippingThreshold}
                  onChange={(e) => setMethodForm({ ...methodForm, freeShippingThreshold: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Min Days</label>
                <input
                  type="number"
                  value={methodForm.minDeliveryDays}
                  onChange={(e) => setMethodForm({ ...methodForm, minDeliveryDays: parseInt(e.target.value) || 1 })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Max Days</label>
                <input
                  type="number"
                  value={methodForm.maxDeliveryDays}
                  onChange={(e) => setMethodForm({ ...methodForm, maxDeliveryDays: parseInt(e.target.value) || 7 })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddMethod(false)}
                style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddMethod}
                style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Add Method
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}