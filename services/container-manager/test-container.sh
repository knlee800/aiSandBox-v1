#!/bin/bash
# Container Manager Test Script

echo "🧪 Testing Container Manager Service"
echo "===================================="
echo ""

# Test 1: Create Session
echo "Test 1: Create Session"
SESSION_RESPONSE=$(curl -s -X POST http://localhost:4001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-001"}')
echo $SESSION_RESPONSE | jq
SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.sessionId')
echo "Session ID: $SESSION_ID"
echo ""

# Test 2: List Files
echo "Test 2: List Files"
curl -s http://localhost:4001/api/files/${SESSION_ID}/list | jq
echo ""

# Test 3: Write File
echo "Test 3: Write File"
curl -s -X POST http://localhost:4001/api/files/${SESSION_ID}/write \
  -H "Content-Type: application/json" \
  -d '{"path":"index.js","content":"console.log(\"Hello World\");"}' | jq
echo ""

# Test 4: Read File
echo "Test 4: Read File"
curl -s -X POST http://localhost:4001/api/files/${SESSION_ID}/read \
  -H "Content-Type: application/json" \
  -d '{"path":"index.js"}' | jq
echo ""

# Test 5: Initialize Git
echo "Test 5: Initialize Git"
curl -s -X POST http://localhost:4001/api/git/${SESSION_ID}/init \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-001"}' | jq
echo ""

# Test 6: Add Another File
echo "Test 6: Add Another File"
curl -s -X POST http://localhost:4001/api/files/${SESSION_ID}/write \
  -H "Content-Type: application/json" \
  -d '{"path":"package.json","content":"{\"name\":\"test-app\",\"version\":\"1.0.0\"}"}' | jq
echo ""

# Test 7: Commit Changes
echo "Test 7: Commit Changes"
curl -s -X POST http://localhost:4001/api/git/${SESSION_ID}/commit \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-001","messageNumber":1,"description":"Added package.json"}' | jq
echo ""

# Test 8: View Git History
echo "Test 8: View Git History"
curl -s http://localhost:4001/api/git/${SESSION_ID}/history | jq
echo ""

# Test 9: View Checkpoints
echo "Test 9: View Checkpoints"
curl -s http://localhost:4001/api/git/${SESSION_ID}/checkpoints | jq
echo ""

# Test 10: List Files Again
echo "Test 10: List Files (should show all files)"
curl -s http://localhost:4001/api/files/${SESSION_ID}/list | jq
echo ""

echo "✅ All tests completed!"
