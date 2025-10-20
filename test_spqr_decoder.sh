#!/bin/bash

# Automated SPQR decoder test script

echo "=== SPQR Decoder Automated Tests ==="
echo ""

# Test 1: 2-layer BWRG
echo "Test 1: 2-layer BWRG - Simple text"
RESULT=$(npm run decode -- --in test_3layer.png 2>&1 | grep -A 10 "spqr:")

EXPECTED_BASE="ABCDEFGHIJKLMNOPQRSTUVWXYZ01234"
EXPECTED_RED="56789abcdefghijklmnopqrstuvwxyz"
EXPECTED_COMBINED="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz"

if echo "$RESULT" | grep -q "base: '$EXPECTED_BASE'" && \
   echo "$RESULT" | grep -q "red: '$EXPECTED_RED'" && \
   echo "$RESULT" | grep -q "combined: '$EXPECTED_COMBINED'"; then
    echo "  ✓ Node.js decoder PASSED"
else
    echo "  ✗ Node.js decoder FAILED"
    echo "$RESULT"
fi

echo ""
echo "=== Results ==="
