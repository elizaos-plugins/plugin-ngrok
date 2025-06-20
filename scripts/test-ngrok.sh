#!/bin/bash

# Script to run ngrok tests with proper configuration to avoid rate limiting

echo "🧪 Running ngrok tests with rate limiting protection..."

# Export test-specific configuration
export NGROK_USE_RANDOM_SUBDOMAIN=true
# Don't use fixed domain in tests
unset NGROK_DOMAIN

# Run tests with proper spacing
echo "📦 Running unit tests first..."
bun test src/__tests__/unit --run

# Wait between test suites
echo "⏳ Waiting 5 seconds before integration tests..."
sleep 5

echo "🔧 Running integration tests..."
bun test src/__tests__/integration --run

# Wait between test suites
echo "⏳ Waiting 5 seconds before e2e tests..."
sleep 5

echo "🌐 Running e2e tests..."
bun test src/__tests__/e2e --run

echo "✅ All tests completed!" 