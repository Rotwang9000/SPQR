#!/bin/bash

# Automated SPQR decoder test script - Node.js and Browser

echo "=== SPQR Decoder Automated Tests ==="
echo ""

# Test 1: Node.js decoder
echo "1. Testing Node.js decoder..."
RESULT=$(npm run decode -- --in test_3layer.png 2>&1 | grep -A 10 "spqr:")

EXPECTED_BASE="ABCDEFGHIJKLMNOPQRSTUVWXYZ01234"
EXPECTED_RED="56789abcdefghijklmnopqrstuvwxyz"
EXPECTED_COMBINED="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz"

if echo "$RESULT" | grep -q "base: '$EXPECTED_BASE'" && \
   echo "$RESULT" | grep -q "red: '$EXPECTED_RED'" && \
   echo "$RESULT" | grep -q "combined: '$EXPECTED_COMBINED'"; then
    echo "  ✓ Node.js decoder PASSED"
    NODE_PASS=1
else
    echo "  ✗ Node.js decoder FAILED"
    echo "$RESULT"
    NODE_PASS=0
fi

echo ""
echo "2. Testing Browser decoder..."
echo "   (Open http://localhost:3007/test_browser_decoder.html to view results)"
echo "   Or check the browser console for detailed output"

echo ""
echo "=== Summary ==="
if [ $NODE_PASS -eq 1 ]; then
    echo "Node.js: PASS"
else
    echo "Node.js: FAIL"
fi
echo "Browser: Manual verification required"

exit $(( 1 - NODE_PASS ))
