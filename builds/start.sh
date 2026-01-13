#!/usr/bin/env bash
# ----------------------------------------------------------------------------------------------------- #
# Render Startup Script                                                                                 #
# Location: builds/start.sh                                                                             #
#                                                                                                       #
# Runs on every Render service start. Downloads GeoTIFF data to persistent disk if not present,        #
# then starts the Gunicorn server.                                                                      #
# ----------------------------------------------------------------------------------------------------- #

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

# Start Gunicorn server
echo "Starting Gunicorn server..."
exec gunicorn django_project.wsgi:application
