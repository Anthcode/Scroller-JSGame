"""
Proceduralnie generuje spritesheet gracza (pixel-art) pasujący dokładnie do
PLAYER_ANIM_DATA w player.js: 64x64px/klatkę, 6 wierszy:
  0 idle        (1 klatka)
  1 move-left   (9 klatek)
  2 move-right  (9 klatek)
  3 jump        (6 klatek)
  4 hit         (6 klatek)
  5 death       (6 klatek)

Rysujemy w niskiej rozdzielczości (32x32 "pikseli gry") i skalujemy x2 z NEAREST,
żeby uzyskać czysty, ostry wygląd pixel-art zamiast rozmytej grafiki.

Użycie: pip install Pillow && python3 tools/generate_player_sprite.py
Nadpisuje images/player/character.png.
"""
from PIL import Image, ImageDraw
import math

GRID = 32          # rozdzielczość robocza jednej klatki
SCALE = 2           # 32 * 2 = 64 (docelowy frameWidth/frameHeight)
FRAME = GRID * SCALE
COLS = 9
ROWS = 6

# Paleta - leśny wędrowiec
SKIN = (231, 178, 141, 255)
SKIN_SHADE = (196, 143, 108, 255)
HAIR = (92, 58, 38, 255)
TUNIC = (58, 125, 68, 255)
TUNIC_SHADE = (41, 95, 50, 255)
BELT = (77, 51, 33, 255)
PANTS = (66, 50, 38, 255)
PANTS_SHADE = (48, 36, 27, 255)
BOOT = (35, 26, 20, 255)
EYE = (25, 20, 20, 255)
OUTLINE = (20, 15, 15, 255)


def new_frame():
    return Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))


def px(draw, x, y, w, h, color):
    """Rysuje prostokąt we współrzędnych 'pikseli gry' (nie realnych pikseli obrazu)."""
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def draw_character(leg_l=0, leg_r=0, arm_l=0, arm_r=0, bob=0, lean=0,
                    crouch=0, tint=None, alpha=255):
    """Rysuje postać stojącą/idącą frontalnie.
    leg_l/leg_r: przesunięcie pionowe stopy (dodatnie = noga cofnięta/podniesiona)
    arm_l/arm_r: przesunięcie pionowe dłoni (wahadło ramion)
    bob: pionowe przesunięcie całej sylwetki (bujanie/kucanie)
    lean: poziome przesunięcie górnej połowy ciała (odchylenie, np. przy trafieniu)
    crouch: skraca nogi/tors, dodaje "przysiad" (skok/lądowanie)
    """
    img = new_frame()
    d = ImageDraw.Draw(img)

    cx = GRID // 2
    top = 3 + bob + crouch
    head_h = 7
    torso_h = 9 - crouch // 2
    leg_h = 9 - crouch // 2

    # Nogi (rysowane pierwsze, żeby tors/ręce na nie nachodziły). Podkurczenie
    # (lift) skraca nogę od góry, ale wysokość ma dolny limit, żeby noga nigdy
    # nie znikła całkiem (jak się to działo przy większych wartościach leg_l/r).
    leg_w = 3
    left_leg_x = cx - 4
    right_leg_x = cx + 1
    leg_top = top + head_h + torso_h

    def draw_leg(x, lift, color):
        lift = max(0, lift)
        h = max(3, leg_h - lift // 2)  # ugięte kolano = trochę krótsza noga
        y = leg_top - lift             # cała noga unosi się (stopa odrywa się od ziemi)
        px(d, x, y, leg_w, h, color)
        px(d, x, y + h - 2, leg_w, 2, BOOT)

    draw_leg(left_leg_x, leg_l, PANTS)
    draw_leg(right_leg_x, leg_r, PANTS_SHADE)

    # Tors (tunika) - z odchyleniem "lean"
    torso_x = cx - 4 + lean
    px(d, torso_x, top + head_h, 9, torso_h, TUNIC)
    px(d, torso_x + 6, top + head_h, 3, torso_h, TUNIC_SHADE)
    px(d, torso_x, top + head_h + torso_h - 2, 9, 2, BELT)

    # Ręce (wahadło, też z odchyleniem)
    arm_w = 2
    px(d, torso_x - 2, top + head_h + 1 + max(0, arm_l), arm_w, 6 - max(0, arm_l) + max(0, -arm_l), SKIN)
    px(d, torso_x + 9, top + head_h + 1 + max(0, arm_r), arm_w, 6 - max(0, arm_r) + max(0, -arm_r), SKIN_SHADE)

    # Głowa + włosy + oczy
    head_x = cx - 3 + lean
    px(d, head_x, top, 7, head_h, SKIN)
    px(d, head_x, top, 7, 3, HAIR)
    px(d, head_x - 1, top + 1, 1, 3, HAIR)
    px(d, head_x + 7, top + 1, 1, 3, HAIR)
    d.point((head_x + 2, top + 4), fill=EYE)
    d.point((head_x + 4, top + 4), fill=EYE)

    if tint:
        overlay = Image.new("RGBA", img.size, tint)
        img = Image.alpha_composite(img, overlay)

    if alpha < 255:
        r, g, b, a = img.split()
        a = a.point(lambda v: v * alpha // 255)
        img = Image.merge("RGBA", (r, g, b, a))

    return img


def frame_idle():
    return [draw_character(bob=0)]


def frames_walk(n=9):
    out = []
    for i in range(n):
        t = i / n * 2 * math.pi
        leg_l = round(math.sin(t) * 3)
        leg_r = round(math.sin(t + math.pi) * 3)
        arm_l = round(math.sin(t + math.pi) * 2)
        arm_r = round(math.sin(t) * 2)
        bob = 1 if i % (n // 2) == 0 else 0
        out.append(draw_character(leg_l=leg_l, leg_r=leg_r, arm_l=arm_l, arm_r=arm_r, bob=bob))
    return out


def frames_jump(n=6):
    # 0: przysiad przed odbiciem, 1-2: wznoszenie nóg podkurczonych, 3: szczyt (ręce w górze),
    # 4: opadanie, 5: przysiad przy lądowaniu
    poses = [
        dict(crouch=3, arm_l=2, arm_r=2),
        dict(leg_l=3, leg_r=3, arm_l=-3, arm_r=-3),
        dict(leg_l=4, leg_r=4, arm_l=-4, arm_r=-4, bob=-2),
        dict(leg_l=4, leg_r=4, arm_l=-4, arm_r=-4, bob=-2),
        dict(leg_l=2, leg_r=2, arm_l=-1, arm_r=-1),
        dict(crouch=3, arm_l=2, arm_r=2),
    ]
    return [draw_character(**p) for p in poses[:n]]


def frames_hit(n=6):
    out = []
    for i in range(n):
        lean = -3 if i % 2 == 0 else -1
        tint = (255, 60, 60, 90) if i % 2 == 0 else None
        out.append(draw_character(lean=lean, arm_l=-2, arm_r=-2, tint=tint))
    return out


def frames_death(n=6):
    out = []
    for i in range(n):
        # Kąt ograniczony, żeby przy obrocie wokół bioder sylwetka nie wypadła
        # poza kadr 32x32 (promień od pivotu do głowy to ~20px).
        angle = min(48, i * 10)
        alpha = 255 if i < n - 1 else 170
        frame = draw_character(crouch=min(4, i))
        frame = frame.rotate(-angle, resample=Image.NEAREST, expand=False,
                              center=(GRID // 2, GRID - 9))
        if alpha < 255:
            r, g, b, a = frame.split()
            a = a.point(lambda v: v * alpha // 255)
            frame = Image.merge("RGBA", (r, g, b, a))
        out.append(frame)
    return out


def build_sheet():
    sheet = Image.new("RGBA", (FRAME * COLS, FRAME * ROWS), (0, 0, 0, 0))
    rows = [
        frame_idle(),
        frames_walk(9),
        [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames_walk(9)],
        frames_jump(6),
        frames_hit(6),
        frames_death(6),
    ]
    for row_idx, frames in enumerate(rows):
        for col_idx, frame in enumerate(frames):
            big = frame.resize((FRAME, FRAME), Image.NEAREST)
            sheet.paste(big, (col_idx * FRAME, row_idx * FRAME), big)
    return sheet


if __name__ == "__main__":
    import os
    sheet = build_sheet()
    out_path = os.path.join(os.path.dirname(__file__), "..", "images", "player", "character.png")
    sheet.save(out_path)
    print("saved", out_path, sheet.size)
