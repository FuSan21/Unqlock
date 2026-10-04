from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'docs/screenshots/SS'; OUT=ROOT/'docs/screenshots'
(ROOT/'artifacts').mkdir(exist_ok=True)
BG='#0b0e13'; INK='#e2e8f0'; MUTED='#a9b4c3'
def font(size,bold=False):
 return ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',size)
def source(name):return Image.open(SRC/f'{name}.png').convert('RGB')
def base(title,subtitle):
 im=Image.new('RGB',(1280,800),BG);d=ImageDraw.Draw(im)
 d.text((44,23),'UNQLOCK',font=font(12,True),fill='#c4b5fd')
 d.text((44,47),title,font=font(30,True),fill=INK)
 d.text((44,94),subtitle,font=font(16),fill=MUTED)
 d.line((44,125,1236,125),fill='#262d38')
 return im
def paste(im,stamp,box,xy):
 original=source(stamp)
 # Crop at native pixels, never past the capture's edges.
 left,top,right,bottom=box
 trimmed=(max(left,0),max(top,0),min(right,original.width),min(bottom,original.height))
 shot=original.crop(trimmed)
 position=(xy[0]+trimmed[0]-left,xy[1]+trimmed[1]-top)
 assert position[0]+shot.width<=1280 and position[1]+shot.height<=800
 im.paste(shot,position)
def save(im,name):
 assert im.size==(1280,800) and im.mode=='RGB';im.save(OUT/name,optimize=True)
# Crop the compact builder surface at native resolution. All UI crops remain 1:1.
builder=Image.new('RGB',(1280,800),BG)
shot=source('compact-builder-subtle-accents').crop((31,138,1044,771))
builder.paste(shot,((1280-shot.width)//2,(800-shot.height)//2))
save(builder,'listing-01-compact-builder.png')
# Each store image shows one view in both themes, light then dark, plus a third view.
im=base('Recognize components at a glance','Pick foreground and background colors per group, for light and dark themes.')
paste(im,'light/component-style',(0,880,354,1375),(44,155))
paste(im,'dark/component-style',(0,880,354,1375),(465,155))
paste(im,'dark/canvas-layout',(0,340,354,985),(884,155))
save(im,'listing-02-component-appearance.png')
im=base('Make room for the way you build','Control Build Agent, Explore, Properties and Component tray independently.')
paste(im,'light/builder-panels',(0,96,354,600),(44,155))
paste(im,'dark/builder-panels',(0,96,354,600),(465,155))
paste(im,'dark/builder-panels',(14,957,340,1308),(898,202))
d=ImageDraw.Draw(im)
d.text((898,157),'Custom or remembered widths',font=font(17,True),fill='#c4b5fd')
save(im,'listing-03-builder-panels.png')
im=base('Your toolkit and environment, together','The current environment, switch links and editable groups, one click away.')
paste(im,'light/home-menu',(0,0,354,560),(44,155))
paste(im,'dark/home-menu',(0,0,354,560),(465,155))
paste(im,'dark/environments',(0,150,354,795),(884,155))
save(im,'listing-04-environment-menu.png')
im=base('Inspect, edit and run with explicit controls','Three debug tabs for compatible Angular Unqork application pages.')
paste(im,'light/debug-data',(0,96,354,694),(44,155))
paste(im,'dark/debug-data',(0,96,354,694),(465,155))
paste(im,'dark/debug-execute',(0,96,354,600),(884,155))
save(im,'listing-05-debug-tools.png')
# README images: every popup capture in both themes, light on the left and dark on the right.
GAP=16
for light in sorted((SRC/'light').glob('*.png')):
 left=Image.open(light).convert('RGB');right=source('dark/'+light.stem)
 assert left.size==right.size,light.name
 pair=Image.new('RGB',(left.width*2+GAP,left.height),'#7b8494')
 pair.paste(left,(0,0));pair.paste(right,(left.width+GAP,0))
 pair.save(SRC/light.name,optimize=True)
# Promo tiles for the Chrome Web Store: 440 × 280 small and 1400 × 560 marquee, RGB without alpha.
ACCENT='#c4b5fd'
# Each group's light-theme foreground, from src/lib/component-colors.ts.
GROUPS=['#1E40AF','#5B21B6','#155E75','#44403C','#166534','#9A3412','#115E59','#9F1239','#86198F','#3F6212']
def icon(size):
 return Image.open(ROOT/'docs/assets/extension-icon.png').convert('RGBA').resize((size,size),Image.Resampling.LANCZOS)
def glow(im,center,radius,color):
 # A soft accent glow behind the icon, drawn on its own layer and blended in.
 layer=Image.new('RGB',im.size,BG);d=ImageDraw.Draw(layer)
 for step in range(radius,0,-4):
  t=step/radius
  mix=tuple(round(int(BG[i*2+1:i*2+3],16)*t+int(color[i*2+1:i*2+3],16)*(1-t)*0.35+int(BG[i*2+1:i*2+3],16)*(1-t)*0.65) for i in range(3))
  d.ellipse((center[0]-step,center[1]-step,center[0]+step,center[1]+step),fill=mix)
 return layer
def chips(d,x,y,width,height=8,gap=6):
 size=(width-gap*(len(GROUPS)-1))/len(GROUPS)
 for i,color in enumerate(GROUPS):
  left=round(x+i*(size+gap));d.rounded_rectangle((left,y,round(left+size),y+height),radius=height//2,fill=color)
def tile(name,im):
 im=im.convert('RGB');assert im.mode=='RGB';im.save(OUT/name,optimize=True)
small=glow(Image.new('RGB',(440,280),BG),(110,120),150,'#7c3aed')
small.paste(ic:=icon(112),(54,64),ic)
d=ImageDraw.Draw(small)
d.text((188,72),'Unqlock',font=font(44,True),fill=INK)
d.text((190,134),'A clearer Unqork builder',font=font(18),fill=ACCENT)
d.text((190,162),'Colors, compact rows, panels',font=font(16),fill=MUTED)
d.text((190,184),'and environments',font=font(16),fill=MUTED)
chips(d,54,226,332)
tile('promo-small-440x280.png',small)
marquee=glow(Image.new('RGB',(1400,560),BG),(150,150),260,'#7c3aed')
marquee.paste(ic:=icon(96),(72,72),ic)
d=ImageDraw.Draw(marquee)
d.text((190,84),'Unqlock',font=font(48,True),fill=INK)
d.text((72,200),'Make the Unqork builder',font=font(40,True),fill=INK)
d.text((72,252),'easier to read.',font=font(40,True),fill=INK)
for i,line in enumerate(['Components colored and shaped by role','Compact rows and your own row layout','Builder panels, environments and debug tools']):
 y=330+i*40
 d.ellipse((74,y+9,84,y+19),fill=ACCENT)
 d.text((98,y),line,font=font(20),fill=MUTED)
chips(d,72,474,480)
# The compact builder from the listing image, downscaled once to fit beside the text.
shot=source('compact-builder-subtle-accents').crop((31,138,1044,771))
shot=shot.resize((round(shot.width*470/shot.height),470),Image.Resampling.LANCZOS)
frame=Image.new('L',shot.size,0);ImageDraw.Draw(frame).rounded_rectangle((0,0,shot.width-1,shot.height-1),radius=14,fill=255)
x,y=1400-shot.width-56,45
d.rounded_rectangle((x-2,y-2,x+shot.width+1,y+shot.height+1),radius=16,fill='#262d38')
marquee.paste(shot,(x,y),frame)
tile('promo-marquee-1400x560.png',marquee)
# Review-only contact sheet. Listing images above remain full resolution.
contact=Image.new('RGB',(1280,1200),'#161b22')
for i,p in enumerate(sorted(OUT.glob('listing-*.png'))):
 contact.paste(Image.open(p).resize((640,400),Image.Resampling.LANCZOS),((i%2)*640,(i//2)*400))
contact.save(ROOT/'artifacts/listing-contact-sheet.png')
print('Store images, promo tiles and light and dark README pairs created from SS sources. Settings crops use original pixels with no resampling.')
