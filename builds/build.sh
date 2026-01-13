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
