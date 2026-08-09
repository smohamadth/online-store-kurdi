'use client';

import { useState, useRef } from 'react';

interface ImageUploadProps {
  onUpload: (url: string) => void;
  currentImage?: string;
  folder?: string;
  label?: string;
}

export default function ImageUpload({
  onUpload,
  currentImage,
  folder = 'products',
  label = 'Upload Image',
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getApiUrl = () => {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  };

  const getImageUrl = (url: string) => {
    // If URL starts with /uploads, prepend API base URL
    if (url.startsWith('/uploads')) {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';
      return `${baseUrl}${url}`;
    }
    return url;
  };

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
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);

      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiUrl()}/upload/image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const imageUrl = getImageUrl(data.data.url);
        onUpload(imageUrl);
        setPreview(imageUrl);
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        setError(errorData.message || 'Upload failed');
        setPreview(currentImage || null);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed. Is the API running?');
      setPreview(currentImage || null);
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
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <img
            src={preview}
            alt="Preview"
            style={{
              width: '200px',
              height: '200px',
              objectFit: 'cover',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
            }}
            onError={(e) => {
              // If image fails to load, show placeholder
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: '200px',
            height: '200px',
            border: '2px dashed #e5e5e5',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backgroundColor: '#f9f9f9',
            marginBottom: '12px',
            transition: 'border-color 0.2s',
          }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#000'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e5e5'}
        >
          <span style={{ fontSize: '32px', marginBottom: '8px' }}>📷</span>
          <span style={{ fontSize: '14px', color: '#666' }}>
            {uploading ? 'Uploading...' : 'Click to upload'}
          </span>
          <span style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
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
        <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px' }}>{error}</p>
      )}
    </div>
  );
}
