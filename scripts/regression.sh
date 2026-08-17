#!/usr/bin/env bash
# Full API regression sweep across every fix made in this project.
API=http://127.0.0.1:3001/api
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; pass=$((pass+1)); else echo "  ❌ $1 (got $2, want $3)"; fail=$((fail+1)); fi; }

node "$(dirname "$0")/reset-fixtures.js" 2>/dev/null

AT=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@store.com","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
H=(-H "Authorization: Bearer $AT" -H 'Content-Type: application/json')

echo "== AUTH / SECURITY =="
chk "anonymous dashboard blocked" "$(curl -s -o /dev/null -w '%{http_code}' $API/dashboard/stats)" "401"
chk "anonymous theme PUT blocked"  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/theme -H 'Content-Type: application/json' -d '{}')" "401"
chk "admin dashboard ok"           "$(curl -s -o /dev/null -w '%{http_code}' $API/dashboard/stats "${H[@]}")" "200"

echo "== PUBLIC READS =="
for e in products categories banners theme settings "products/slug/classic-t-shirt"; do
  chk "GET /$e" "$(curl -s -o /dev/null -w '%{http_code}' "$API/$e")" "200"
done

echo "== ADMIN READS =="
for e in "products?limit=5" orders users coupons inventory reviews menus banners/all shipping/zones tax/rates; do
  chk "GET /$e" "$(curl -s -o /dev/null -w '%{http_code}' "$API/$e" "${H[@]}")" "200"
done

echo "== VALIDATION (Zod -> 400, not 500) =="
chk "bad hex colour"    "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/theme "${H[@]}" -d '{"primaryColor":"notacolour"}')" "400"
chk "XSS in customCss"  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/theme "${H[@]}" -d '{"customCss":"<script>x</script>"}')" "400"
chk "missing banner title" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/banners "${H[@]}" -d '{"position":"hero"}')" "400"
chk "bad banner position"  "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/banners "${H[@]}" -d '{"title":"x","position":"bogus"}')" "400"

echo "== SETTINGS ROUND-TRIP (nulls must not 400) =="
BODY=$(curl -s $API/settings | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];d['storeName']='Regression Store';print(json.dumps(d))")
chk "full settings round-trip" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/settings "${H[@]}" -d "$BODY")" "200"
curl -s -o /dev/null -X PUT $API/settings "${H[@]}" -d '{"storeName":"My Store"}'

echo "== PRODUCTS (metaKeywords / description sanitising) =="
CID=$(curl -s $API/categories | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['id'])")
curl -s -X POST $API/products "${H[@]}" -d "{\"name\":\"Regression Probe\",\"sku\":\"REG-1\",\"categoryId\":\"$CID\",\"price\":9.99,\"quantity\":3,\"description\":\"<p>ok <strong>b</strong></p><script>alert(1)</script>\",\"metaKeywords\":[\"a\",\"b\"]}" -o /tmp/rp.json -w "" 
CODE=$(python3 -c "import json;d=json.load(open('/tmp/rp.json'));print('201' if d.get('data') else '500')")
chk "product create" "$CODE" "201"
python3 -c "
import json;d=json.load(open('/tmp/rp.json')).get('data',{})
desc=d.get('description','')
print('  ✅ script stripped' if '<script' not in desc else '  ❌ script NOT stripped')
print('  ✅ <strong> kept' if '<strong>' in desc else '  ❌ formatting lost')"
PID=$(python3 -c "import json;print(json.load(open('/tmp/rp.json')).get('data',{}).get('id',''))")
chk "product update" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/products/$PID "${H[@]}" -d '{"name":"Regression Probe 2","metaKeywords":["c"]}')" "200"
curl -s -o /dev/null -X DELETE $API/products/$PID "${H[@]}"

echo "== PAYMENTS (customer must not self-settle) =="
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' -d '{"email":"reg_probe@test.com","password":"Passw0rd!23","firstName":"R","lastName":"P"}' -o /dev/null
CT=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"reg_probe@test.com","password":"Passw0rd!23"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
# Pick a product that is actually IN STOCK.
#
# This used to take products?limit=1 - whatever happened to sort first. The
# seed includes "Web Development Course" with quantity 0 (a digital product),
# and when that landed first the order was rejected with "Insufficient stock",
# failing two checks for reasons unrelated to what they test. It passed locally
# and on one CI run, then failed on the next: ordering is not guaranteed.
PID2=$(curl -s "$API/products?limit=50" | python3 -c "
import sys, json
items = json.load(sys.stdin)['data']
stocked = [p for p in items if (p.get('quantity') or 0) > 0 and p.get('status') == 'active']
print(stocked[0]['id'] if stocked else '')")
OID=$(curl -s -X POST $API/orders -H "Authorization: Bearer $CT" -H 'Content-Type: application/json' -d "{\"items\":[{\"productId\":\"$PID2\",\"quantity\":1}],\"shippingAddress\":{\"firstName\":\"R\",\"lastName\":\"P\",\"address\":\"1 St\",\"city\":\"C\",\"state\":\"S\",\"zipCode\":\"1\",\"country\":\"US\",\"phone\":\"5\"},\"paymentMethod\":\"cod\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('data',{}).get('id',''))")
chk "customer order created" "$([ -n "$OID" ] && echo yes || echo no)" "yes"
chk "customer self-pay blocked" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/payments/process -H "Authorization: Bearer $CT" -H 'Content-Type: application/json' -d "{\"orderId\":\"$OID\"}")" "501"
chk "admin can settle" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/payments/process "${H[@]}" -d "{\"orderId\":\"$OID\",\"paymentMethod\":\"bank_transfer\"}")" "200"
chk "customer cannot reach admin reviews" "$(curl -s -o /dev/null -w '%{http_code}' $API/reviews -H "Authorization: Bearer $CT")" "403"

echo "== CATEGORY BY SLUG =="
chk "category by slug"  "$(curl -s -o /dev/null -w '%{http_code}' $API/categories/clothing)" "200"
chk "unknown slug 404"  "$(curl -s -o /dev/null -w '%{http_code}' $API/categories/nope-nope)" "404"

echo
echo "===== $pass passed, $fail failed ====="

# Exit non-zero when anything failed.
#
# Without this the script always exited 0 - the exit status of the final
# `echo` - so CI would report a green build while tests were failing. That is
# strictly worse than having no CI at all, because it manufactures confidence.
[ "$fail" -eq 0 ] || exit 1
