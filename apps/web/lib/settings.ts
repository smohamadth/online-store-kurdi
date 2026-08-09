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

// Load settings from localStorage or API
export function loadStoreSettings(): StoreSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem('storeSettings');
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {}

  return DEFAULT_SETTINGS;
}

// Hook to use store settings
export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage immediately
    setSettings(loadStoreSettings());
    setLoading(false);

    // Try to fetch from API
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/settings`);
      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          const merged = { ...DEFAULT_SETTINGS, ...data.data };
          setSettings(merged);
          localStorage.setItem('storeSettings', JSON.stringify(merged));
        }
      }
    } catch (err) {
      // Use local settings
    }
  };

  return { settings, loading };
}

// Format price with currency
export function formatPrice(price: number, currencySymbol: string = '$'): string {
  return `${currencySymbol}${price.toFixed(2)}`;
}

// Get store name
export function getStoreName(): string {
  return loadStoreSettings().storeName;
}

// Get meta tags
export function getMetaTags() {
  const settings = loadStoreSettings();
  return {
    title: settings.metaTitle || settings.storeName,
    description: settings.metaDescription || settings.storeDescription,
  };
}
