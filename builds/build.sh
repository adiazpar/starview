#!/usr/bin/env bash
# ----------------------------------------------------------------------------------------------------- #
# Render Build Script                                                                                   #
# Location: builds/build.sh                                                                             #
#                                                                                                       #
# Runs on every Render deployment to build and prepare the Django + React application.                  #
#                                                                                                       #
# Steps:                                                                                                #
# 1. Install Python dependencies                                                                        #
# 2. Install Node.js dependencies and build React production bundle                                     #
# 3. Collect static files for production serving                                                        #
# 4. Run database migrations                                                                            #
# ----------------------------------------------------------------------------------------------------- #

# Exit on error
set -o errexit

# Navigate to project root (parent of builds/ directory)
cd "$(dirname "$0")/.."

# Download World Atlas GeoTIFF for Bortle API (only if not already present)
# The /var/data disk persists across deploys, so this only runs once
GEOTIFF_PATH="/var/data/World_Atlas_2015.tif"
GEOTIFF_URL="https://media.starview.app/data/World_Atlas_2015.zip"

if [ ! -f "$GEOTIFF_PATH" ]; then
    echo "===================================="
    echo "Downloading World Atlas GeoTIFF..."
    echo "===================================="
    mkdir -p /var/data
    cd /var/data
    wget -q --show-progress "$GEOTIFF_URL" -O world_atlas.zip
    unzip -o world_atlas.zip World_Atlas_2015.tif
    rm world_atlas.zip World_Atlas_2015.tpk README.txt 2>/dev/null || true
    echo "GeoTIFF downloaded: $GEOTIFF_PATH"
    cd "$(dirname "$0")/.."
else
    echo "World Atlas GeoTIFF already present at $GEOTIFF_PATH"
fi

echo "===================================="
echo "Starting Render build script..."
echo "Working directory: $(pwd)"
echo "===================================="

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Install Node.js dependencies and build React frontend
echo "Installing Node.js dependencies..."
cd starview_frontend
npm ci

echo "Building React production bundle..."
npm run build
cd ..

# Collect static files
echo "Collecting static files..."
python3 manage.py collectstatic --no-input

# Run database migrations
echo "Running database migrations..."
python3 manage.py migrate --no-input

# Pre-warm caches to eliminate cold-start latency
echo "Pre-warming application caches..."
python3 manage.py warm_cache

echo "===================================="
echo "Build completed successfully!"
echo "===================================="
