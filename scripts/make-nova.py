"""Original Nova pixel companion for Elion. Not copied from MiniCPM artwork.
Pillow generates 56 transparent frames at their native 64-pixel resolution.
Rows: idle, happy, thinking, talking, working, sleeping, wave.
"""
from PIL import Image, ImageDraw
from pathlib import Path
import math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/pet'; OUT.mkdir(parents=True,exist_ok=True)
P={'ink':'#243044','deep':'#111c2c','shade':'#9fb3c1','fur':'#d9e6e9','light':'#f4f6ef','mint':'#66d5bc','mintdark':'#358d8b','pink':'#d8a9af','key':'#5a7186','spark':'#d8d3f2'}

def frame(state,f):
 im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
 y=0 if state=='sleeping' else [0,0,0,1,1,1,0,0][f]
 def poly(points,col): d.polygon([(x,yy+y) for x,yy in points],fill=P.get(col,col))
 def rect(box,col): x1,y1,x2,y2=box;d.rectangle((x1,y1+y,x2,y2+y),fill=P.get(col,col))
 def line(points,col,w=1):d.line([(x,yy+y) for x,yy in points],fill=P.get(col,col),width=w)
 # A large fluffy tail, reshaped with a small swish in every animation row.
 w=[0,1,2,2,1,0,-1,-1][f]
 poly([(39,42),(43,38),(47,36),(49,31+w),(53,32+w),(56,38+w),(56,44),(52,50),(45,53),(38,51)],'ink')
 poly([(40,43),(45,40),(48,39),(50,34+w),(52,35+w),(54,39+w),(53,45),(48,49),(42,50)],'fur')
 poly([(47,44),(51,40+w),(52,35+w),(54,39+w),(53,45),(48,49),(42,50)],'light')
 if state=='sleeping':
  poly([(15,36),(22,31),(34,30),(43,34),(48,41),(48,48),(44,52),(18,52),(12,49),(11,42)],'ink')
  poly([(16,37),(23,33),(34,33),(42,36),(46,42),(46,47),(42,50),(18,50),(14,47),(13,42)],'fur')
  poly([(15,31),(16,23),(23,26),(32,27),(39,24),(43,29),(44,38),(41,44),(18,45),(13,40)],'ink')
  poly([(17,31),(18,26),(23,29),(33,29),(39,27),(41,31),(42,38),(39,42),(19,43),(15,39)],'light')
  line([(19,35),(21,36),(24,35)],'ink'); line([(32,35),(34,36),(37,35)],'ink')
  rect((27,38,29,39),'pink')
  line([(46,18),(50,18),(46,22),(50,22)],'shade')
  if f>3:line([(53,11),(57,11),(53,15),(57,15)],'shade')
  return im
 # Belly and two paws are individually shaded, not a transformed sticker.
 poly([(20,36),(37,35),(43,41),(43,49),(39,54),(34,55),(27,54),(21,55),(17,51),(17,42)],'ink')
 poly([(21,38),(36,37),(40,42),(40,49),(37,52),(23,52),(20,49),(20,42)],'fur')
 poly([(25,39),(34,38),(37,41),(37,49),(33,52),(25,51),(23,46)],'light')
 rect((20,51,26,53),'shade');rect((34,51,39,53),'shade')
 rect((21,51,25,52),'light');rect((34,51,38,52),'light')
 # Fox ears, soft cheeks, and a tufty silhouette.
 ear=1 if f in [3,4] else 0
 poly([(14,19),(14,8+ear),(18,8),(25,14),(32,13),(37,15),(45,8),(48,9),(48,20),(51,25),(51,34),(47,40),(41,43),(20,43),(13,39),(10,33),(11,25)],'ink')
 poly([(16,18),(16,11+ear),(18,11),(25,17),(33,16),(38,18),(45,11),(46,12),(46,22),(49,26),(49,33),(45,38),(39,41),(21,41),(15,37),(12,32),(13,26)],'fur')
 poly([(16,12+ear),(19,14),(21,18),(16,20)],'mintdark')
 poly([(44,13),(40,18),(45,20)],'mint')
 poly([(20,21),(25,17),(29,18),(33,17),(37,20),(43,22),(46,28),(45,33),(40,38),(22,38),(16,33),(15,28)],'light')
 # Side fur clusters and nose.
 rect((12,28,15,29),'light');rect((45,30,48,32),'fur')
 blink=state=='idle' and f==6
 happy=state in ['happy','wave']
 look=[0,0,1,1,1,0,0,0][f] if state=='idle' else 0
 if happy:
  line([(19,28),(21,26),(23,28)],'ink',2);line([(35,28),(37,26),(39,28)],'ink',2)
 elif blink:
  line([(19,29),(23,29)],'ink',2);line([(35,29),(39,29)],'ink',2)
 else:
  rect((19+look,25,24+look,31),'ink');rect((35+look,25,40+look,31),'ink')
  rect((20+look,25,21+look,27),'light');rect((36+look,25,37+look,27),'light')
  rect((22+look,30,23+look,31),'shade');rect((38+look,30,39+look,31),'shade')
 rect((16,33,19,34),'pink');rect((40,33,43,34),'pink')
 rect((28,33,31,34),'ink');rect((29,33,30,33),'pink')
 if state=='talking' and f%3!=0:
  poly([(28,36),(32,36),(31,39),(29,39)],'ink');rect((29,37,31,38),'pink')
 else: line([(27,36),(29,37),(31,36),(33,37)],'ink')
 # The mint scarf has two alternating folds.
 poly([(20,40),(38,40),(41,43),(37,46),(22,46),(18,43)],'ink')
 poly([(21,41),(37,41),(38,43),(35,44),(22,44),(20,43)],'mint')
 poly([(21,44),(25,44),(24+w//2,51),(19+w//2,51),(20,48)],'mintdark')
 rect((21+w//2,46,23+w//2,49),'mint')
 if state=='working':
  rect((12,50,43,56),'ink');rect((14,51,41,54),'key')
  for xx in range(15,40,5):rect((xx,52,xx+2,52),'fur')
  rect((18,47+f%2,23,50+f%2),'ink');rect((19,47+f%2,22,49+f%2),'light')
  rect((33,48-f%2,38,51-f%2),'ink');rect((34,48-f%2,37,50-f%2),'light')
 elif happy:
  yy=32+[1,0,-1,-2,-1,0,1,1][f]
  poly([(39,41),(43,40),(45,yy),(50,yy),(51,yy+5),(47,43),(42,45)],'ink')
  poly([(41,40),(44,40),(46,yy+1),(49,yy+1),(49,yy+4),(45,42),(42,43)],'light')
  rect((16,44,21,48),'ink');rect((17,44,20,46),'fur')
  if state=='happy':
   sx=6 if f<4 else 56;sy=17 if f%4<2 else 22
   line([(sx,sy-3),(sx,sy+3)],'spark');line([(sx-3,sy),(sx+3,sy)],'spark')
 else:
  rect((17,44,21,48),'ink');rect((18,44,20,46),'light')
  rect((38,44,42,48),'ink');rect((39,44,41,46),'light')
 if state=='thinking':
  poly([(43,6),(43,3),(57,3),(59,5),(59,12),(57,14),(48,14),(44,18),(45,14),(43,12)],'ink')
  rect((45,5,57,12),'light')
  for k in range(3): rect((47+k*4,8,48+k*4,9),'mintdark' if f%3==k else 'shade')
 return im
states=['idle','happy','thinking','talking','working','sleeping','wave']
sheet=Image.new('RGBA',(512,448))
for row,state in enumerate(states):
 for i in range(8):sheet.paste(frame(state,i),(i*64,row*64))
sheet.save(OUT/'nova-sprites.png',optimize=True)
frame('wave',2).resize((384,384),Image.Resampling.NEAREST).save(ROOT/'.arena/nova-preview.png')
print('Nova: 56 original transparent pixel animation frames.')
