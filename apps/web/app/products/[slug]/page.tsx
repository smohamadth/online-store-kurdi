'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/store';
import { api, Product, getCategoryEmoji } from '@/lib/api';
import ReviewSection from '@/components/ReviewSection';

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const { addItem, items } = useCart();
  
  const slug = params?.slug as string;
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Fetch product from API
  useEffect(() => {
    if (slug) {
      fetchProduct();
    }
  }, [slug]);

  // Check wishlist status after product loads
  useEffect(() => {
    if (product?.id) {
      checkWishlistStatus(product.id);
    }
  }, [product?.id]);

  // Check if already in cart
  const isInCart = product ? items.some(item => 
    item.productId === product.id && 
    item.variant === (currentVariantName || undefined)
  ) : false;

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.getProductBySlug(slug);
      setProduct(response.data);
      
      // Set first variant as default
      if (response.data?.variants?.length > 0) {
        setSelectedVariant(response.data.variants[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch product:', err);
      setError('Product not found or API unavailable');
    } finally {
      setLoading(false);
    }
  };

  const checkWishlistStatus = async (productId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId }),
      });

      if (response.ok) {
        const data = await response.json();
        setInWishlist(data.data?.inWishlist || false);
      }
    } catch (err) {
      // Ignore wishlist check errors
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '100px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
        <p style={{ fontSize: '18px', color: '#666' }}>Loading product...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '100px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
        <p style={{ fontSize: '18px', color: '#666', marginBottom: '32px' }}>{error || 'Product not found'}</p>
        <Link href="/products" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: '6px',
          textDecoration: 'none',
        }}>
          Back to Products
        </Link>
      </div>
    );
  }

  // Get current price based on selected variant
  const currentVariant = product.variants?.find((v) => v.id === selectedVariant);
  const currentPrice = currentVariant ? Number(currentVariant.price) : Number(product.price);
  const currentVariantName = currentVariant?.name || null;

  // Parse variant attributes
  const getVariantDisplay = (variant: any) => {
    try {
      const attrs = typeof variant.attributes === 'string' ? JSON.parse(variant.attributes) : variant.attributes;
      return Object.values(attrs).join(' - ');
    } catch {
      return variant.name;
    }
  };

  // Handle add to cart
  const handleAddToCart = () => {
    if (!product) return;
    
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: currentPrice,
      quantity: quantity,
      variant: currentVariantName || undefined,
      variantId: selectedVariant || undefined,
      category: product.category?.name || 'Other',
    });

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  // Handle buy now
  const handleBuyNow = () => {
    handleAddToCart();
    router.push('/cart');
  };

  // Handle wishlist
  const handleWishlist = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      if (!product?.id) return;

      if (inWishlist) {
        // Remove from wishlist
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist/${product.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        setInWishlist(false);
      } else {
        // Add to wishlist
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ productId: product.id }),
        });
        setInWishlist(true);
      }
    } catch (err) {
      console.error('Wishlist error:', err);
    }
  };

  // Get all images (product images + placeholder)
  const allImages = product.images && product.images.length > 0
    ? product.images
    : [{ id: 'placeholder', url: '', alt: product.name, isPrimary: true }];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/products" style={{ textDecoration: 'none', color: '#666' }}>Products</Link>
        <span>/</span>
        <Link href={`/products?category=${product.category?.slug}`} style={{ textDecoration: 'none', color: '#666' }}>
          {product.category?.name}
        </Link>
        <span>/</span>
        <span style={{ color: '#000' }}>{product.name}</span>
      </nav>

      {/* Product Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
        {/* Product Images */}
        <div>
          {/* Main Image */}
          <div style={{
            aspectRatio: '1',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {allImages[selectedImageIndex]?.url ? (
              <img 
                src={allImages[selectedImageIndex].url} 
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '120px' }}>{getCategoryEmoji(product.category?.name)}</span>
            )}
          </div>
          
          {/* Thumbnails */}
          {allImages.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              {allImages.map((img, i) => (
                <div 
                  key={img.id || i}
                  onClick={() => setSelectedImageIndex(i)}
                  style={{
                    width: '80px',
                    height: '80px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: i === selectedImageIndex ? '2px solid #000' : '2px solid transparent',
                    overflow: 'hidden',
                  }}
                >
                  {img.url ? (
                    <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '32px' }}>{getCategoryEmoji(product.category?.name)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{product.category?.name}</p>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>{product.name}</h1>
          
          {/* Rating */}
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '2px' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} style={{ color: i <= Math.floor(product.averageRating || 0) ? '#f59e0b' : '#d1d5db', fontSize: '20px' }}>★</span>
              ))}
            </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {product.averageRating || 0} ({product.reviewCount || 0} reviews)
            </span>
          </div>

          {/* Price */}
          <div style={{ marginTop: '24px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '36px', fontWeight: 'bold' }}>${currentPrice.toFixed(2)}</span>
              {product.compareAtPrice && !currentVariant && (
                <>
                  <span style={{ fontSize: '20px', color: '#666', textDecoration: 'line-through' }}>
                    ${Number(product.compareAtPrice).toFixed(2)}
                  </span>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '50px',
                    backgroundColor: '#fef2f2',
                    color: '#ef4444',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}>
                    Save ${(Number(product.compareAtPrice) - currentPrice).toFixed(2)}
                  </span>
                </>
              )}
            </div>
            <p style={{ marginTop: '8px', fontSize: '14px', color: product.quantity > 0 ? '#22c55e' : '#ef4444' }}>
              {product.quantity > 0 ? `✓ In stock (${product.quantity} available)` : '✗ Out of stock'}
            </p>
          </div>

          {/* Short Description */}
          {product.shortDescription && (
            <p style={{ marginTop: '24px', fontSize: '16px', color: '#555', lineHeight: 1.6 }}>
              {product.shortDescription}
            </p>
          )}

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                Options: {currentVariantName && <span style={{ fontWeight: 400, color: '#666' }}>{getVariantDisplay(currentVariant)}</span>}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant.id)}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '6px',
                      border: selectedVariant === variant.id ? '2px solid #000' : '1px solid #e5e5e5',
                      backgroundColor: selectedVariant === variant.id ? '#f5f5f5' : 'white',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: selectedVariant === variant.id ? 600 : 400,
                      transition: 'all 0.2s',
                    }}
                  >
                    {getVariantDisplay(variant)}
                    <span style={{ marginLeft: '8px', color: '#666' }}>${Number(variant.price).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Quantity:</h3>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '6px',
              border: '1px solid #e5e5e5',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{
                  padding: '12px 18px',
                  fontSize: '18px',
                  border: 'none',
                  backgroundColor: '#f5f5f5',
                  cursor: 'pointer',
                }}
              >
                -
              </button>
              <span style={{ padding: '12px 24px', fontSize: '16px', fontWeight: 600, minWidth: '40px', textAlign: 'center' }}>
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(Math.min(product.quantity, quantity + 1))}
                style={{
                  padding: '12px 18px',
                  fontSize: '18px',
                  border: 'none',
                  backgroundColor: '#f5f5f5',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Add to Cart Buttons */}
          <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
            <button
              onClick={handleAddToCart}
              disabled={product.quantity <= 0}
              style={{
                flex: 1,
                padding: '16px 32px',
                backgroundColor: product.quantity <= 0 ? '#ccc' : (addedToCart ? '#22c55e' : '#000'),
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: product.quantity <= 0 ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {product.quantity <= 0 ? 'Out of Stock' : (addedToCart ? '✓ Added to Cart!' : isInCart ? 'Add More' : 'Add to Cart')}
            </button>
            <button
              onClick={handleBuyNow}
              disabled={product.quantity <= 0}
              style={{
                flex: 1,
                padding: '16px 32px',
                backgroundColor: 'white',
                color: product.quantity <= 0 ? '#ccc' : '#000',
                border: `2px solid ${product.quantity <= 0 ? '#ccc' : '#000'}`,
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: product.quantity <= 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Buy Now
            </button>
            <button
              onClick={handleWishlist}
              style={{
                padding: '16px',
                backgroundColor: inWishlist ? '#fef2f2' : 'white',
                color: inWishlist ? '#ef4444' : '#000',
                border: `2px solid ${inWishlist ? '#ef4444' : '#e5e5e5'}`,
                borderRadius: '6px',
                fontSize: '20px',
                cursor: 'pointer',
              }}
            >
              {inWishlist ? '❤️' : '🤍'}
            </button>
          </div>

          {/* SKU */}
          <p style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
            SKU: {product.sku}
          </p>
        </div>
      </div>

      {/* Product Description */}
      <div style={{ marginTop: '64px', padding: '32px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Description</h2>
        <p style={{ lineHeight: 1.8, color: '#333', fontSize: '16px' }}>{product.description}</p>
      </div>

      {/* Reviews Section */}
      <ReviewSection productId={product.id} productName={product.name} />
    </div>
  );
}
