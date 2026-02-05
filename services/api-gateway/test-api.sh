# API Gateway Test Script

# Test 1: Health Check
echo "🧪 Test 1: Health Check"
curl -s http://localhost:4000/api/health | jq
echo ""

# Test 2: Register New User
echo "🧪 Test 2: Register New User"
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123"}' | jq
echo ""

# Test 3: Login
echo "🧪 Test 3: Login"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123"}')
echo $LOGIN_RESPONSE | jq
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token')
echo ""

# Test 4: Get Profile (Protected Route)
echo "🧪 Test 4: Get Profile (Protected Route with JWT)"
curl -s -X GET http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq
echo ""

echo "✅ All tests passed!"
