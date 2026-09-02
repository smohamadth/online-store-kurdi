// /admin/tax - the tax rates + tax classes editor. Rates are
// fractions (10 = 10%) scoped to country/state/city/zip with a
// priority; the server's calculator walks them priority-first and
// falls back to the country-level general rate. Tax classes (e.g.
// 'zero' / 'digital') override the per-item rate at calculate time.
// The storefront's TaxCalculator calls POST /api/tax/calculate, so
// what the admin configures here is exactly what checkout charges.
'use client';

import { useState, useEffect } from 'react';
import { API_BASE, authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  country: string;
  state: string | null;
  taxClass: string;
  isActive: boolean;
}

interface TaxClass {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  _count?: { products: number };
}

export default function AdminTaxPage() {
  // The tax form has two 1fr/1fr rows (name/country, rate/postcode).
  // Stack under 640px.
  const isMobile = useIsMobile(640);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [taxClasses, setTaxClasses] = useState<TaxClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('rates');
  const [showAddRate, setShowAddRate] = useState(false);
  const [showAddClass, setShowAddClass] = useState(false);
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  const [rateForm, setRateForm] = useState({
    name: '',
    rate: 0,
    country: 'US',
    state: '',
    taxClass: 'standard',
    isActive: true,
  });

  const [classForm, setClassForm] = useState({
    name: '',
    description: '',
    isDefault: false,
  });

  useEffect(() => {
    fetchTaxData();
  }, []);

  const fetchTaxData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const [ratesRes, classesRes] = await Promise.all([
        fetch(`${API_BASE}/tax/rates`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/tax/classes`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (ratesRes.ok && classesRes.ok) {
        const ratesData = await ratesRes.json();
        const classesData = await classesRes.json();
        setTaxRates(ratesData.data || []);
        setTaxClasses(classesData.data || []);
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

  const handleAddRate = async () => {
    try {
      await authHttp.post('/tax/rates', {
        ...rateForm,
        rate: rateForm.rate / 100, // API stores the rate as a decimal
      });

      {
        setShowAddRate(false);
        fetchTaxData();
      }
    } catch (err) {
      console.error('Failed to add tax rate:', err);
      alert(errorMessage(err, 'Could not create the tax rate.'));
    }
  };

  const handleAddClass = async () => {
    try {
      await authHttp.post('/tax/classes', classForm);
      setShowAddClass(false);
      fetchTaxData();
    } catch (err) {
      console.error('Failed to add tax class:', err);
      alert(errorMessage(err, 'Could not create the tax class.'));
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading tax settings...</div>;
  }

  return (
    <div>
      {/* API Status */}
      {apiStatus === 'disconnected' && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '24px' }}>
          <p style={{ fontWeight: 600, color: '#92400e' }}>⚠️ API Disconnected</p>
          <p style={{ fontSize: '14px', color: '#92400e' }}>Start API to manage taxes: <code>npm run dev:api</code></p>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Tax Configuration</h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e5e5', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('rates')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'rates' ? '#f5f5f5' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'rates' ? '2px solid #000' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'rates' ? 600 : 400,
          }}
        >
          Tax Rates
        </button>
        <button
          onClick={() => setActiveTab('classes')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'classes' ? '#f5f5f5' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'classes' ? '2px solid #000' : '2px solid transparent',
            cursor: 'pointer',
            fontWeight: activeTab === 'classes' ? 600 : 400,
          }}
        >
          Tax Classes
        </button>
      </div>

      {/* Tax Rates */}
      {activeTab === 'rates' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              onClick={() => setShowAddRate(true)}
              style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              + Add Tax Rate
            </button>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Country</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>State</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>Rate</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>Class</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {taxRates.map((rate) => (
                  <tr key={rate.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td style={{ padding: '16px' }}>{rate.name}</td>
                    <td style={{ padding: '16px' }}>{rate.country}</td>
                    <td style={{ padding: '16px' }}>{rate.state || '-'}</td>
                    <td style={{ padding: '16px', textAlign: 'center', fontWeight: 600 }}>
                      {(rate.rate * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>{rate.taxClass}</td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '50px',
                        fontSize: '12px',
                        backgroundColor: rate.isActive ? '#d1fae5' : '#fef3c7',
                        color: rate.isActive ? '#22c55e' : '#f59e0b',
                      }}>
                        {rate.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {taxRates.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>No tax rates configured</div>
            )}
          </div>
        </div>
      )}

      {/* Tax Classes */}
      {activeTab === 'classes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              onClick={() => setShowAddClass(true)}
              style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              + Add Tax Class
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {taxClasses.map((cls) => (
              <div key={cls.id} style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', padding: '24px' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>{cls.name}</h3>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>{cls.description || 'No description'}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>
                    {cls._count?.products || 0} products
                  </span>
                  {cls.isDefault && (
                    <span style={{ padding: '2px 8px', backgroundColor: '#dbeafe', color: '#3b82f6', borderRadius: '50px', fontSize: '12px' }}>
                      Default
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Rate Modal */}
      {showAddRate && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '500px' }}>
            <h3 style={{ marginBottom: '16px' }}>Add Tax Rate</h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Name</label>
                <input
                  type="text"
                  value={rateForm.name}
                  onChange={(e) => setRateForm({ ...rateForm, name: e.target.value })}
                  placeholder="e.g., US Sales Tax"
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={rateForm.rate}
                  onChange={(e) => setRateForm({ ...rateForm, rate: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Country</label>
                <select
                  value={rateForm.country}
                  onChange={(e) => setRateForm({ ...rateForm, country: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                >
                  <option value="US">United States</option>
                  <option value="GB">United Kingdom</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="NL">Netherlands</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>State (optional)</label>
                <input
                  type="text"
                  value={rateForm.state}
                  onChange={(e) => setRateForm({ ...rateForm, state: e.target.value })}
                  placeholder="e.g., CA"
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddRate(false)}
                style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddRate}
                style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Add Rate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Class Modal */}
      {showAddClass && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: isMobile ? '16px' : '32px', width: isMobile ? 'calc(100vw - 24px)' : '400px' }}>
            <h3 style={{ marginBottom: '16px' }}>Add Tax Class</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Name</label>
              <input
                type="text"
                value={classForm.name}
                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                placeholder="e.g., Digital Products"
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Description</label>
              <textarea
                value={classForm.description}
                onChange={(e) => setClassForm({ ...classForm, description: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={classForm.isDefault}
                  onChange={(e) => setClassForm({ ...classForm, isDefault: e.target.checked })}
                />
                <span style={{ fontSize: '14px' }}>Set as default tax class</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddClass(false)}
                style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddClass}
                style={{ padding: '10px 20px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Add Class
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}