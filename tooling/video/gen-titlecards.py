"""Generate title card PNGs for each narration segment using PIL.
Style: dark gradient background, clean typography, accent line.
Output: titles/seg01.png ... titles/segNN.png (1280x720)
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "segments.json"), "r", encoding="utf-8") as f:
    segs = json.load(f)

OUTDIR = os.path.join(HERE, "titles")
os.makedirs(OUTDIR, exist_ok=True)

W, H = 1280, 720

# Font resolution, cross-platform.
#
# This used to load four files from C:\Windows\Fonts directly, which is why the
# walkthrough could only be re-rendered on Windows (docs/KNOWN_ISSUES.md §8).
# Windows ships Arial; macOS and most Linux distributions ship DejaVu or
# Liberation instead. The first file that exists wins, and PIL's bundled default
# is the last resort so a bare host degrades in appearance rather than failing.
#
# SOP_TITLE_FONT_DIR overrides the search entirely, so a host with fonts somewhere
# unusual is an environment variable rather than a code change.
FONT_DIRS = [
    os.environ.get("SOP_TITLE_FONT_DIR", ""),
    r"C:\Windows\Fonts",
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
    "/Library/Fonts",
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/liberation2",
    "/usr/share/fonts",
]

FONT_FILES = {
    "bold": ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"),
    "regular": ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"),
    "italic": ("ariali.ttf", "Arial Italic.ttf", "DejaVuSans-Oblique.ttf", "LiberationSans-Italic.ttf"),
}


def load_font(role, size):
    """Return the first font that exists for a role, else PIL's bundled default."""
    for directory in FONT_DIRS:
        if not directory:
            continue
        for name in FONT_FILES[role]:
            path = os.path.join(directory, name)
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()


FONT_TITLE = load_font("bold", 48)
FONT_ACTION = load_font("regular", 28)
FONT_NUM = load_font("bold", 24)
FONT_POS = load_font("italic", 22)

ACCENT = (0x4A, 0x90, 0xE2)
BG_TOP = (0x0F, 0x0F, 0x1A)
BG_BOT = (0x1A, 0x1A, 0x2E)
WHITE = (0xF5, 0xF5, 0xF5)
GRAY = (0xAA, 0xAA, 0xAA)

POSITIONING = (
    "Validated on a simulated tenant; safety-first by design; designed for a shadow-mode pilot; prerequisites not yet met."
    "Not production-proven: no real customer traffic."
)


def draw_gradient(draw, w, h, c1, c2):
    for y in range(h):
        r = int(c1[0] + (c2[0] - c1[0]) * y / h)
        g = int(c1[1] + (c2[1] - c1[1]) * y / h)
        b = int(c1[2] + (c2[2] - c1[2]) * y / h)
        draw.line([(0, y), (w, y)], fill=(r, g, b))


for i, s in enumerate(segs, 1):
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    draw_gradient(draw, W, H, BG_TOP, BG_BOT)

    # accent line at top
    draw.rectangle([(0, 0), (W, 6)], fill=ACCENT)

    # segment number badge
    num_text = f"SEGMENT {i:02d}"
    draw.text((60, 50), num_text, font=FONT_NUM, fill=ACCENT)

    # title (wrapped to fit)
    title = s.get("title", "")
    words = title.split()
    lines = []
    cur = ""
    for w in words:
        test = cur + " " + w if cur else w
        if draw.textlength(test, font=FONT_TITLE) < W - 120:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)

    y = 180
    for line in lines:
        draw.text((60, y), line, font=FONT_TITLE, fill=WHITE)
        y += 64

    # on-screen action
    action = s.get("onscreen", "")
    if action:
        action_lines = []
        cur = ""
        for w in action.split():
            test = cur + " " + w if cur else w
            if draw.textlength(test, font=FONT_ACTION) < W - 120:
                cur = test
            else:
                action_lines.append(cur)
                cur = w
        if cur:
            action_lines.append(cur)
        y += 20
        for line in action_lines:
            draw.text((60, y), line, font=FONT_ACTION, fill=GRAY)
            y += 40

    # positioning line at bottom
    pos_lines = []
    cur = ""
    for w in POSITIONING.split():
        test = cur + " " + w if cur else w
        if draw.textlength(test, font=FONT_POS) < W - 120:
            cur = test
        else:
            pos_lines.append(cur)
            cur = w
    if cur:
        pos_lines.append(cur)
    y = H - 40 - len(pos_lines) * 30
    for line in pos_lines:
        draw.text((60, y), line, font=FONT_POS, fill=(0x77, 0x77, 0x77))
        y += 30

    name = f"seg{i:02d}.png"
    path = os.path.join(OUTDIR, name)
    img.save(path)
    print(f"wrote {name} — {title}")

print(f"Done: {len(segs)} title cards in {OUTDIR}")
