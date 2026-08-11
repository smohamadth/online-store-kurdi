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
};

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

export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      setSettings(loadStoreSettings());
      setLoading(false);
    };

    load();

    const handleChange = () => load();
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
