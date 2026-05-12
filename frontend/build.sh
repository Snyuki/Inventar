#!/bin/bash
git fetch --tags --unshallow 2>/dev/null || true
VERSION=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo '0.0.0')
echo "Building version: $VERSION"
VITE_APP_VERSION=$VERSION npx tsc && VITE_APP_VERSION=$VERSION npx vite build