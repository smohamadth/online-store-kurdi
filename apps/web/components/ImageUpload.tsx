'use client';

import { useState, useRef } from 'react';

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
}

export default function ImageUpload({
  onUpload,
  currentImage,
  label = 'Upload Image',
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      // Create local preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Try to upload to API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'products');

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
        const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace('/api', '');
        
        // Get the best URL and prepend base URL for relative paths
        const rawUrl = data.data?.large || data.data?.medium || data.data?.url;
        const imageUrl = rawUrl?.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`;
        
        const thumbnailUrl = data.data?.thumbnail?.startsWith('http') ? data.data.thumbnail : `${API_BASE}${data.data?.thumbnail || ''}`;
        const mediumUrl = data.data?.medium?.startsWith('http') ? data.data.medium : `${API_BASE}${data.data?.medium || ''}`;
        const largeUrl = data.data?.large?.startsWith('http') ? data.data.large : `${API_BASE}${data.data?.large || ''}`;
        const zoomUrl = data.data?.zoom?.startsWith('http') ? data.data.zoom : `${API_BASE}${data.data?.zoom || ''}`;
        
        setPreview(imageUrl);
        onUpload(imageUrl, {
          thumbnail: thumbnailUrl,
          medium: mediumUrl,
          large: largeUrl,
          zoom: zoomUrl,
        });
      } else {
        // If API fails, use base64 as fallback
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setPreview(dataUrl);
          onUpload(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('Upload error:', err);
      // Fallback to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreview(dataUrl);
        onUpload(dataUrl);
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
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
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
          <img
            src={preview}
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
