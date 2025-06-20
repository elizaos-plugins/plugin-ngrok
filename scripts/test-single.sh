#!/bin/bash

# Script to run a single test with ngrok environment properly configured

echo "🧪 Running test with ngrok configuration..."

# Unset domain/subdomain to force random URLs
unset NGROK_DOMAIN
unset NGROK_SUBDOMAIN

# Run the test
bun test "$@" 