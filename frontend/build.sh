#!/bin/bash
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Building version: $VERSION"
VITE_APP_VERSION=$VERSION npx tsc && VITE_APP_VERSION=$VERSION npx vite build