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
im=base('Recognize components at a glance','Group colors, distinct icons, compact rows and your own canvas row layout.')
paste(im,'component-style',(0,96,354,740),(44,155))
paste(im,'component-style',(0,880,354,1375),(465,155))
paste(im,'canvas-layout',(0,340,354,985),(884,155))
save(im,'listing-02-component-appearance.png')
im=base('Make room for the way you build','Control Build Agent, Explore, Properties and Component tray independently.')
paste(im,'builder-panels',(0,96,354,600),(44,155))
paste(im,'builder-panels',(14,612,340,948),(482,202))
paste(im,'builder-panels',(14,957,340,1308),(903,202))
d=ImageDraw.Draw(im)
d.text((482,157),'Collapse on entry or always',font=font(17,True),fill='#c4b5fd')
d.text((903,157),'Custom or remembered widths',font=font(17,True),fill='#c4b5fd')
d.text((484,575),'Locked panels explain how to',font=font(16),fill=MUTED)
d.text((484,600),'open them again.',font=font(16),fill=MUTED)
save(im,'listing-03-builder-panels.png')
im=base('Your toolkit and environment, together','The current environment, switch links and editable groups, one click away.')
paste(im,'home-menu',(0,0,354,560),(44,155))
paste(im,'environments',(0,150,354,505),(465,155))
paste(im,'environments',(19,585,338,1180),(900,155))
d=ImageDraw.Draw(im)
d.text((465,555),'Recognize the environment before acting.',font=font(16),fill=INK)
d.text((465,589),'Production protection applies to',font=font(16),fill=MUTED)
d.text((465,613),'Unqlock’s Data and Execute actions.',font=font(16),fill=MUTED)
save(im,'listing-04-environment-menu.png')
im=base('Inspect, edit and run with explicit controls','Three debug tabs for compatible Angular Unqork application pages.')
paste(im,'debug-inspect',(0,96,354,600),(48,155))
paste(im,'debug-data',(0,96,354,694),(466,155))
paste(im,'debug-execute',(0,96,354,600),(884,155))
save(im,'listing-05-debug-tools.png')
# Review-only contact sheet. Listing images above remain full resolution.
contact=Image.new('RGB',(1280,1200),'#161b22')
for i,p in enumerate(sorted(OUT.glob('listing-*.png'))):
 contact.paste(Image.open(p).resize((640,400),Image.Resampling.LANCZOS),((i%2)*640,(i//2)*400))
contact.save(ROOT/'artifacts/listing-contact-sheet.png')
print('5 RGB PNGs created from SS sources. Settings crops use original pixels with no resampling.')
