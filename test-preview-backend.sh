#!/bin/bash

echo "========================================="
echo "Preview Backend Test Script"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base URLs
CONTAINER_MANAGER="http://localhost:4001"
FRONTEND="http://localhost:3000"

echo "Step 1: Creating a test session..."
SESSION_RESPONSE=$(curl -s -X POST "$CONTAINER_MANAGER/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-123"}')

SESSION_ID=$(echo $SESSION_RESPONSE | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo -e "${RED}✗ Failed to create session${NC}"
  echo "Response: $SESSION_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Session created: $SESSION_ID${NC}"
echo ""

echo "Step 2: Creating a simple HTML file in the workspace..."
HTML_CONTENT='<!DOCTYPE html>
<html>
<head>
  <title>Preview Test</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 20px;
      backdrop-filter: blur(10px);
    }
    h1 {
      font-size: 3em;
      margin: 0;
      animation: bounce 2s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎉 Preview Works!</h1>
    <p>Session: '"$SESSION_ID"'</p>
    <p>If you can see this, the preview backend is working correctly.</p>
  </div>
</body>
</html>'

WRITE_RESPONSE=$(curl -s -X POST "$CONTAINER_MANAGER/api/files/$SESSION_ID/write" \
  -H "Content-Type: application/json" \
  -d "{\"path\": \"index.html\", \"content\": $(echo "$HTML_CONTENT" | jq -Rs .)}")

if echo "$WRITE_RESPONSE" | grep -q "successfully"; then
  echo -e "${GREEN}✓ HTML file created${NC}"
else
  echo -e "${RED}✗ Failed to create HTML file${NC}"
  echo "Response: $WRITE_RESPONSE"
  exit 1
fi
echo ""

echo "Step 3: Starting preview server..."
START_RESPONSE=$(curl -s -X POST "$CONTAINER_MANAGER/api/preview/$SESSION_ID/start" \
  -H "Content-Type: application/json")

echo "$START_RESPONSE" | jq '.'

if echo "$START_RESPONSE" | grep -q '"success":true'; then
  PORT=$(echo "$START_RESPONSE" | jq -r '.port')
  FRAMEWORK=$(echo "$START_RESPONSE" | jq -r '.framework')
  echo -e "${GREEN}✓ Preview server started${NC}"
  echo -e "  Port: $PORT"
  echo -e "  Framework: $FRAMEWORK"
else
  echo -e "${RED}✗ Failed to start preview server${NC}"
  exit 1
fi
echo ""

echo "Step 4: Waiting for server to be ready..."
sleep 5
echo ""

echo "Step 5: Checking preview status..."
STATUS_RESPONSE=$(curl -s "$CONTAINER_MANAGER/api/preview/$SESSION_ID/status")

echo "$STATUS_RESPONSE" | jq '.'

if echo "$STATUS_RESPONSE" | grep -q '"running":true'; then
  echo -e "${GREEN}✓ Preview server is running${NC}"
else
  echo -e "${YELLOW}⚠ Preview server status unknown${NC}"
fi
echo ""

echo "Step 6: Testing proxy endpoint..."
PROXY_URL="$CONTAINER_MANAGER/api/preview/$SESSION_ID/proxy"
echo "Fetching: $PROXY_URL"

PROXY_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$PROXY_URL")
HTTP_CODE=$(echo "$PROXY_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$PROXY_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Proxy endpoint working (HTTP $HTTP_CODE)${NC}"
  if echo "$BODY" | grep -q "Preview Works"; then
    echo -e "${GREEN}✓ HTML content served correctly${NC}"
  else
    echo -e "${YELLOW}⚠ HTML content may not be correct${NC}"
    echo "First 200 chars: ${BODY:0:200}"
  fi
else
  echo -e "${RED}✗ Proxy endpoint failed (HTTP $HTTP_CODE)${NC}"
  echo "Response: $BODY"
fi
echo ""

echo "Step 7: Testing via frontend API route..."
FRONTEND_PROXY="$FRONTEND/api/preview/$SESSION_ID/proxy"
echo "Fetching: $FRONTEND_PROXY"

FRONTEND_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$FRONTEND_PROXY")
FRONTEND_HTTP_CODE=$(echo "$FRONTEND_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
FRONTEND_BODY=$(echo "$FRONTEND_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$FRONTEND_HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Frontend proxy working (HTTP $FRONTEND_HTTP_CODE)${NC}"
  if echo "$FRONTEND_BODY" | grep -q "Preview Works"; then
    echo -e "${GREEN}✓ Content served through frontend correctly${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Frontend proxy returned HTTP $FRONTEND_HTTP_CODE${NC}"
  echo "This may be expected if Next.js hasn't reloaded yet"
fi
echo ""

echo "Step 8: Stopping preview server..."
STOP_RESPONSE=$(curl -s -X DELETE "$CONTAINER_MANAGER/api/preview/$SESSION_ID/stop")

echo "$STOP_RESPONSE" | jq '.'

if echo "$STOP_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Preview server stopped${NC}"
else
  echo -e "${RED}✗ Failed to stop preview server${NC}"
fi
echo ""

echo "Step 9: Verifying server is stopped..."
sleep 2

FINAL_STATUS=$(curl -s "$CONTAINER_MANAGER/api/preview/$SESSION_ID/status")

if echo "$FINAL_STATUS" | grep -q '"running":false'; then
  echo -e "${GREEN}✓ Server confirmed stopped${NC}"
else
  echo -e "${YELLOW}⚠ Server status unclear${NC}"
fi
echo ""

echo "========================================="
echo "Test Summary"
echo "========================================="
echo ""
echo -e "Session ID: ${GREEN}$SESSION_ID${NC}"
echo -e "Preview URL: ${GREEN}$FRONTEND_PROXY${NC}"
echo ""
echo "To manually test:"
echo "  1. Start preview: curl -X POST $CONTAINER_MANAGER/api/preview/$SESSION_ID/start"
echo "  2. Check status: curl $CONTAINER_MANAGER/api/preview/$SESSION_ID/status"
echo "  3. View in browser: $FRONTEND_PROXY"
echo "  4. Stop preview: curl -X DELETE $CONTAINER_MANAGER/api/preview/$SESSION_ID/stop"
echo ""
echo -e "${GREEN}Test complete!${NC}"
