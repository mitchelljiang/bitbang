"""
Compares two snapshot folders from snap.mjs and sorts every page into identical, noise or CHANGED.

    python3 -I .claude/skills/sweep/compare.py <before> <after> [<crops-dir>]

Headless Chrome is not perfectly stable at phone width: text anti-aliasing can shift by a few levels between runs.
That is noise: no pixel moves by 48 or more (out of 255) beyond a handful. Anything else is CHANGED, and a
side-by-side crop (before | after) of the changed area is written to <crops-dir> to Read and judge.
Needs Pillow (pip install pillow).
"""
import os
import sys

from PIL import Image, ImageChops

before, after = sys.argv[1], sys.argv[2]
crops = sys.argv[3] if len(sys.argv) > 3 else os.path.join(after, '_crops')
names = sorted(n for n in set(os.listdir(before)) | set(os.listdir(after)) if n.endswith('.png'))
counts = {'identical': 0, 'noise': 0, 'CHANGED': 0}

for n in names:
    pa, pb = os.path.join(before, n), os.path.join(after, n)
    if not (os.path.exists(pa) and os.path.exists(pb)):
        print(f'{n:32} only in {"before" if os.path.exists(pa) else "after"}')
        counts['CHANGED'] += 1
        continue
    a, b = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
    if a.size != b.size:
        verdict, box = 'CHANGED', (0, 0, max(a.width, b.width), max(a.height, b.height))
        detail = f'size {a.size} -> {b.size}'
    else:
        diff = ImageChops.difference(a, b).convert('L')
        hist = diff.histogram()
        box = diff.getbbox()
        strong = sum(hist[48:])
        verdict = 'identical' if not box else 'noise' if strong <= 5 else 'CHANGED'
        detail = f'{sum(hist[1:])} px differ, {strong} strongly'
    counts[verdict] += 1
    if verdict == 'CHANGED':
        os.makedirs(crops, exist_ok=True)
        x0, y0, x1, y1 = box
        c = (max(0, x0 - 40), max(0, y0 - 40), min(a.width, x1 + 40), min(a.height, y1 + 40))
        w, h = c[2] - c[0], c[3] - c[1]
        out = Image.new('RGB', (w * 2 + 12, h), 'white')
        out.paste(a.crop(c), (0, 0))
        out.paste(b.crop(c), (w + 12, 0))
        out.save(os.path.join(crops, n))
        print(f'{n:32} CHANGED  {detail}  -> {os.path.join(crops, n)}')
    elif verdict == 'noise':
        print(f'{n:32} noise    {detail}')

print(f"\n{counts['identical']} identical, {counts['noise']} noise, {counts['CHANGED']} CHANGED of {len(names)}")
