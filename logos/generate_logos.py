"""Generate four Walkie Talkie logo variants (1024x1024 PNG)."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math

OUT = Path(__file__).parent
FONTS = Path("/Users/samitkalra/.claude/plugins/cache/anthropic-agent-skills/document-skills/69c0b1a06741/skills/canvas-design/canvas-fonts")

BG = (15, 17, 21, 255)        # #0f1115
MINT = (124, 196, 168, 255)   # #7cc4a8
CORAL = (231, 111, 81, 255)   # #e76f51
OFF = (232, 232, 234, 255)    # #e8e8ea
DARK = (28, 42, 36, 255)      # #1c2a24

SIZE = 1024
SCALE = 4  # supersample for smooth edges


def new_canvas(scale=SCALE):
    size = SIZE * scale
    img = Image.new("RGBA", (size, size), BG)
    return img, ImageDraw.Draw(img, "RGBA"), scale


def finalize(img, path):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(path)
    print(f"wrote {path}")


def rounded_rect(draw, box, radius, fill=None, outline=None, width=0):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


# ---------- Logo 1: Retro walkie-talkie device ----------
def logo_device():
    img, d, s = new_canvas()
    cx = SIZE * s // 2

    # Device body - moved down, slightly smaller so antenna fits
    body_w, body_h = 420 * s, 600 * s
    body_x = cx - body_w // 2
    body_y = 260 * s  # leave ~200px above for antenna
    rounded_rect(d, [body_x, body_y, body_x + body_w, body_y + body_h],
                 radius=46 * s, fill=MINT)

    # Antenna (to upper-right of body)
    ant_w = 20 * s
    ant_h = 180 * s
    ant_x = body_x + body_w - 90 * s
    ant_y = body_y - ant_h + 10 * s
    rounded_rect(d, [ant_x, ant_y, ant_x + ant_w, ant_y + ant_h],
                 radius=10 * s, fill=MINT)
    # Antenna coral tip
    tip_r = 26 * s
    tip_cx = ant_x + ant_w // 2
    tip_cy = ant_y
    d.ellipse([tip_cx - tip_r, tip_cy - tip_r,
               tip_cx + tip_r, tip_cy + tip_r], fill=CORAL)

    # Screen window near top
    scr_w, scr_h = 300 * s, 80 * s
    scr_x = body_x + (body_w - scr_w) // 2
    scr_y = body_y + 50 * s
    rounded_rect(d, [scr_x, scr_y, scr_x + scr_w, scr_y + scr_h],
                 radius=14 * s, fill=DARK)

    # Speaker grille: 5 cols x 5 rows of dots
    grille_top = scr_y + scr_h + 60 * s
    cols, rows = 5, 5
    dot_r = 14 * s
    gap = 34 * s
    grid_w = (cols - 1) * gap
    gx0 = cx - grid_w // 2
    gy0 = grille_top
    for r in range(rows):
        for c in range(cols):
            x = gx0 + c * gap
            y = gy0 + r * gap
            d.ellipse([x - dot_r, y - dot_r, x + dot_r, y + dot_r], fill=DARK)

    # PTT button: coral circle, bottom center
    btn_r = 50 * s
    btn_cx = cx
    btn_cy = body_y + body_h - 100 * s
    d.ellipse([btn_cx - btn_r, btn_cy - btn_r, btn_cx + btn_r, btn_cy + btn_r],
              fill=CORAL)
    inner_r = 26 * s
    d.ellipse([btn_cx - inner_r, btn_cy - inner_r, btn_cx + inner_r, btn_cy + inner_r],
              outline=BG, width=6 * s)

    finalize(img, OUT / "logo-1-device.png")


# ---------- Logo 2: Speech bubble + antenna + radio waves ----------
def logo_bubble_antenna():
    img, d, s = new_canvas()
    cx, cy = SIZE * s // 2, SIZE * s // 2

    # Speech bubble (rounded rect) - smaller, centered in lower half
    bw, bh = 560 * s, 360 * s
    bx = cx - bw // 2
    by = 520 * s
    rounded_rect(d, [bx, by, bx + bw, by + bh], radius=62 * s, fill=MINT)

    # Bubble tail: triangle at bottom-left, stays above canvas edge
    tail = [
        (bx + 140 * s, by + bh - 20 * s),
        (bx + 100 * s, by + bh + 90 * s),
        (bx + 240 * s, by + bh - 20 * s),
    ]
    d.polygon(tail, fill=MINT)

    # Antenna rising from top-right of bubble
    ant_base_x = bx + bw - 130 * s
    ant_base_y = by + 20 * s
    ant_tip_y = 200 * s
    d.line([(ant_base_x, ant_base_y), (ant_base_x, ant_tip_y)],
           fill=MINT, width=18 * s)
    tip_r = 26 * s
    d.ellipse([ant_base_x - tip_r, ant_tip_y - tip_r,
               ant_base_x + tip_r, ant_tip_y + tip_r], fill=CORAL)

    # Concentric radio-wave arcs emanating from the tip (coral)
    # Largest arc radius bounded so it stays inside canvas with margin
    max_r = min(ant_base_x, SIZE * s - ant_base_x, ant_tip_y) - 30 * s
    radii = [70, 130, min(200, max_r // s)]
    for r_px in radii:
        r_px = r_px * s
        bbox = [ant_base_x - r_px, ant_tip_y - r_px,
                ant_base_x + r_px, ant_tip_y + r_px]
        d.arc(bbox, start=210, end=330, fill=CORAL, width=10 * s)

    finalize(img, OUT / "logo-2-bubble-antenna.png")


# ---------- Logo 3: Wordmark with radio waves ----------
def logo_wordmark():
    img, d, s = new_canvas()
    cx, cy = SIZE * s // 2, SIZE * s // 2

    font_path = FONTS / "BigShoulders-Bold.ttf"
    # Two-line stacked layout
    f_top = ImageFont.truetype(str(font_path), 240 * s)
    f_bot = ImageFont.truetype(str(font_path), 240 * s)

    line1 = "WALKIE"
    line2 = "TALKIE"

    # Measure
    b1 = d.textbbox((0, 0), line1, font=f_top)
    b2 = d.textbbox((0, 0), line2, font=f_bot)
    w1 = b1[2] - b1[0]
    h1 = b1[3] - b1[1]
    w2 = b2[2] - b2[0]
    h2 = b2[3] - b2[1]

    # Position: two lines stacked, tight leading
    gap = 20 * s
    total_h = h1 + gap + h2
    y0 = cy - total_h // 2 - 40 * s
    x1 = cx - w1 // 2
    x2 = cx - w2 // 2

    d.text((x1 - b1[0], y0 - b1[1]), line1, font=f_top, fill=OFF)
    d.text((x2 - b2[0], y0 + h1 + gap - b2[1]), line2, font=f_bot, fill=MINT)

    # Radio wave arcs emerging from the top-right above WALKIE
    # Pull anchor inward from edges so arcs don't clip
    margin = 90 * s
    anchor_x = min(x1 + w1 + 20 * s, SIZE * s - margin - 180 * s)
    anchor_y = max(y0 + 60 * s, margin + 180 * s)

    # Coral dot + arcs
    dot_r = 20 * s
    d.ellipse([anchor_x - dot_r, anchor_y - dot_r,
               anchor_x + dot_r, anchor_y + dot_r], fill=CORAL)
    max_r = min(SIZE * s - anchor_x - 20 * s, anchor_y - 20 * s)
    for r_px in [60, 110, 170]:
        r_px = min(r_px * s, max_r)
        bbox = [anchor_x - r_px, anchor_y - r_px,
                anchor_x + r_px, anchor_y + r_px]
        d.arc(bbox, start=270, end=360, fill=CORAL, width=9 * s)

    # Small caption below
    f_cap = ImageFont.truetype(str(FONTS / "GeistMono-Regular.ttf"), 42 * s)
    cap = "BRAZILIAN PORTUGUESE · BY VOICE"
    cb = d.textbbox((0, 0), cap, font=f_cap)
    cw = cb[2] - cb[0]
    d.text((cx - cw // 2 - cb[0], y0 + total_h + 80 * s - cb[1]),
           cap, font=f_cap, fill=(139, 141, 150, 255))

    finalize(img, OUT / "logo-3-wordmark.png")


# ---------- Logo 4: Two overlapping speech bubbles (conversation) ----------
def logo_conversation():
    img, d, s = new_canvas()
    cx, cy = SIZE * s // 2, SIZE * s // 2

    # Two rounded squares (bubble-like) offset horizontally & vertically
    bw, bh = 500 * s, 500 * s
    offset = 160 * s
    radius = 80 * s

    # Left bubble - mint
    lx = cx - bw + offset // 2
    ly = cy - bh // 2 - 40 * s
    # Right bubble - coral
    rx = cx - offset // 2
    ry = cy - bh // 2 + 40 * s

    # Render bubbles to separate layers so the overlap blends darker
    left_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    right_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(left_layer)
    rd = ImageDraw.Draw(right_layer)

    # Left bubble + tail pointing down-left
    ld.rounded_rectangle([lx, ly, lx + bw, ly + bh], radius=radius, fill=MINT)
    ltail = [
        (lx + 120 * s, ly + bh - 20 * s),
        (lx + 60 * s, ly + bh + 120 * s),
        (lx + 230 * s, ly + bh - 20 * s),
    ]
    ld.polygon(ltail, fill=MINT)

    # Right bubble + tail pointing down-right
    rd.rounded_rectangle([rx, ry, rx + bw, ry + bh], radius=radius, fill=CORAL)
    rtail = [
        (rx + bw - 230 * s, ry + bh - 20 * s),
        (rx + bw - 60 * s, ry + bh + 120 * s),
        (rx + bw - 120 * s, ry + bh - 20 * s),
    ]
    rd.polygon(rtail, fill=CORAL)

    # Composite: left first, then right. Where they overlap we want a darker blended tone.
    # We'll darken the overlap region manually via multiply-like effect.
    # Simple approach: paste left, then paste right with alpha, then darken the overlap.
    img.alpha_composite(left_layer)

    # Compute overlap mask
    left_mask = left_layer.split()[-1].point(lambda v: 255 if v > 0 else 0)
    right_mask = right_layer.split()[-1].point(lambda v: 255 if v > 0 else 0)
    overlap = Image.new("L", img.size, 0)
    # multiply masks
    from PIL import ImageChops
    overlap = ImageChops.multiply(left_mask, right_mask)

    img.alpha_composite(right_layer)

    # Darken overlap with a deep teal/brown blend
    overlap_color = Image.new("RGBA", img.size, (50, 70, 72, 255))
    img.paste(overlap_color, (0, 0), overlap)

    finalize(img, OUT / "logo-4-conversation.png")


if __name__ == "__main__":
    logo_device()
    logo_bubble_antenna()
    logo_wordmark()
    logo_conversation()
