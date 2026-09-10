#!/usr/bin/env python3
from pathlib import Path
try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("pip install pillow")
out = Path(__file__).resolve().parent
for size in (16, 32, 48, 128):
    img = Image.new("RGBA", (size, size), (11, 16, 32, 255))
    d = ImageDraw.Draw(img)
    m = max(1, size // 16)
    d.rounded_rectangle([m, m, size-m-1, size-m-1], radius=size//5, outline=(122, 162, 255, 255), width=max(1, size//16))
    d.ellipse([size*0.28, size*0.28, size*0.72, size*0.72], outline=(94, 234, 212, 255), width=max(1, size//18))
    d.rectangle([size*0.46, size*0.18, size*0.54, size*0.82], fill=(122, 162, 255, 255))
    img.save(out / f"icon{size}.png")
print("icones gerados em", out)
