'use client';

import { useState, useRef } from 'react';

interface ImageUploadProps {
  onUpload: (url: string) => void;
  currentImage?: string;
  label?: string;
}

export default function ImageUpload({
  onUpload,
  currentImage,
  label = 'Upload Image',
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPEG, PNG, GIF, or WebP image');
      return;
    }

    // Validate file size (5MB for base64)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setError('');

    // Convert to base64 data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      onUpload(dataUrl);
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsDataURL(file);
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
              width: '150px',
              height: '150px',
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
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              color: 'white',
              border: '2px solid white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '150px',
            height: '150px',
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
          <svg width="32" height="32" fill="none" stroke="#9ca3af" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M12 16V8m0 0l-3 3m3-3l3 3M3 16.5v2a2.5 2.5 0 002.5 2.5h13a2.5 2.5 0 002.5-2.5v-2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
            Click to upload
          </span>
          <span style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
            JPEG, PNG, GIF, WebP
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
      {preview && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #e5e5e5',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Change Image
        </button>
      )}
    </div>
  );
}
