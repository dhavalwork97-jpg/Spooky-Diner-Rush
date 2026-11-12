"""Builds the Taco Truck oven door sheet from the Gemini oven clip.

Source: tools/taco_source/incoming/oven_door.mp4 (258x242, 24 fps, 240 frames, 10 s).
Real timeline (found by frame difference, 1-based frame numbers; it is NOT the 0/2/4/5.5/7.5 s guess):
  1-22    odd intro (door tilted up, cool grey tray)  -> not used, the tray colour does not match the warm open look
  23-46   door closing from that cool state            -> not used
  47-93   closed, idle                                 -> closed-idle
  94-131  door opening                                 -> open
  132-186 open, empty tray, warm glow (still)          -> open-hold
  187-199 door closing from the warm open look         -> close
  200-240 closed, idle (same as 47-93)
Output: public/assets/taco/animations/oven_door_sheet.webp + .anim.json (clips close, closed-idle, open, open-hold).
Run: python3 tools/make_oven_door_sheet.py   (needs ffmpeg, numpy, Pillow)
"""
import json, os, subprocess, tempfile
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools/taco_source/incoming/oven_door.mp4')
OUT = os.path.join(ROOT, 'public/assets/taco/animations')
W, H, COLS = 258, 242, 6

CLIPS = {
    'close': [187, 189, 191, 193, 195, 197, 199],
    'closed-idle': [60],
    'open': list(range(94, 131, 3)) + [133],
    'open-hold': [150],
}

def main():
    tmp = tempfile.mkdtemp()
    subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, os.path.join(tmp, 'f_%03d.png')], check=True)
    frames, clips = [], {}
    for name, nums in CLIPS.items():
        clips[name] = list(range(len(frames), len(frames) + len(nums)))
        for n in nums:
            frames.append(np.asarray(Image.open(os.path.join(tmp, f'f_{n:03d}.png')).convert('RGBA')))
    rows = -(-len(frames) // COLS)
    sheet = np.zeros((rows * H, COLS * W, 4), np.uint8)
    for i, f in enumerate(frames):
        r, c = divmod(i, COLS)
        sheet[r * H:(r + 1) * H, c * W:(c + 1) * W] = f
    path = os.path.join(OUT, 'oven_door_sheet.webp')
    Image.fromarray(sheet, 'RGBA').save(path, 'WEBP', quality=90, method=6)
    meta = {
        'key': 'oven_door_taco', 'image': 'oven_door_sheet.webp', 'frameWidth': W, 'frameHeight': H,
        'columns': COLS, 'rows': rows, 'frameCount': len(frames), 'suggestedFps': 12,
        'clips': clips,
        'clipFps': {'close': 14, 'open': 14},
        'source': {'file': 'oven_door.mp4', 'frames': CLIPS},
        'note': 'close = door closes (warm open to closed); closed-idle = held while baking; open = door opens; open-hold = held open, empty tray.',
    }
    json.dump(meta, open(os.path.join(OUT, 'oven_door_sheet.anim.json'), 'w'), indent=1)
    print(len(frames), 'frames', rows, 'rows', os.path.getsize(path) // 1024, 'KB', clips)

main()
