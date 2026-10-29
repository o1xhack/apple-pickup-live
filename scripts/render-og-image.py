#!/usr/bin/env python3
"""Render public/og.png (1200x630) to match the site's palette and type."""
from pathlib import Path
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit('Pillow is required: python3 -m pip install pillow')

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'og.png'
SERIF_CANDIDATES = [
    Path('/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf'),
    Path('/System/Library/Fonts/Supplemental/Georgia.ttf'),
    Path('/Library/Fonts/Georgia.ttf'),
]
SANS_CANDIDATES = [
    Path('/usr/share/fonts/truetype/macos/Inter-Medium.ttf'),
    Path('/usr/share/fonts/truetype/macos/Inter-Regular.ttf'),
    Path('/System/Library/Fonts/Supplemental/Arial.ttf'),
    Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
]
SANS_BOLD_CANDIDATES = [
    Path('/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf'),
    Path('/usr/share/fonts/truetype/macos/Inter-Bold.ttf'),
    Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
]

def first_font(candidates, size):
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    raise SystemExit('No usable font found. Install Noto Serif and Inter, or edit the font paths in scripts/render-og-image.py.')

def bag(draw, x, y, scale, color):
    def p(px, py):
        return (x + px * scale, y + py * scale)
    draw.line([p(6, 8), p(18, 8), p(19, 20), p(5, 20), p(6, 8)], fill=color, width=max(2, int(1.7 * scale)))
    draw.arc([p(9, 3), p(15, 10)], 200, 340, fill=color, width=max(2, int(1.7 * scale)))

width, height = 1200, 630
image = Image.new('RGB', (width, height), '#f6f7f3')
draw = ImageDraw.Draw(image)
serif = first_font(SERIF_CANDIDATES, 78)
sans = first_font(SANS_CANDIDATES, 32)
sans_small = first_font(SANS_CANDIDATES, 22)
sans_brand = first_font(SANS_BOLD_CANDIDATES, 34)
eyebrow = first_font(SANS_BOLD_CANDIDATES, 20)

draw.rounded_rectangle((64, 56, 140, 140), radius=22, fill='#234c37')
bag(draw, 76, 70, 3.4, '#ffffff')
draw.text((164, 70), 'Apple Pickup', font=sans_brand, fill='#24342b')
brand_width = draw.textlength('Apple Pickup', font=sans_brand)
draw.text((164 + brand_width + 12, 70), 'Live', font=sans_brand, fill='#7a857d')

draw.text((72, 210), 'UNITED STATES   ·   IPHONE DUO', font=eyebrow, fill='#78816f')
draw.text((72, 258), 'iPhone Duo', font=serif, fill='#202c27')
draw.text((72, 348), 'stock tracker', font=serif, fill='#202c27')
draw.rectangle((72, 460, 168, 466), fill='#185b40')
draw.text((72, 488), 'Pickup availability across 269 Apple Stores.', font=sans, fill='#314038')
draw.text((72, 560), 'pickup.o1xhack.com', font=sans_small, fill='#7b847e')
draw.text((860, 560), 'Not affiliated with Apple.', font=sans_small, fill='#98a08f')
image.save(OUT, 'PNG', optimize=True)
print(f'Wrote {OUT} ({OUT.stat().st_size} bytes)')
