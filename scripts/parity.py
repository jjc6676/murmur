"""Build side-by-side Flow vs Murmur parity images in docs/parity/.

Flow references come from .re/shots/flow (captured from the installed Wispr Flow over CDP);
Murmur screenshots are written by the Playwright specs as docs/parity/murmur-<screen>.png.
Usage: python scripts/parity.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FLOW = ROOT / '.re' / 'shots' / 'flow'
OUT = ROOT / 'docs' / 'parity'

# screen name -> (flow reference file, murmur screenshot file)
PAIRS = {
    'home': ('home.png', 'murmur-home.png'),
    'notetaker': ('notetaker.png', 'murmur-notetaker.png'),
    'insights': ('insights.png', 'murmur-insights.png'),
    'dictionary': ('dictionary.png', 'murmur-dictionary.png'),
    'snippets': ('snippets.png', 'murmur-snippets.png'),
    'style': ('style.png', 'murmur-style.png'),
    'transforms': ('transforms.png', 'murmur-transforms.png'),
    'scratchpad': ('scratchpad.png', 'murmur-scratchpad.png'),
    'post-onboarding': ('post-onboarding-dialog.png', 'murmur-post-onboarding.png'),
    'onboarding': ('onboarding-user.png', 'murmur-onboarding-sign-up.png'),
    'flow-bar': ('window-status.png', 'murmur-flow-bar.png'),
    'settings-general': ('settings-general.png', 'murmur-settings-general.png'),
    'settings-system': ('settings-system.png', 'murmur-settings-system.png'),
    'settings-notetaker': ('settings-notetaker.png', 'murmur-settings-notetaker.png'),
    'settings-vibe-coding': ('settings-vibe-coding.png', 'murmur-settings-vibe-coding.png'),
    'settings-connectors': ('settings-connectors.png', 'murmur-settings-connectors.png'),
    'settings-mcp': ('settings-mcp.png', 'murmur-settings-mcp.png'),
    'settings-account': ('settings-account.png', 'murmur-settings-account.png'),
    'settings-team': ('settings-team.png', 'murmur-settings-team.png'),
    'settings-data': ('settings-data-and-privacy.png', 'murmur-settings-data.png'),
}

LABEL_H = 44


def font(size: int) -> ImageFont.ImageFont:
    for name in ('segoeuib.ttf', 'arialbd.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit(im: Image.Image, h: int) -> Image.Image:
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    made, missing = [], []
    f = font(22)
    for name, (flow_file, murmur_file) in PAIRS.items():
        fp, mp = FLOW / flow_file, OUT / murmur_file
        if not fp.exists() or not mp.exists():
            missing.append(f'{name}: {"flow " if not fp.exists() else ""}{"murmur" if not mp.exists() else ""}'.strip())
            continue
        a, b = Image.open(fp).convert('RGB'), Image.open(mp).convert('RGB')
        h = min(max(a.height, b.height), 850)
        a, b = fit(a, h), fit(b, h)
        canvas = Image.new('RGB', (a.width + b.width + 24, h + LABEL_H), (245, 244, 240))
        canvas.paste(a, (0, LABEL_H))
        canvas.paste(b, (a.width + 24, LABEL_H))
        d = ImageDraw.Draw(canvas)
        d.text((12, 10), 'Wispr Flow (reference)', fill=(26, 26, 26), font=f)
        d.text((a.width + 36, 10), 'Murmur', fill=(26, 26, 26), font=f)
        canvas.save(OUT / f'side-by-side-{name}.png', optimize=True)
        Image.open(fp).save(OUT / f'flow-{name}.png')
        made.append(name)
    print('side-by-side:', ', '.join(made))
    if missing:
        print('missing inputs:', '; '.join(missing))


if __name__ == '__main__':
    main()
