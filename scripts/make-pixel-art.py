"""Original Elion pixel artwork. Run with Python + Pillow to regenerate.
96x96 transparent frames, hand-built silhouettes and pixel clusters. No traced
reference art, baked checkerboards, interpolation, or moving static cut-outs.
Art coordinates and the palette are illustration data, not UI design tokens.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math, random

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'pixel'
ROOT.mkdir(parents=True, exist_ok=True)
SIZE = 96
FRAMES = 24
OUTLINE = '#111927'

def sprite(kind, frame):
    im = Image.new('RGBA', (SIZE, SIZE))
    d = ImageDraw.Draw(im)
    light = kind == 'white'
    steel = ['#465872', '#7795ae', '#a8c1cc', '#e0edf0'] if light else ['#222c40', '#37445a', '#59657a', '#80909e']
    cape = ['#283754', '#425677', '#687ca0'] if light else ['#201e2b', '#3d2832', '#704039']
    gold, skin, shade, hair = '#c5a46d', '#e2b89a', '#ad775d', '#bacdd9' if light else '#121723'
    # 0..5 idle; 6..8 anticipation; 9..12 swing; 13..15 recovery;
    # 16..19 guard; 20..23 cheer / flourish. Each pose changes joints.
    bob = [0, 0, 1, 1, 0, 0][frame % 6]
    lean = 0 if frame < 6 else -2 if frame < 9 else 3 if frame < 13 else 1 if frame < 16 else -2 if frame < 20 else 0
    y = 23 + bob
    x = 45 + lean
    wind = [0, 2, 3, 1, -1, -2][frame % 6]
    attack = 9 <= frame <= 12
    # Long cape with individually shifting folds and a torn lower silhouette.
    d.polygon([(x-9,y+10),(x-17,y+19),(x-27-wind,y+49),(x-18,y+46),(x-17,y+53),(x-10,y+48),(x-7,y+52),(x+6,y+45),(x+3,y+17)], fill=OUTLINE)
    d.polygon([(x-9,y+12),(x-17,y+23),(x-24-wind,y+46),(x-16,y+42),(x-14,y+48),(x-7,y+43),(x,y+44),(x,y+18)], fill=cape[0])
    d.polygon([(x-10,y+16),(x-17,y+32),(x-20-wind,y+43),(x-14,y+39),(x-8,y+44),(x-4,y+20)],fill=cape[1])
    d.line([(x-10,y+19),(x-15-wind,y+35),(x-14,y+41)],fill=cape[2],width=2)
    # Boots / stepped legs change during a lunge, not just translated body art.
    spread = 6 if attack else 3 if frame >= 16 and frame < 20 else 0
    for side, dx in [(-1,-8-spread),(1,5+spread)]:
        d.polygon([(x+dx,y+38),(x+dx+8,y+38),(x+dx+7+side*2,y+57),(x+dx+12,y+58),(x+dx+13,y+63),(x+dx-1,y+63),(x+dx-2,y+57)], fill=OUTLINE)
        d.polygon([(x+dx+1,y+40),(x+dx+6,y+40),(x+dx+5+side,y+56),(x+dx,y+56)],fill=steel[1])
        d.rectangle((x+dx-1,y+48,x+dx+6,y+51),fill=steel[2])
        d.rectangle((x+dx,y+58,x+dx+8,y+60),fill=steel[1])
        d.line((x+dx+1,y+41,x+dx+2,y+46),fill=steel[3])
    # Torso, overlapping plates and belt.
    d.polygon([(x-10,y+15),(x+9,y+14),(x+12,y+27),(x+7,y+44),(x-10,y+44),(x-13,y+27)], fill=OUTLINE)
    d.polygon([(x-8,y+16),(x+7,y+16),(x+9,y+26),(x+5,y+39),(x-8,y+39),(x-10,y+26)], fill=steel[1])
    d.polygon([(x-7,y+17),(x+5,y+16),(x+8,y+24),(x-7,y+23)],fill=steel[2])
    d.line([(x-5,y+17),(x+4,y+17),(x+6,y+20)],fill=steel[3],width=2)
    for yy in [26,30,34]:
        d.line([(x-9,yy+y),(x+7,yy+y-1)],fill=steel[0],width=2)
        d.line([(x-7,yy+y+2),(x+5,yy+y+1)],fill=steel[2])
    d.rectangle((x-10,y+37,x+7,y+40),fill=cape[1])
    d.rectangle((x-2,y+37,x+2,y+41),fill=gold)
    d.rectangle((x-1,y+38,x+1,y+39),fill=OUTLINE)
    if light:
        d.polygon([(x-2,y+19),(x+2,y+19),(x+2,y+25),(x,y+28),(x-2,y+25)], fill=gold)
    else:
        d.line([(x-8,y+17),(x+5,y+35)],fill='#956d51',width=3)
        for a in range(3): d.rectangle((x-6+a*4,y+21+a*6,x-4+a*4,y+22+a*6),fill=gold)
    # Far arm and articulated elbow.
    elbow = (x-14,y+28+(1 if frame%3 else 0))
    hand = (x-13,y+37)
    d.line([(x-9,y+18),elbow,hand],fill=OUTLINE,width=9)
    d.line([(x-9,y+18),elbow,hand],fill=steel[1],width=5)
    d.rectangle((hand[0]-3,hand[1]-2,hand[0]+2,hand[1]+3),fill=steel[0])
    d.line((elbow[0]-1,elbow[1]-2,elbow[0]+2,elbow[1]+1), fill=steel[3],width=2)
    # Head / hair. White knight has a hawk-like silver helmet and long hair;
    # black swordsman has actual asymmetric spiky pixel clusters.
    if light:
        d.polygon([(x-9,y-9),(x+6,y-10),(x+9,y+8),(x+4,y+22),(x-3,y+15),(x-14,y+22),(x-12,y)],fill=OUTLINE)
        d.polygon([(x-8,y-7),(x+4,y-8),(x+6,y+8),(x+1,y+18),(x-4,y+12),(x-11,y+17),(x-10,y)],fill=hair)
        d.line([(x-8,y),(x-10,y+12)],fill=steel[1],width=2)
    d.polygon([(x-8,y-9),(x+5,y-10),(x+10,y-5),(x+10,y+5),(x+7,y+12),(x-3,y+13),(x-9,y+6)],fill=OUTLINE)
    d.polygon([(x-6,y-7),(x+5,y-8),(x+8,y-4),(x+8,y+5),(x+5,y+10),(x-2,y+10),(x-6,y+5)],fill=skin)
    d.polygon([(x-6,y-4),(x-2,y+3),(x-1,y+9),(x-5,y+6)],fill=shade)
    if light:
        d.polygon([(x-10,y-3),(x-8,y-12),(x-1,y-16),(x+7,y-11),(x+11,y-3),(x+8,y+2),(x+3,y-2),(x-1,y+5),(x-5,y-2)],fill=OUTLINE)
        d.polygon([(x-8,y-4),(x-6,y-11),(x-1,y-14),(x+5,y-10),(x+9,y-4),(x+6,y-1),(x+2,y-4),(x-1,y+2),(x-4,y-4)],fill=steel[2])
        d.polygon([(x-1,y-14),(x-1,y+1),(x+2,y-5),(x+6,y-5),(x+4,y-10)],fill=steel[3])
        d.line((x-7,y-3,x-3,y-3),fill=gold,width=2)
        d.line((x+4,y-3,x+8,y-3),fill=gold,width=2)
    else:
        d.polygon([(x-10,y),(x-12,y-9),(x-8,y-8),(x-9,y-15),(x-4,y-12),(x-3,y-18),(x+1,y-14),(x+5,y-18),(x+6,y-13),(x+11,y-13),(x+10,y-7),(x+8,y-2),(x+4,y-4),(x+2,y),(x-1,y-4),(x-4,y-2),(x-5,y-6),(x-8,y+1)],fill=hair)
        d.line([(x-8,y-11),(x-4,y-7),(x-2,y-6)],fill='#354257',width=2)
        d.line([(x+1,y-12),(x+4,y-8),(x+6,y-8)],fill='#354257',width=2)
        d.line((x+4,y+2,x+6,y+7),fill=shade)
    # Blink two frames per idle cycle; eyes narrow in attack / defense.
    blink = frame == 5 or frame == 18
    d.rectangle((x+2,y+1,x+5,y+(1 if blink else 2)),fill=OUTLINE)
    if not blink: d.point((x+4,y+1),fill='#f0ebe2')
    d.line((x+4,y+7,x+7,y+7),fill=shade)
    head_box = (x-14, y-19, x+12, y+13)
    head_backup = im.crop(head_box)
    # Shoulder pauldron, layered highlights.
    d.polygon([(x+4,y+13),(x+13,y+14),(x+17,y+21),(x+14,y+26),(x+6,y+24),(x+2,y+19)],fill=OUTLINE)
    d.polygon([(x+5,y+15),(x+12,y+16),(x+14,y+20),(x+11,y+23),(x+6,y+22),(x+4,y+19)],fill=steel[1])
    d.line([(x+6,y+16),(x+11,y+17),(x+13,y+19)],fill=steel[3],width=2)
    d.line([(x+6,y+24),(x+12,y+25),(x+15,y+22)],fill=gold if light else steel[0])
    # Near-arm pose and sword rotate around an actual hand pivot in source art.
    if frame < 6:
        hand = (x+15,y+10) if not light else (x+18,y+32)
        angle = -158 if not light else 12
    elif frame < 9:
        hand = (x+5,y+3)
        angle = -120 - (frame-6)*10
    elif frame < 13:
        hand = (x+19,y+19+(frame-9)*3)
        angle = [-65,-22,12,40][frame-9]
    elif frame < 16:
        hand = (x+19-(frame-13)*2,y+31-(frame-13)*6)
        angle = 50-(frame-13)*24
    elif frame < 20:
        hand = (x+17,y+20)
        angle = -70
    else:
        hand = (x+14,y+4-(frame%2)*2)
        angle = -85+((frame-20)*8)
    elbow = ((x+13+hand[0])//2, y+27)
    d.line([(x+11,y+21),elbow,hand],fill=OUTLINE,width=8)
    d.line([(x+11,y+21),elbow,hand],fill=steel[1] if light else skin,width=4)
    d.rectangle((hand[0]-3,hand[1]-2,hand[0]+3,hand[1]+3),fill=steel[0])
    d.line((hand[0]-2,hand[1]-2,hand[0]+1,hand[1]-2),fill=steel[3])
    a = math.radians(angle)
    v=(math.cos(a),math.sin(a)); n=(-v[1],v[0])
    def at(length, width=0): return (round(hand[0]+v[0]*length+n[0]*width),round(hand[1]+v[1]*length+n[1]*width))
    length=29 if light else 37
    width=1.5 if light else 4
    d.line([at(-5),at(3)],fill=OUTLINE,width=5)
    d.line([at(-4),at(3)],fill=gold if light else '#8e7060',width=2)
    d.polygon([at(3,-width-1),at(length-3,-width-1),at(length+2,0),at(length-3,width+1),at(3,width+1)],fill=OUTLINE)
    d.polygon([at(4,-width),at(length-3,-width),at(length,0),at(length-3,width),at(4,width)],fill=steel[3] if light else steel[0])
    d.line([at(5,-width),at(length-4,-width),at(length,0)],fill='#edf5f3' if light else '#969ea4')
    d.line([at(2,-5),at(2,5)],fill=gold if light else steel[2],width=2)
    if not light and frame < 6:
        im.alpha_composite(head_backup, (head_box[0], head_box[1]))
    return im

for kind in ['black','white']:
    sheet=Image.new('RGBA',(SIZE*FRAMES,SIZE))
    for f in range(FRAMES): sheet.paste(sprite(kind,f),(SIZE*f,0))
    sheet.save(ROOT/f'{kind}-knight-sprites.png',optimize=True)

# Original small scene, composed at native pixel resolution.
random.seed(24)
w,h=512,256
im=Image.new('RGB',(w,h),'#546d83');d=ImageDraw.Draw(im)
for y in range(h):
    t=y/h
    c=tuple(int(a+(b-a)*t) for a,b in zip((46,65,88),(150,179,189)))
    d.line((0,y,w,y),fill=c)
# Pixel cloud clusters, moon, distant mountains.
for i in range(65):
    x=random.randrange(w); y=random.randrange(8,76)
    d.rectangle((x,y,x+random.randrange(5,26),y+random.randrange(1,4)), fill=random.choice(['#839baa','#6b8799','#a9bec7']))
d.ellipse((331,21,351,41),fill='#c2d0ce')
for level,col in [(0,'#526b81'),(1,'#658397'),(2,'#425c74')]:
    pts=[(-10,h)]
    x=-25
    while x<w+40:
        peak=random.randrange(40,100)+level*22
        pts += [(x,122+level*12),(x+random.randrange(22,40),peak),(x+65,135+level*12)]
        x+=62
    pts += [(w+10,h)]
    d.polygon(pts,fill=col)
    for k in range(1,len(pts)-2,3):
        p=pts[k+1]
        d.polygon([(p[0]-10,p[1]+13),p,(p[0]+11,p[1]+21),(p[0]+1,p[1]+14),(p[0]-3,p[1]+18)],fill='#b5c7cc')
# Distant fortress, tree line and snowy ledge.
for x in range(354,488,8):
    y=133+random.randrange(-6,5)
    d.rectangle((x,y,x+7,175),fill='#526a79')
    d.rectangle((x+1,y-3,x+2,y),fill='#526a79')
for x in [367,402,461]:
    d.rectangle((x,113,x+11,174),fill='#4b6274')
    d.polygon([(x-2,113),(x+5,104),(x+13,113)],fill='#bfd0d2')
    for yy in [120,132,144]: d.rectangle((x+4,yy,x+6,yy+4),fill='#2c4356')
for x in range(0,w,8):
    y=random.randrange(153,188); size=random.randrange(10,25)
    d.polygon([(x,y-size),(x-6,y+4),(x+6,y+4)],fill='#263f51')
    d.polygon([(x,y-size),(x-3,y-4),(x+4,y-4)],fill='#9eb7bf')
d.polygon([(0,201),(74,189),(175,196),(245,181),(320,193),(401,190),(512,204),(512,256),(0,256)],fill='#98b1bb')
d.polygon([(0,215),(113,205),(173,220),(250,201),(367,204),(512,224),(512,256),(0,256)],fill='#c1cfd0')
for i in range(180):
    x=random.randrange(w); y=random.randrange(205,h)
    d.line((x,y,x+random.randrange(2,17),y),fill=random.choice(['#90a7b1','#aebec2','#d2dcda']))
# Framing pine: off-center so neither actor is obscured.
d.polygon([(62,0),(75,0),(73,189),(82,206),(67,201),(54,209),(60,190)],fill='#172c3d')
for y in range(-22,105,14):
    spread=60-y//3
    d.polygon([(66,y-29),(66-spread,y+26),(66-spread+14,y+22),(66-spread+6,y+32),(66+spread,y+18),(66+spread-18,y+11)],fill='#1b3141')
    d.line([(66-spread+7,y+25),(66-7,y+1)],fill='#77909d',width=2)
im.save(ROOT/'snow-court.png',optimize=True)
print('Wrote 48 transparent animation frames and the Snow Court scene.')
