#!/bin/bash

# Test the API endpoints

echo "🧪 Testing Store API..."
echo ""

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Test health endpoint
echo "1. Testing health endpoint..."
HEALTH=$(curl -s http://localhost:3001/health 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Health check passed"
    echo "   Response: $HEALTH"
else
    echo "❌ Health check failed"
fi

echo ""

# Test API root
echo "2. Testing API root..."
API_ROOT=$(curl -s http://localhost:3001/api 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ API root accessible"
    echo "   Response: $API_ROOT"
else
    echo "❌ API root not accessible"
fi

echo ""

# Test products endpoint
echo "3. Testing products endpoint..."
PRODUCTS=$(curl -s http://localhost:3001/api/products 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Products endpoint accessible"
    echo "   Response: $PRODUCTS" | head -c 200
    echo "..."
else
    echo "❌ Products endpoint not accessible"
fi

echo ""

# Test featured products
echo "4. Testing featured products..."
FEATURED=$(curl -s http://localhost:3001/api/products/featured 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Featured products accessible"
else
    echo "❌ Featured products not accessible"
fi

echo ""

# Test search
echo "5. Testing product search..."
SEARCH=$(curl -s "http://localhost:3001/api/products/search?q=iphone" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Product search accessible"
else
    echo "❌ Product search not accessible"
fi

echo ""

# Test recommendations
echo "6. Testing recommendations..."
TRENDING=$(curl -s http://localhost:3001/api/recommendations/trending 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Recommendations accessible"
else
    echo "❌ Recommendations not accessible"
fi

echo ""

# Test analytics
echo "7. Testing analytics..."
ANALYTICS=$(curl -s http://localhost:3001/api/analytics/trending 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Analytics accessible"
else
    echo "❌ Analytics not accessible"
fi

echo ""
echo "🎉 API testing complete!"