#!/usr/bin/env python3
"""
Generate all favicon and social media icons from source logos.

Run this script whenever you:
- Change your logo files
- Update your brand colors
- Need to regenerate icons

Usage:
    python scripts/generate-icons.py

Requirements:
    pip install Pillow
"""

from PIL import Image
import os
from pathlib import Path

# =============================================================================
# CONFIGURATION - Edit these values when your branding changes
# =============================================================================

# Background color for social images (OG, Twitter)
# This should match your site's dark background
BRAND_BG_COLOR = (17, 24, 39)  # #111827

# Source logo files (relative to public/images/)
LOGO_DARK = "logo-dark-short.png"   # Square icon for favicons, app icons
LOGO_LIGHT = "logo-light-short.png" # Square icon for light mode favicons
LOGO_DARK_FULL = "logo-dark.png"    # Full horizontal logo for social banners

# =============================================================================
# PATHS - Adjust if your directory structure changes
# =============================================================================

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PUBLIC_DIR = PROJECT_ROOT / "public"
IMAGES_DIR = PUBLIC_DIR / "images"
ICONS_DIR = PUBLIC_DIR / "icons"

# =============================================================================
# ICON GENERATION
# =============================================================================

def ensure_dirs():
    """Create output directories if they don't exist."""
    ICONS_DIR.mkdir(exist_ok=True)

def load_logos():
    """Load source logo files."""
    dark = Image.open(IMAGES_DIR / LOGO_DARK).convert("RGBA")
    light = Image.open(IMAGES_DIR / LOGO_LIGHT).convert("RGBA")
    dark_full = Image.open(IMAGES_DIR / LOGO_DARK_FULL).convert("RGBA")
    print(f"Loaded {LOGO_DARK}: {dark.size}")
    print(f"Loaded {LOGO_LIGHT}: {light.size}")
    print(f"Loaded {LOGO_DARK_FULL}: {dark_full.size}")
    return dark, light, dark_full

def generate_favicons(dark: Image.Image, light: Image.Image):
    """Generate theme-aware favicons for browser tabs."""
    print("\n--- Generating Favicons ---")

    sizes = [16, 32]

    for size in sizes:
        # Dark mode version
        dark_resized = dark.resize((size, size), Image.Resampling.LANCZOS)
        dark_path = ICONS_DIR / f"favicon-dark-{size}x{size}.png"
        dark_resized.save(dark_path, "PNG")
        print(f"  Created: {dark_path.name}")

        # Light mode version
        light_resized = light.resize((size, size), Image.Resampling.LANCZOS)
        light_path = ICONS_DIR / f"favicon-light-{size}x{size}.png"
        light_resized.save(light_path, "PNG")
        print(f"  Created: {light_path.name}")

        # Fallback version (uses dark logo)
        fallback_path = ICONS_DIR / f"favicon-{size}x{size}.png"
        dark_resized.save(fallback_path, "PNG")
        print(f"  Created: {fallback_path.name} (fallback)")

def generate_favicon_ico(dark: Image.Image):
    """Generate legacy favicon.ico at project root."""
    print("\n--- Generating favicon.ico ---")

    # 48x48 is Google's recommended size
    ico_48 = dark.resize((48, 48), Image.Resampling.LANCZOS)
    ico_path = PUBLIC_DIR / "favicon.ico"
    ico_48.save(ico_path, format="ICO")
    print(f"  Created: {ico_path.name} (48x48)")

def generate_apple_touch_icon(dark: Image.Image):
    """Generate Apple Touch Icon for iOS home screen."""
    print("\n--- Generating Apple Touch Icon ---")

    # 180x180 is the recommended size for modern iOS
    apple_icon = dark.resize((180, 180), Image.Resampling.LANCZOS)
    apple_path = ICONS_DIR / "apple-touch-icon.png"
    apple_icon.save(apple_path, "PNG")
    print(f"  Created: {apple_path.name} (180x180)")

def generate_android_icons(dark: Image.Image):
    """Generate Android/PWA icons."""
    print("\n--- Generating Android/PWA Icons ---")

    sizes = [192, 512]

    for size in sizes:
        android_icon = dark.resize((size, size), Image.Resampling.LANCZOS)
        android_path = ICONS_DIR / f"android-chrome-{size}x{size}.png"
        android_icon.save(android_path, "PNG")
        print(f"  Created: {android_path.name}")

def generate_og_image(dark_full: Image.Image):
    """Generate Open Graph image for social sharing (Facebook, LinkedIn, Discord)."""
    print("\n--- Generating Open Graph Image ---")

    # Standard OG size: 1200x630
    OG_WIDTH = 1200
    OG_HEIGHT = 630

    # Create background with brand color
    og_image = Image.new("RGB", (OG_WIDTH, OG_HEIGHT), BRAND_BG_COLOR)

    # Scale the full logo to fit nicely (with padding)
    # The full logo is horizontal, so we scale based on width
    logo_width = int(OG_WIDTH * 0.7)  # 70% of image width
    aspect_ratio = dark_full.height / dark_full.width
    logo_height = int(logo_width * aspect_ratio)

    logo_resized = dark_full.resize((logo_width, logo_height), Image.Resampling.LANCZOS)

    # Center the logo
    x = (OG_WIDTH - logo_width) // 2
    y = (OG_HEIGHT - logo_height) // 2

    # Paste with transparency
    og_image.paste(logo_resized, (x, y), logo_resized)

    og_path = ICONS_DIR / "og-image.png"
    og_image.save(og_path, "PNG", optimize=True)
    print(f"  Created: {og_path.name} (1200x630)")

def generate_twitter_image(dark_full: Image.Image):
    """Generate Twitter/X card image."""
    print("\n--- Generating Twitter/X Image ---")

    # Twitter summary_large_image: 2:1 ratio, 1200x600
    TWITTER_WIDTH = 1200
    TWITTER_HEIGHT = 600

    # Create background with brand color
    twitter_image = Image.new("RGB", (TWITTER_WIDTH, TWITTER_HEIGHT), BRAND_BG_COLOR)

    # Scale the full logo to fit nicely (with padding)
    logo_width = int(TWITTER_WIDTH * 0.7)  # 70% of image width
    aspect_ratio = dark_full.height / dark_full.width
    logo_height = int(logo_width * aspect_ratio)

    logo_resized = dark_full.resize((logo_width, logo_height), Image.Resampling.LANCZOS)

    # Center the logo
    x = (TWITTER_WIDTH - logo_width) // 2
    y = (TWITTER_HEIGHT - logo_height) // 2

    # Paste with transparency
    twitter_image.paste(logo_resized, (x, y), logo_resized)

    twitter_path = ICONS_DIR / "twitter-image.png"
    twitter_image.save(twitter_path, "PNG", optimize=True)
    print(f"  Created: {twitter_path.name} (1200x600)")

def main():
    print("=" * 60)
    print("Starview Icon Generator")
    print("=" * 60)
    print(f"\nBrand background color: rgb{BRAND_BG_COLOR}")
    print(f"Output directory: {ICONS_DIR}")

    ensure_dirs()
    dark, light, dark_full = load_logos()

    generate_favicons(dark, light)
    generate_favicon_ico(dark)
    generate_apple_touch_icon(dark)
    generate_android_icons(dark)
    generate_og_image(dark_full)      # Uses full horizontal logo
    generate_twitter_image(dark_full)  # Uses full horizontal logo

    print("\n" + "=" * 60)
    print("All icons generated successfully!")
    print("=" * 60)
    print("\nNext steps:")
    print("  1. Run 'npm run build' to copy icons to dist/")
    print("  2. Deploy to production")
    print("  3. Use social media debuggers to verify:")
    print("     - https://developers.facebook.com/tools/debug/")
    print("     - https://cards-dev.twitter.com/validator")

if __name__ == "__main__":
    main()
