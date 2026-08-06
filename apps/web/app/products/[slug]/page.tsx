'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/store';

// Product data
const productsData: Record<string, any> = {
  'iphone-15-pro': {
    id: '1',
    name: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    description: 'The latest iPhone with A17 Pro chip, titanium design, and advanced camera system. Features a stunning Super Retina XDR display with ProMotion technology.',
    shortDescription: 'Latest iPhone with A17 Pro chip',
    price: 999.99,
    compareAtPrice: 1099.99,
    category: 'Electronics',
    rating: 4.8,
    reviewCount: 124,
    inStock: true,
    quantity: 50,
    features: ['A17 Pro chip', 'Titanium design', '48MP camera system', 'Action button', 'USB-C connector', 'All-day battery life'],
    variants: [
      { id: '1', name: '128GB - Natural Titanium', price: 999.99 },
      { id: '2', name: '256GB - Natural Titanium', price: 1099.99 },
      { id: '3', name: '512GB - Blue Titanium', price: 1299.99 },
    ],
    reviews: [
      { id: '1', user: 'John D.', rating: 5, title: 'Amazing phone!', comment: 'The camera quality is incredible.', date: '2024-01-15' },
      { id: '2', user: 'Sarah M.', rating: 5, title: 'Best iPhone ever', comment: 'Love the titanium design.', date: '2024-01-10' },
    ],
    relatedProducts: ['macbook-pro-14', 'classic-t-shirt'],
  },
  'macbook-pro-14': {
    id: '2',
    name: 'MacBook Pro 14"',
    slug: 'macbook-pro-14',
    description: 'Powerful laptop with M3 chip, Liquid Retina XDR display, and all-day battery life.',
    shortDescription: 'Professional laptop with M3 chip',
    price: 1599.99,
    category: 'Electronics',
    rating: 4.9,
    reviewCount: 89,
    inStock: true,
    quantity: 30,
    features: ['M3 chip', 'Liquid Retina XDR display', 'All-day battery', 'MagSafe charging'],
    variants: [
      { id: '1', name: '16GB RAM - 512GB SSD', price: 1599.99 },
      { id: '2', name: '32GB RAM - 1TB SSD', price: 1999.99 },
    ],
    reviews: [],
    relatedProducts: ['iphone-15-pro'],
  },
  'classic-t-shirt': {
    id: '3',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: 'Comfortable cotton t-shirt available in multiple colors.',
    shortDescription: 'Comfortable cotton t-shirt',
    price: 29.99,
    category: 'Clothing',
    rating: 4.5,
    reviewCount: 256,
    inStock: true,
    quantity: 200,
    features: ['100% cotton', 'Multiple colors', 'Comfortable fit', 'Machine washable'],
    variants: [
      { id: '1', name: 'Small - Black', price: 29.99 },
      { id: '2', name: 'Medium - Black', price: 29.99 },
      { id: '3', name: 'Large - Black', price: 29.99 },
      { id: '4', name: 'Medium - White', price: 29.99 },
    ],
    reviews: [],
    relatedProducts: ['iphone-15-pro'],
  },
  'web-development-course': {
    id: '4',
    name: 'Web Development Course',
    slug: 'web-development-course',
    description: 'Complete web development course covering HTML, CSS, JavaScript, React, and Node.js.',
    shortDescription: 'Learn web development from scratch',
    price: 49.99,
    compareAtPrice: 99.99,
    category: 'Digital Products',
    rating: 4.7,
    reviewCount: 312,
    inStock: true,
    quantity: 999,
    features: ['Lifetime access', 'Certificate included', 'Hands-on projects', 'Expert instructor'],
    variants: [],
    reviews: [],
    relatedProducts: ['javascript-good-parts'],
  },
  'javascript-good-parts': {
    id: '5',
    name: 'JavaScript: The Good Parts',
    slug: 'javascript-good-parts',
    description: 'A classic book about JavaScript programming by Douglas Crockford.',
    shortDescription: 'Classic JavaScript programming book',
    price: 24.99,
    category: 'Books',
    rating: 4.6,
    reviewCount: 178,
    inStock: true,
    quantity: 150,
    features: ['Classic reference', 'Best practices', 'Expert author'],
    variants: [],
    reviews: [],
    relatedProducts: ['web-development-course'],
  },
};

function getCategoryEmoji(category: string): string {
  switch (category) {
    case 'Electronics': return '📱';
    case 'Clothing': return '👕';
    case 'Books': return '📚';
    case 'Digital Products': return '💻';
    default: return '📦';
  }
}

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  
  const slug = params?.slug as string;
  const product = productsData[slug];

  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    product?.variants?.[0]?.id || null
  );
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  if (!product) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '100px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '16px' }}>404</h1>
        <p style={{ fontSize: '18px', color: '#666', marginBottom: '32px' }}>Product not found</p>
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
  const currentVariant = product.variants?.find((v: any) => v.id === selectedVariant);
  const currentPrice = currentVariant?.price || product.price;
  const currentVariantName = currentVariant?.name || null;

  // Handle add to cart
  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: currentPrice,
      quantity: quantity,
      variant: currentVariantName || undefined,
      category: product.category,
    });

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  // Handle buy now
  const handleBuyNow = () => {
    handleAddToCart();
    router.push('/cart');
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/products" style={{ textDecoration: 'none', color: '#666' }}>Products</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>{product.name}</span>
      </nav>

      {/* Product Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
        {/* Product Image */}
        <div>
          <div style={{
            aspectRatio: '1',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '120px',
          }}>
            {getCategoryEmoji(product.category)}
          </div>
        </div>

        {/* Product Info */}
        <div>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>{product.category}</p>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>{product.name}</h1>
          
          {/* Rating */}
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '2px' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} style={{ color: i <= Math.floor(product.rating) ? '#f59e0b' : '#d1d5db', fontSize: '20px' }}>★</span>
              ))}
            </div>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {product.rating} ({product.reviewCount} reviews)
            </span>
          </div>

          {/* Price */}
          <div style={{ marginTop: '24px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '36px', fontWeight: 'bold' }}>${currentPrice}</span>
              {product.compareAtPrice && !currentVariant && (
                <>
                  <span style={{ fontSize: '20px', color: '#666', textDecoration: 'line-through' }}>
                    ${product.compareAtPrice}
                  </span>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '50px',
                    backgroundColor: '#fef2f2',
                    color: '#ef4444',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}>
                    Save ${(product.compareAtPrice - currentPrice).toFixed(2)}
                  </span>
                </>
              )}
            </div>
            <p style={{ marginTop: '8px', fontSize: '14px', color: product.inStock ? '#22c55e' : '#ef4444' }}>
              {product.inStock ? `✓ In stock (${product.quantity} available)` : '✗ Out of stock'}
            </p>
          </div>

          {/* Short Description */}
          <p style={{ marginTop: '24px', fontSize: '16px', color: '#555', lineHeight: 1.6 }}>
            {product.shortDescription}
          </p>

          {/* Variants */}
          {product.variants && product.variants.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                Options: {currentVariantName && <span style={{ fontWeight: 400, color: '#666' }}>{currentVariantName}</span>}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {product.variants.map((variant: any) => (
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
                    {variant.name}
                    {variant.price !== product.price && (
                      <span style={{ marginLeft: '8px', color: '#666' }}>${variant.price}</span>
                    )}
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
              style={{
                flex: 1,
                padding: '16px 32px',
                backgroundColor: addedToCart ? '#22c55e' : '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {addedToCart ? '✓ Added to Cart!' : 'Add to Cart'}
            </button>
            <button
              onClick={handleBuyNow}
              style={{
                flex: 1,
                padding: '16px 32px',
                backgroundColor: 'white',
                color: '#000',
                border: '2px solid #000',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Buy Now
            </button>
          </div>

          {/* Features */}
          {product.features && product.features.length > 0 && (
            <div style={{ marginTop: '32px', padding: '24px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Key Features</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {product.features.map((feature: string, index: number) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>✓</span>
                    <span style={{ fontSize: '14px' }}>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Description */}
      <div style={{ marginTop: '64px', padding: '32px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Description</h2>
        <p style={{ lineHeight: 1.8, color: '#333', fontSize: '16px' }}>{product.description}</p>
      </div>

      {/* Reviews */}
      {product.reviews && product.reviews.length > 0 && (
        <div style={{ marginTop: '64px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Customer Reviews</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {product.reviews.map((review: any) => (
              <div key={review.id} style={{
                padding: '24px',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                backgroundColor: 'white',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{review.user}</span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#22c55e' }}>✓ Verified</span>
                  </div>
                  <span style={{ fontSize: '14px', color: '#666' }}>{review.date}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} style={{ color: i <= review.rating ? '#f59e0b' : '#d1d5db' }}>★</span>
                  ))}
                  <span style={{ marginLeft: '8px', fontWeight: 600 }}>{review.title}</span>
                </div>
                <p style={{ color: '#555', lineHeight: 1.6 }}>{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Products */}
      {product.relatedProducts && product.relatedProducts.length > 0 && (
        <div style={{ marginTop: '64px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Related Products</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
            {product.relatedProducts.map((relatedSlug: string) => {
              const relatedProduct = productsData[relatedSlug];
              if (!relatedProduct) return null;
              return (
                <Link
                  key={relatedSlug}
                  href={`/products/${relatedSlug}`}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    borderRadius: '8px',
                    border: '1px solid #e5e5e5',
                    textDecoration: 'none',
                    color: '#000',
                    backgroundColor: 'white',
                  }}
                >
                  <div style={{
                    aspectRatio: '1',
                    backgroundColor: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                  }}>
                    {getCategoryEmoji(relatedProduct.category)}
                  </div>
                  <div style={{ padding: '16px' }}>
                    <h3 style={{ fontWeight: 600, fontSize: '14px' }}>{relatedProduct.name}</h3>
                    <p style={{ marginTop: '8px', fontWeight: 'bold', fontSize: '16px' }}>${relatedProduct.price}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}