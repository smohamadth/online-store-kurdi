'use client';

import { useState, useRef } from 'react';

interface ImageVariants {
  thumbnail?: string;
  medium?: string;
  large?: string;
  zoom?: string;
}

interface GalleryImage {
  id: string;
  url: string;
  alt: string;
  isPrimary: boolean;
  variants?: ImageVariants;
  sortOrder: number;
}

interface ImageGalleryUploadProps {
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  maxImages?: number;
}

export default function ImageGalleryUpload({
  images,
  onChange,
  maxImages = 10,
}: ImageGalleryUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${maxImages} images allowed`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setUploading(true);
    setError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const API_BASE = API_URL.replace('/api', '');
      const token = localStorage.getItem('token');

      for (const file of filesToUpload) {
        // Validate
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          setError(`${file.name}: Invalid file type`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          setError(`${file.name}: File too large (max 10MB)`);
          continue;
        }

        // Upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'products');

        try {
          const response = await fetch(`${API_URL}/upload/image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            const buildUrl = (path: string) => path?.startsWith('http') ? path : `${API_BASE}${path}`;

            const newImage: GalleryImage = {
              id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              url: buildUrl(data.data?.large || data.data?.medium || data.data?.url),
              alt: file.name.replace(/\.[^/.]+$/, ''),
              isPrimary: images.length === 0,
              sortOrder: images.length,
              variants: {
                thumbnail: buildUrl(data.data?.thumbnail),
                medium: buildUrl(data.data?.medium),
                large: buildUrl(data.data?.large),
                zoom: buildUrl(data.data?.zoom),
              },
            };

            onChange([...images, newImage]);
          } else {
            // Fallback to base64
            const reader = new FileReader();
            reader.onload = (ev) => {
              const newImage: GalleryImage = {
                id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                url: ev.target?.result as string,
                alt: file.name.replace(/\.[^/.]+$/, ''),
                isPrimary: images.length === 0,
                sortOrder: images.length,
              };
              onChange([...images, newImage]);
            };
            reader.readAsDataURL(file);
          }
        } catch (err) {
          console.error('Upload error:', err);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = (id: string) => {
    const updated = images.filter(img => img.id !== id);
    // If removed image was primary, make first image primary
    if (updated.length > 0 && !updated.some(img => img.isPrimary)) {
      updated[0].isPrimary = true;
    }
    // Update sort orders
    updated.forEach((img, i) => img.sortOrder = i);
    onChange(updated);
  };

  const setPrimary = (id: string) => {
    onChange(images.map(img => ({
      ...img,
      isPrimary: img.id === id,
    })));
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    const updated = [...images];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    updated.forEach((img, i) => img.sortOrder = i);
    onChange(updated);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      moveImage(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <label style={{ fontSize: '14px', fontWeight: 500 }}>
          📸 Product Images ({images.length}/{maxImages})
        </label>
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '6px 14px',
              backgroundColor: uploading ? '#ccc' : '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? 'Uploading...' : '+ Add Images'}
          </button>
        )}
      </div>

      {/* Image Grid */}
      {images.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}>
          {images.map((image, index) => (
            <div
              key={image.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              style={{
                position: 'relative',
                borderRadius: '8px',
                overflow: 'hidden',
                border: image.isPrimary ? '3px solid #000' : '2px solid #e5e5e5',
                cursor: 'grab',
                opacity: draggedIndex === index ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {/* Image */}
              <div style={{
                aspectRatio: '1',
                backgroundColor: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {image.url ? (
                  <img
                    src={image.variants?.thumbnail || image.url}
                    alt={image.alt}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '32px' }}>📷</span>
                )}
              </div>

              {/* Primary Badge */}
              {image.isPrimary && (
                <div style={{
                  position: 'absolute',
                  top: '6px',
                  left: '6px',
                  padding: '2px 6px',
                  backgroundColor: '#000',
                  color: '#fff',
                  fontSize: '10px',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}>
                  MAIN
                </div>
              )}

              {/* Sort Order */}
              <div style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '20px',
                height: '20px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 600,
              }}>
                {index + 1}
              </div>

              {/* Actions Overlay */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '6px',
                display: 'flex',
                gap: '4px',
                justifyContent: 'center',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
              }}>
                {!image.isPrimary && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPrimary(image.id); }}
                    title="Set as main image"
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'rgba(255,255,255,0.9)',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    ⭐
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(image.id); }}
                  title="Remove image"
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'rgba(239,68,68,0.9)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {images.length === 0 && (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '40px',
            border: '2px dashed #d1d5db',
            borderRadius: '8px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: '#f9fafb',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📸</div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#666' }}>
            {uploading ? 'Uploading...' : 'Click to upload images'}
          </p>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            Drag to reorder. First image is the main image.
          </p>
        </div>
      )}

      {/* Help Text */}
      <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
        💡 Drag images to reorder. Click ⭐ to set as main image. First image is used as the product thumbnail.
      </p>

      {/* Error */}
      {error && (
        <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '8px' }}>⚠️ {error}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
