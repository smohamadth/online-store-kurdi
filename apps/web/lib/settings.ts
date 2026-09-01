// ---------------------------------------------------------------------------
// Store settings for the storefront (client-side).
//
// Read model: localStorage is the cache of record - loadStoreSettings()
// is synchronous so the very first paint has the store name/currency.
// useStoreSettings() hydrates from that cache, then silently re-fetches
// from the API and republishes via a 'settingsChange' event (plus the
// cross-tab 'storage' event, so the admin editing settings in another
// tab is reflected live). When the API is unreachable the cached
// values are used - the store must render without the backend.
//
// (This is the STORE's public settings; the admin form talks to
// /api/settings directly. formatPrice() is the legacy two-argument
// formatter - multi-currency pages use lib/currency.tsx instead.)
// ---------------------------------------------------------------------------
'use client';

import { useState, useEffect } from 'react';

interface StoreSettings {
  storeName: string;
  storeDescription: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
  storeCity: string;
  storeState: string;
  storeCountry: string;
  currency: string;
  currencySymbol: string;
  metaTitle: string;
  metaDescription: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  youtubeUrl: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  /** True when the store has Stripe configured (server capability flag). */
  stripeEnabled: boolean;
  /**
   * Secret-free payment gateway metadata from /api/settings. `enabled` tells
   * the checkout which hosted gateways to offer. Never contains credentials.
   */
  paymentGateways: {
    id: string;
    name: string;
    label: string;
    country: 'IR' | 'IQ' | 'global';
    enabled: boolean;
    currencyHint?: string;
    description?: string;
  }[];
  /** Affiliate marketing program switch (opt-in, default off). */
  affiliateEnabled: boolean;
  /** Default commission % on paid referred orders. */
  affiliateRate: number;
}

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'Online Store',
  storeDescription: 'Your one-stop shop for electronics, clothing, books, and digital products.',
  storeEmail: 'info@store.com',
  storePhone: '',
  storeAddress: '',
  storeCity: '',
  storeState: '',
  storeCountry: 'US',
  currency: 'USD',
  currencySymbol: '$',
  metaTitle: 'Online Store - Shop the Best Products',
  metaDescription: 'Discover amazing products at great prices.',
  facebookUrl: '',
  instagramUrl: '',
  twitterUrl: '',
  youtubeUrl: '',
  maintenanceMode: false,
  maintenanceMessage: 'We are currently performing maintenance. Please check back later.',
  stripeEnabled: false,
  paymentGateways: [],
  affiliateEnabled: false,
  affiliateRate: 10,
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function loadStoreSettings(): StoreSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem('storeSettings');
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch (e) {}
  return DEFAULT_SETTINGS;
}

export function saveStoreSettings(settings: Partial<StoreSettings>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadStoreSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem('storeSettings', JSON.stringify(updated));
    window.dispatchEvent(new Event('settingsChange'));
  } catch (e) {}
}

// Fetch settings from API and update localStorage
async function fetchSettingsFromAPI(): Promise<StoreSettings | null> {
  try {
    const response = await fetch(`${API_URL}/settings`);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.data) {
      const apiSettings: StoreSettings = {
        storeName: data.data.storeName || DEFAULT_SETTINGS.storeName,
        storeDescription: data.data.storeDescription || DEFAULT_SETTINGS.storeDescription,
        storeEmail: data.data.storeEmail || DEFAULT_SETTINGS.storeEmail,
        storePhone: data.data.storePhone || DEFAULT_SETTINGS.storePhone,
        storeAddress: data.data.storeAddress || DEFAULT_SETTINGS.storeAddress,
        storeCity: data.data.storeCity || DEFAULT_SETTINGS.storeCity,
        storeState: data.data.storeState || DEFAULT_SETTINGS.storeState,
        storeCountry: data.data.storeCountry || DEFAULT_SETTINGS.storeCountry,
        currency: data.data.currency || DEFAULT_SETTINGS.currency,
        currencySymbol: data.data.currencySymbol || DEFAULT_SETTINGS.currencySymbol,
        metaTitle: data.data.metaTitle || DEFAULT_SETTINGS.metaTitle,
        metaDescription: data.data.metaDescription || DEFAULT_SETTINGS.metaDescription,
        facebookUrl: data.data.facebookUrl || DEFAULT_SETTINGS.facebookUrl,
        instagramUrl: data.data.instagramUrl || DEFAULT_SETTINGS.instagramUrl,
        twitterUrl: data.data.twitterUrl || DEFAULT_SETTINGS.twitterUrl,
        youtubeUrl: data.data.youtubeUrl || DEFAULT_SETTINGS.youtubeUrl,
        maintenanceMode: data.data.maintenanceMode ?? DEFAULT_SETTINGS.maintenanceMode,
        maintenanceMessage: data.data.maintenanceMessage || DEFAULT_SETTINGS.maintenanceMessage,
        stripeEnabled: data.data.stripeEnabled === true,
        paymentGateways: Array.isArray(data.data.paymentGateways)
          ? data.data.paymentGateways
          : DEFAULT_SETTINGS.paymentGateways,
        affiliateEnabled: data.data.affiliateEnabled === true,
        affiliateRate:
          typeof data.data.affiliateRate === 'number' ? data.data.affiliateRate : DEFAULT_SETTINGS.affiliateRate,
      };
      
      // Update localStorage with API data
      localStorage.setItem('storeSettings', JSON.stringify(apiSettings));
      return apiSettings;
    }
  } catch (error) {
    console.log('Settings API not available, using localStorage cache');
  }
  return null;
}

export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage immediately for fast UI
    const localSettings = loadStoreSettings();
    setSettings(localSettings);
    setLoading(false);
    
    // Then fetch from API in background and update if different
    fetchSettingsFromAPI().then(apiSettings => {
      if (apiSettings) {
        setSettings(apiSettings);
      }
    });

    const handleChange = () => {
      setSettings(loadStoreSettings());
    };
    window.addEventListener('settingsChange', handleChange);
    window.addEventListener('storage', handleChange);

    return () => {
      window.removeEventListener('settingsChange', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  return { settings, loading };
}

export function formatPrice(price: number, currencySymbol: string = '$'): string {
  return `${currencySymbol}${price.toFixed(2)}`;
}
