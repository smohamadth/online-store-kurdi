'use client';

import { useState, useRef, useEffect } from 'react';
import { getImageUrl } from '@/lib/api';

interface ImageVariants {
  thumbnail?: string;
  medium?: string;
  large?: string;
  zoom?: string;
}

interface ImageUploadProps {
  onUpload: (url: string, variants?: ImageVariants) => void;
  currentImage?: string;
  label?: string;
  folder?: string;
}

export default function ImageUpload({
  onUpload,
  currentImage,
  label = 'Upload Image',
  folder = 'products',
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [variants, setVariants] = useState<ImageVariants | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('large');
  const [originalFileName, setOriginalFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeLabels: Record<string, { label: string; dimensions: string; use: string }> = {
    thumbnail: { label: 'Thumbnail', dimensions: '300×300', use: 'Product cards, search results' },
    medium: { label: 'Medium', dimensions: '600×600', use: 'Product grid, mobile' },
    large: { label: 'Large', dimensions: '1200×1200', use: 'Product detail page' },
    zoom: { label: 'Zoom', dimensions: '2000×2000', use: 'Image zoom on hover' },
  };

  useEffect(() => {
    if (currentImage) {
      setPreview(currentImage);
    }
  }, [currentImage]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, GIF, or WebP image');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setError('');
    setUploading(true);
    setOriginalFileName(file.name);

    try {
      // Create local preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Try to upload to API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);

      const token = localStorage.getItem('token');
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/upload/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        // Keep paths RELATIVE so they stay portable across environments.
        // getImageUrl() prepends the API base at render time.
        const buildUrl = (path: string) => path || '';
        
        const imageVariants: ImageVariants = {
          thumbnail: buildUrl(data.data?.thumbnail),
          medium: buildUrl(data.data?.medium),
          large: buildUrl(data.data?.large),
          zoom: buildUrl(data.data?.zoom),
        };
        
        setVariants(imageVariants);
        
        // Use selected size
        const selectedUrl = imageVariants[selectedSize as keyof ImageVariants] || imageVariants.large || imageVariants.medium;
        setPreview(selectedUrl || null);
        onUpload(selectedUrl || '', imageVariants);
      } else {
        // If API fails, use base64 as fallback
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setPreview(dataUrl);
          onUpload(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('Upload error:', err);
      // Fallback to base64
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setPreview(dataUrl);
        onUpload(dataUrl);
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  };

  const handleSizeChange = (size: string) => {
    setSelectedSize(size);
    if (variants) {
      const url = variants[size as keyof ImageVariants];
      if (url) {
        setPreview(url);
        onUpload(url, variants);
      }
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setVariants(null);
    setOriginalFileName('');
    onUpload('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
        {label}
      </label>

      {/* Preview */}
      {preview ? (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
            <img
              src={getImageUrl(preview)}
              alt="Preview"
              style={{
                width: '200px',
                height: '200px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: '2px solid #e5e5e5',
              }}
            />
            <button
              type="button"
              onClick={handleRemove}
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                color: 'white',
                border: '2px solid white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              ✕
            </button>
            {uploading && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '14px',
              }}>
                Uploading...
              </div>
            )}
          </div>

          {/* File info */}
          {originalFileName && (
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
              📁 {originalFileName}
            </p>
          )}

          {/* Image Size Selector */}
          {variants && (
            <div style={{
              padding: '16px',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
                📐 Select Image Size to Use:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {Object.entries(sizeLabels).map(([size, info]) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleSizeChange(size)}
                    style={{
                      padding: '10px 12px',
                      border: selectedSize === size ? '2px solid #000' : '1px solid #e5e5e5',
                      borderRadius: '6px',
                      backgroundColor: selectedSize === size ? '#f0f0f0' : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{info.label}</span>
                      {selectedSize === size && <span style={{ color: '#22c55e' }}>✓</span>}
                    </div>
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{info.dimensions}</p>
                    <p style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>{info.use}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '200px',
            height: '200px',
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backgroundColor: '#f9fafb',
            marginBottom: '12px',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = '#000';
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db';
            e.currentTarget.style.backgroundColor = '#f9fafb';
          }}
        >
          <svg width="40" height="40" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M12 16V8m0 0l-3 3m3-3l3 3M3 16.5v2a2.5 2.5 0 002.5 2.5h13a2.5 2.5 0 002.5-2.5v-2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px', fontWeight: 500 }}>
            {uploading ? 'Processing...' : 'Click to upload'}
          </span>
          <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            JPEG, PNG, GIF, WebP (max 10MB)
          </span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Error message */}
      {error && (
        <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '8px' }}>⚠️ {error}</p>
      )}

      {/* Change button when image exists */}
      {preview && !uploading && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #e5e5e5',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Change Image
        </button>
      )}
    </div>
  );
}
