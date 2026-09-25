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
 # Exclude the captured popup's outer frame and rounded-corner remnants.
 # Preserve the content's placement and native pixels when trimming the edges.
 left,top,right,bottom=box
 trimmed=(max(left,8),max(top,10),min(right,original.width-8),min(bottom,original.height-10))
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
im=base('Recognize components at a glance','Compact layout, distinct icons and independent sidebar and canvas styling.')
paste(im,'component-appearance-settings',(2,0,357,570),(222,155))
paste(im,'component-appearance-settings',(2,578,357,1190),(703,155))
save(im,'listing-02-component-appearance.png')
im=base('Make room for the way you build','Control Build Agent, Explore, Properties and Component tray independently.')
paste(im,'general-builder-panel-settings',(1,0,354,490),(44,155))
paste(im,'general-builder-panel-settings',(18,509,333,870),(482,202))
paste(im,'general-builder-panel-settings',(18,882,333,1151),(903,202))
d=ImageDraw.Draw(im)
d.text((482,157),'Visibility and remembered widths',font=font(17,True),fill='#c4b5fd')
d.text((903,157),'A preference for each panel',font=font(17,True),fill='#c4b5fd')
d.text((484,603),'Native sizing, custom defaults or',font=font(16),fill=MUTED)
d.text((484,628),'remember the width you choose.',font=font(16),fill=MUTED)
save(im,'listing-03-builder-panels.png')
im=base('Your toolkit and environment, together','Floating access, production controls and editable groups for your environments.')
paste(im,'feature-menu',(1,0,356,452),(44,155))
paste(im,'environment-settings',(1,95,354,383),(465,155))
paste(im,'environment-settings',(19,389,338,1016),(900,145))
# Current hostname is unrelated to the user-created Demo Group; explicitly redact it.
d=ImageDraw.Draw(im);d.rectangle((481,253,802,294),fill=BG)
d.text((484,255),'STAGING · current hostname hidden',font=font(12),fill=MUTED)
d.text((465,489),'Recognize the environment before acting.',font=font(16),fill=INK)
d.text((465,523),'Production protection applies to',font=font(16),fill=MUTED)
d.text((465,547),'Unqlock’s Data and Execute actions.',font=font(16),fill=MUTED)
save(im,'listing-04-environment-menu.png')
im=base('Inspect, edit and run with explicit controls','Three debug tabs for compatible Angular Unqork application pages.')
paste(im,'debug-inspect',(0,96,349,502),(48,155))
paste(im,'debug-data',(2,96,354,694),(466,155))
paste(im,'debug-execute',(1,98,353,511),(884,155))
save(im,'listing-05-debug-tools.png')
# Review-only contact sheet. Listing images above remain full resolution.
contact=Image.new('RGB',(1280,1200),'#161b22')
for i,p in enumerate(sorted(OUT.glob('listing-*.png'))):
 contact.paste(Image.open(p).resize((640,400),Image.Resampling.LANCZOS),((i%2)*640,(i//2)*400))
contact.save(ROOT/'artifacts/listing-contact-sheet.png')
print('5 RGB PNGs created from SS sources. Settings crops use original pixels with no resampling.')
