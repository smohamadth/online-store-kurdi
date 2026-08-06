import Link from 'next/link';

const featuredProducts = [
  {
    id: '1',
    name: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    price: 999.99,
    compareAtPrice: 1099.99,
    category: 'Electronics',
    rating: 4.8,
    reviewCount: 124,
  },
  {
    id: '2',
    name: 'MacBook Pro 14"',
    slug: 'macbook-pro-14',
    price: 1599.99,
    category: 'Electronics',
    rating: 4.9,
    reviewCount: 89,
  },
  {
    id: '3',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    price: 29.99,
    category: 'Clothing',
    rating: 4.5,
    reviewCount: 256,
  },
  {
    id: '4',
    name: 'Web Development Course',
    slug: 'web-development-course',
    price: 49.99,
    compareAtPrice: 99.99,
    category: 'Digital Products',
    rating: 4.7,
    reviewCount: 312,
  },
];

const categories = [
  { name: 'Electronics', slug: 'electronics', emoji: '💻', count: 156 },
  { name: 'Clothing', slug: 'clothing', emoji: '👕', count: 243 },
  { name: 'Books', slug: 'books', emoji: '📚', count: 89 },
  { name: 'Digital Products', slug: 'digital-products', emoji: '📱', count: 67 },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(to right, #1a1a2e, #16213e)',
        color: 'white',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '96px 20px',
        }}>
          <div style={{ maxWidth: '600px' }}>
            <h1 style={{
              fontSize: '48px',
              fontWeight: 'bold',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}>
              Discover Amazing Products
            </h1>
            <p style={{
              marginTop: '24px',
              fontSize: '18px',
              lineHeight: 1.6,
              color: '#d1d5db',
            }}>
              Shop the latest electronics, clothing, books, and digital products. 
              Get the best deals with fast shipping and excellent customer service.
            </p>
            <div style={{
              marginTop: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}>
              <Link href="/products" style={{
                display: 'inline-block',
                padding: '12px 24px',
                backgroundColor: 'white',
                color: '#111',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}>
                Shop Now
              </Link>
              <Link href="/deals" style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'white',
                textDecoration: 'none',
              }}>
                View Deals →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 20px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: '30px', fontWeight: 'bold' }}>Shop by Category</h2>
            <p style={{ marginTop: '8px', color: '#666' }}>
              Browse our wide selection of products
            </p>
          </div>
          <Link href="/categories" style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#000',
            textDecoration: 'none',
          }}>
            View All Categories →
          </Link>
        </div>
        <div style={{
          marginTop: '32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
        }}>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/products?category=${category.slug}`}
              style={{
                display: 'block',
                overflow: 'hidden',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                backgroundColor: 'white',
                textDecoration: 'none',
                color: '#000',
                transition: 'box-shadow 0.2s',
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
                {category.emoji}
              </div>
              <div style={{ padding: '16px' }}>
                <h3 style={{ fontWeight: 600 }}>{category.name}</h3>
                <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                  {category.count} products
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 20px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: '30px', fontWeight: 'bold' }}>Featured Products</h2>
            <p style={{ marginTop: '8px', color: '#666' }}>
              Our most popular items
            </p>
          </div>
          <Link href="/products" style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#000',
            textDecoration: 'none',
          }}>
            View All Products →
          </Link>
        </div>
        <div style={{
          marginTop: '32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px',
        }}>
          {featuredProducts.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              style={{
                display: 'block',
                overflow: 'hidden',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                backgroundColor: 'white',
                textDecoration: 'none',
                color: '#000',
                transition: 'box-shadow 0.2s',
              }}
            >
              <div style={{
                aspectRatio: '1',
                backgroundColor: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '64px',
              }}>
                {product.category === 'Electronics' && '📱'}
                {product.category === 'Clothing' && '👕'}
                {product.category === 'Digital Products' && '💻'}
                {product.category === 'Books' && '📚'}
              </div>
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: '#666' }}>{product.category}</p>
                <h3 style={{ marginTop: '4px', fontWeight: 600 }}>{product.name}</h3>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>${product.price}</span>
                  {product.compareAtPrice && (
                    <span style={{ fontSize: '14px', color: '#666', textDecoration: 'line-through' }}>
                      ${product.compareAtPrice}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#f59e0b' }}>★</span>
                  <span style={{ fontSize: '14px' }}>{product.rating}</span>
                  <span style={{ fontSize: '14px', color: '#666' }}>
                    ({product.reviewCount})
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section style={{ backgroundColor: '#f9f9f9' }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '64px 20px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '32px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🚚
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Free Shipping</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                On orders over $100
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🔒
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Secure Payment</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                100% secure checkout
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🌍
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Worldwide Shipping</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                Deliver to your door
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto',
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}>
                🔄
              </div>
              <h3 style={{ marginTop: '16px', fontWeight: 600 }}>Easy Returns</h3>
              <p style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                30 day return policy
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '64px 20px',
      }}>
        <div style={{
          borderRadius: '16px',
          backgroundColor: '#000',
          color: 'white',
          padding: '48px',
        }}>
          <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: '30px', fontWeight: 'bold' }}>Subscribe to Our Newsletter</h2>
            <p style={{ marginTop: '16px', fontSize: '18px', opacity: 0.9 }}>
              Get the latest updates on new products, sales, and exclusive offers.
            </p>
            <div style={{
              marginTop: '32px',
              display: 'flex',
              gap: '16px',
            }}>
              <input
                type="email"
                placeholder="Enter your email"
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'transparent',
                  color: 'white',
                  fontSize: '16px',
                }}
              />
              <button style={{
                padding: '12px 24px',
                backgroundColor: 'white',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                Subscribe
              </button>
            </div>
            <p style={{ marginTop: '16px', fontSize: '14px', opacity: 0.7 }}>
              We respect your privacy. Unsubscribe at any time.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}