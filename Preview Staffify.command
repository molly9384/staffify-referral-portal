#!/bin/bash

# Load nvm / node if installed via nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Also try homebrew node
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

cd "$(dirname "$0")/frontend"

echo "Starting Staffify preview..."
echo "Opening http://localhost:5173 in a few seconds..."

# Open browser after short delay
(sleep 3 && open "http://localhost:5173") &

npm run dev
