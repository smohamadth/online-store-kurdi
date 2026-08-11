'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Head from 'next/head';
import { useCart } from '@/lib/store';
import { api, Product, getCategoryEmoji } from '@/lib/api';
import ReviewSection from '@/components/ReviewSection';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { useIsMobile } from '@/lib/hooks';

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { addItem, items } = useCart();
  const { settings } = useStoreSettings();
  
  const slug = params?.slug as string;
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [stockAlertSet, setStockAlertSet] = useState(false);
  const [stockAlertEmail, setStockAlertEmail] = useState('');
  const [showStockAlertForm, setShowStockAlertForm] = useState(false);

  useEffect(() => {
    if (slug) fetchProduct();
  }, [slug]);

  useEffect(() => {
    if (product?.id) checkWishlistStatus(product.id);
  }, [product?.id]);

  const fetchProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getProductBySlug(slug);
      setProduct(response.data);
      if (response.data?.variants?.length > 0) {
        setSelectedVariant(response.data.variants[0].id);
      }
    } catch (err) {
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId }),
      });
      if (response.ok) {
        const data = await response.json();
        setInWishlist(data.data?.inWishlist || false);
      }
    } catch (err) {}
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
        <p style={{ fontSize: '18px', color: '#666' }}>Loading product...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 16px', textAlign: 'center' }}>
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

  const currentVariant = product.variants?.find((v) => v.id === selectedVariant);
  const currentPrice = currentVariant ? Number(currentVariant.price) : Number(product.price);
  const currentVariantName = currentVariant?.name || null;

  const getVariantDisplay = (variant: any) => {
    try {
      const attrs = typeof variant.attributes === 'string' ? JSON.parse(variant.attributes) : variant.attributes;
      return Object.values(attrs).join(' - ');
    } catch {
      return variant.name;
    }
  };

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

  const handleBuyNow = () => {
    handleAddToCart();
    router.push('/cart');
  };

  const handleWishlist = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { router.push('/login'); return; }
      if (!product?.id) return;

      if (inWishlist) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist/${product.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        setInWishlist(false);
      } else {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/wishlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ productId: product.id }),
        });
        setInWishlist(true);
      }
    } catch (err) {
      console.error('Wishlist error:', err);
    }
  };

  const handleStockAlert = async () => {
    try {
      const token = localStorage.getItem('token');
      const email = stockAlertEmail || localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').email : '';
      
      if (!email && !stockAlertEmail) {
        setShowStockAlertForm(true);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/stock-alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          productId: product?.id,
          variantId: selectedVariant || undefined,
          email: stockAlertEmail || email,
        }),
      });

      if (response.ok) {
        setStockAlertSet(true);
        setShowStockAlertForm(false);
      }
    } catch (err) {
      console.error('Stock alert error:', err);
    }
  };

  const allImages = product.images && product.images.length > 0
    ? product.images
    : [{ id: 'placeholder', url: '', alt: product.name, isPrimary: true }];

  return (
    <>
      <Head>
        <title>{product.name} | {settings.storeName}</title>
        <meta name="description" content={product.shortDescription || product.description} />
        <meta property="og:title" content={product.name} />
        <meta property="og:description" content={product.shortDescription || product.description} />
        <meta property="og:type" content="product" />
        <meta property="og:url" content={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://yourstore.com'}/products/${slug}`} />
        {product.images?.[0]?.url && (
          <meta property="og:image" content={product.images[0].url} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={product.name} />
        <meta name="twitter:description" content={product.shortDescription || product.description} />
        <link rel="canonical" href={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://yourstore.com'}/products/${slug}`} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.name,
              description: product.description,
              image: product.images?.map((img: any) => img.url) || [],
              sku: product.sku,
              offers: {
                '@type': 'Offer',
                price: product.price,
                priceCurrency: settings.currency || 'USD',
                availability: product.quantity > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
              },
              aggregateRating: product.reviewCount > 0 ? {
                '@type': 'AggregateRating',
                ratingValue: product.averageRating,
                reviewCount: product.reviewCount,
              } : undefined,
            }),
          }}
        />
      </Head>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ 
        marginBottom: '24px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        fontSize: '14px', 
        color: '#666',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/products" style={{ textDecoration: 'none', color: '#666' }}>Products</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>{product.name}</span>
      </nav>

      {/* Product Details - Responsive Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: isMobile ? '24px' : '32px',
        marginBottom: '48px',
      }}>
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
            marginBottom: '12px',
          }}>
            {allImages[selectedImageIndex]?.url ? (
              <img 
                src={allImages[selectedImageIndex].url} 
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '80px' }}>{getCategoryEmoji(product.category?.name)}</span>
            )}
          </div>
          
          {/* Thumbnails */}
          {allImages.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
              {allImages.map((img, i) => (
                <div 
                  key={img.id || i}
                  onClick={() => setSelectedImageIndex(i)}
                  style={{
                    width: '60px',
                    height: '60px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: i === selectedImageIndex ? '2px solid #000' : '2px solid transparent',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {img.url ? (
                    <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '24px' }}>{getCategoryEmoji(product.category?.name)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{product.category?.name}</p>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>{product.name}</h1>
          
          {/* Rating */}
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '2px' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} style={{ color: i <= Math.floor(product.averageRating || 0) ? '#f59e0b' : '#d1d5db', fontSize: '18px' }}>★</span>
              ))}
            </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {product.averageRating || 0} ({product.reviewCount || 0} reviews)
            </span>
          </div>

          {/* Price */}
          <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '32px', fontWeight: 'bold' }}>${currentPrice.toFixed(2)}</span>
              {product.compareAtPrice && !currentVariant && (
                <>
                  <span style={{ fontSize: '18px', color: '#666', textDecoration: 'line-through' }}>
                    ${Number(product.compareAtPrice).toFixed(2)}
                  </span>
                  <span style={{
                    padding: '4px 10px',
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
            
            {/* Stock Alert for out of stock */}
            {product.quantity <= 0 && (
              <div style={{ marginTop: '12px' }}>
                {stockAlertSet ? (
                  <p style={{ fontSize: '14px', color: '#22c55e' }}>
                    ✓ You will be notified when this product is back in stock!
                  </p>
                ) : showStockAlertForm ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="email"
                      value={stockAlertEmail}
                      onChange={(e) => setStockAlertEmail(e.target.value)}
                      placeholder="Enter your email"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid #e5e5e5',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                    <button
                      onClick={handleStockAlert}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#000',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Notify Me
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleStockAlert}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f5f5f5',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    🔔 Notify me when back in stock
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Short Description */}
          {product.shortDescription && (
            <p style={{ marginTop: '20px', fontSize: '15px', color: '#555', lineHeight: 1.6 }}>
              {product.shortDescription}
            </p>
          )}

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
                Options: {currentVariantName && <span style={{ fontWeight: 400, color: '#666' }}>{getVariantDisplay(currentVariant)}</span>}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariant(variant.id)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: selectedVariant === variant.id ? '2px solid #000' : '1px solid #e5e5e5',
                      backgroundColor: selectedVariant === variant.id ? '#f5f5f5' : 'white',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: selectedVariant === variant.id ? 600 : 400,
                    }}
                  >
                    {getVariantDisplay(variant)}
                    <span style={{ marginLeft: '6px', color: '#666' }}>${Number(variant.price).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Quantity:</h3>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '6px',
              border: '1px solid #e5e5e5',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{ padding: '10px 16px', fontSize: '16px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer' }}
              >
                -
              </button>
              <span style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 600 }}>{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(product.quantity, quantity + 1))}
                style={{ padding: '10px 16px', fontSize: '16px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer' }}
              >
                +
              </button>
            </div>
          </div>

          {/* Add to Cart Buttons */}
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleAddToCart}
                disabled={product.quantity <= 0}
                style={{
                  flex: 1,
                  padding: '14px 24px',
                  backgroundColor: product.quantity <= 0 ? '#ccc' : (addedToCart ? '#22c55e' : '#000'),
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: product.quantity <= 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {product.quantity <= 0 ? 'Out of Stock' : (addedToCart ? '✓ Added!' : 'Add to Cart')}
              </button>
              <button
                onClick={handleWishlist}
                style={{
                  padding: '14px',
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
            <button
              onClick={handleBuyNow}
              disabled={product.quantity <= 0}
              style={{
                width: '100%',
                padding: '14px 24px',
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
          </div>

          {/* SKU */}
          <p style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
            SKU: {product.sku}
          </p>
        </div>
      </div>

      {/* Product Description */}
      <div style={{ padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '48px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px' }}>Description</h2>
        <p style={{ lineHeight: 1.8, color: '#333', fontSize: '16px' }}>{product.description}</p>
      </div>

      {/* Reviews Section */}
      <ReviewSection productId={product.id} productName={product.name} />
    </div>
    </>
  );
}
