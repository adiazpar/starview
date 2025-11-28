#!/usr/bin/env bash
# ----------------------------------------------------------------------------------------------------- #
# This build-cron.sh script runs on Render for cron job deployments.                                   #
# Location: builds/build-cron.sh                                                                       #
#                                                                                                       #
# Purpose:                                                                                              #
# Minimal build script for cron jobs that only installs Python dependencies.                            #
# Unlike build.sh, this does NOT build React frontend, collect static files, or run migrations.         #
#                                                                                                       #
# What it does:                                                                                         #
# 1. Installs Python dependencies from requirements.txt                                                 #
#                                                                                                       #
# Usage:                                                                                                #
# - Used by Render cron jobs as the build command                                                       #
# - Much faster and lighter than build.sh (no Node.js, no React build)                                  #
# ----------------------------------------------------------------------------------------------------- #

# Exit on error
set -o errexit

# Navigate to project root (parent of builds/ directory)
cd "$(dirname "$0")/.."

echo "===================================="
echo "Starting Cron Job build script..."
echo "Working directory: $(pwd)"
echo "===================================="

# Install Python dependencies
echo "Installing Python dependencies from requirements.txt..."
pip install -r requirements.txt

echo "===================================="
echo "Cron build completed successfully!"
echo "===================================="
