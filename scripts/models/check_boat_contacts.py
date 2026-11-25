"""Recheck the actual support contracts after rebuilding the resting character.
Head-pillow, collar skin, headphone mounts, foot and paw support, berth
clearance and the fitted oar's support chain are sampled;
this is not a general proof against every possible mesh interpenetration.
"""
from pathlib import Path
import argparse,bpy,json,math,sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blend',default=str(root/'scripts/models/pond-boat-source.blend'))
parser.add_argument('--out',default=str(root/'.playwright-mcp/quality-20261102/contact-check.json'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
deps=bpy.context.evaluated_depsgraph_get()
def geometry(obj):
 e=obj.evaluated_get(deps);m=e.to_mesh();p=[e.matrix_world@v.co for v in m.vertices];f=[tuple(p.vertices) for p in m.polygons];e.to_mesh_clear();return p,f
def combine(objects):
 points=[];faces=[]
 for obj in objects:
  p,f=geometry(obj);n=len(points);points.extend(p);faces.extend(tuple(n+j for j in face) for face in f)
 return BVHTree.FromPolygons(points,faces),points
def bounds(points):return [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
head,_=combine(obj for obj in bpy.data.objects if obj.get('character_region')=='head')
pillow,pillow_faces=geometry(bpy.data.objects['CH_SoftPillow']);gaps=[]
for p in pillow:
 if p.z<.54:continue
 hit=head.ray_cast(Vector((p.x,p.y,.30)),Vector((0,0,1)),1)[0]
 if hit is not None:gaps.append(hit.z-p.z)
# Fixed spatial samples remain comparable when hair or cushion topology changes.
# The old >4 near-contact vertices missed narrow penetrations between vertices.
pillow_surface=BVHTree.FromPolygons(pillow,pillow_faces)
grid=[];spacing=.005
for ix in range(141):
 for iy in range(97):
  x=-.365+ix*spacing;y=-1.21+iy*spacing
  lower=head.ray_cast(Vector((x,y,.30)),Vector((0,0,1)),1)[0]
  upper=pillow_surface.ray_cast(Vector((x,y,1.5)),Vector((0,0,-1)),1.2)[0]
  if lower is not None and upper is not None:grid.append(lower.z-upper.z)
support={'spacingMetres':spacing,'samples':len(grid),'minimumGap':min(grid),
         'within10mmAreaM2':sum(-.006<=gap<=.010 for gap in grid)*spacing**2,
         'penetratingBeyond6mm':sum(gap<-.006 for gap in grid)}
new_face=bpy.data.objects.get('Sleeper_Face')
paws=[]
contour=bpy.data.objects.get('CH_CatContour')
if contour:
 points,_=geometry(contour)
 centre=bpy.data.objects['BoatCat'].matrix_world.translation
 foot=[p for p in points if p.z<=.442 and p.y<centre.y-.027]
 thwart,_=combine(o for o in bpy.data.objects if o.name.startswith('BOAT_Thwart'))
 for side in (-1,1):
  sole=[p for p in foot if side*(p.x-centre.x)>.024]
  assert len(sole)>=8,'front paw spans a contact patch'
  for p in sole:
   hit=thwart.ray_cast(Vector((p.x,p.y,.48)),Vector((0,0,-1)),.055)[0]
   assert hit is not None and abs(p.z-hit.z)<=.004,(p,hit)
  paws.append(bounds(sole))
else:
 for obj in bpy.data.objects:
  if obj.name.startswith('CH_CatPaw'):
   p,_=geometry(obj);b=bounds(p);assert b[1][0]>=1.045 and b[1][1]<=1.275,b
   assert abs(b[2][0]-.44)<.004,b;paws.append(b)
throw,_=geometry(bpy.data.objects['CH_LooseFoldedThrow']);supported=[p for p in throw if abs(p.y+1.10)<=.115 or abs(p.y-.23)<=.11]
result={'headPillowGapMinimum':min(gaps),'pillowVerticesWithin6mmOfHead':sum(abs(g)<.006 for g in gaps),'pillowGrid':support,'pillowBounds':bounds(pillow),'catPawBounds':paws,'blanketLowestOverThwarts':min(p.z for p in supported)}
if contour and bpy.data.objects.get('Sleeper_Anatomy'):
 hull,_=combine(obj for obj in bpy.data.objects if obj.name.startswith(('BOAT_LongitudinalStrake','BOAT_EasedGunwale')))
 coat,_=combine([contour])
 result['catBodyToHull']=len(coat.overlap(hull))
 assert result['catBodyToHull']==0,result
if new_face is None:
 neck,_=combine([bpy.data.objects['CH_ContinuousNeckChest']])
 filled=0
 for i in range(32):
  a=i/32*math.tau;x=.085*.80*math.cos(a);y=-.587+.067*.80*math.sin(a)
  if neck.ray_cast(Vector((x,y,1.5)),Vector((0,0,-1)),2)[0] is not None:filled+=1
 result['collarSkinCoverageSamples']=filled
 result['collarSamples']=32
 assert filled==32,result
assert result['pillowBounds'][1][0]>=-1.215,result
assert support['minimumGap']>=-.001,result
# A 200 cm² near-contact footprint is required for the ~60 cm stylised head;
# preserving one touching vertex alone does not demonstrate useful support.
assert support['within10mmAreaM2']>=.020,result
assert min(gaps)>-.006,result
clearance={}
for center,half_width,top in [(-1.10,.115,.40),(.23,.11,.37)]:
 points=[p for p in throw if abs(p.y-center)<=half_width]
 clearance[str(center)]=min(p.z-top for p in points)
assert min(clearance.values())>=-.001,result
result['blanketClearancePerThwart']=clearance
if 'BOAT_OarlockFork' in bpy.data.objects:
 trees={name:combine([bpy.data.objects['BOAT_'+name]]) for name in
        ['OarShaft','OarGrip','OarBlade','OarlockFork','OarlockPin','OarlockSocket']}
 rail,_=combine(obj for obj in bpy.data.objects if obj.name.startswith('BOAT_EasedGunwale'))
 topside,_=combine(obj for obj in bpy.data.objects if obj.name.startswith(('BOAT_EasedGunwale','BOAT_Strake')))
 person,_=combine(obj for obj in bpy.data.objects if obj.get('character_subject')=='person' and obj.type in {'MESH','CURVE'})
 shaft=trees['OarShaft'][0];grip=trees['OarGrip'][0];blade=trees['OarBlade'][0]
 fork=trees['OarlockFork'][0];pin=trees['OarlockPin'][0];socket=trees['OarlockSocket'][0]
 joints={label:len(a.overlap(b)) for label,a,b in [
     ('shaftToCradle',shaft,fork),('cradleToPin',fork,pin),('pinToSocket',pin,socket),
     ('socketToRail',socket,rail),('gripToShaft',grip,shaft),('shaftToBlade',shaft,blade)]}
 clear={label:len(a.overlap(b)) for label,a,b in [
     ('shaftToTimber',shaft,topside),('gripToPassenger',grip,person)]}
 envelope=max(math.hypot(p.x,p.y) for group in trees.values() for p in group[1])
 result['oarlock']={'joinedTrianglePairs':joints,'clearTrianglePairs':clear,'radialEnvelopeMetres':envelope}
 assert min(joints.values())>0 and max(clear.values())==0 and envelope<=1.795,result
shorts=bpy.data.objects.get('CH_ConnectedCottonShorts')
if shorts:
 cloth,_=combine([shorts])
 legs,_=combine(obj for obj in bpy.data.objects if obj.name.startswith('CH_ContinuousLegFoot'))
 result['shortsSkinIntersections']=len(cloth.overlap(legs))
 assert result['shortsSkinIntersections']==0,result
scalp_parts=[obj for obj in bpy.data.objects if obj.get('character_region')=='head' and obj.type=='MESH'
             and (obj.name=='CH_SoftFace' or any(mat and mat.name.startswith('CH_Hair') for mat in obj.data.materials))]
pads=sorted((obj for obj in bpy.data.objects if obj.name.startswith('CH_HeadphonePad')),key=lambda obj:obj.name)
if scalp_parts and pads:
 scalp,_=combine(scalp_parts)
 pad_surfaces=[combine([pad])[0] for pad in pads]
 result['headphoneSeat']=[len(pad.overlap(scalp)) for pad in pad_surfaces]
 cups=sorted((obj for obj in bpy.data.objects if obj.name.startswith('CH_HeadphoneCup')),key=lambda obj:obj.name)
 shell,_=combine(cups)
 band,_=combine(obj for obj in bpy.data.objects if obj.name.startswith('CH_Headband'))
 yokes=sorted((obj for obj in bpy.data.objects if obj.name.startswith('CH_HeadphoneYoke')),key=lambda obj:obj.name)
 forks=[combine([yoke])[0] for yoke in yokes]
 mount={'padToCup':[len(pad.overlap(combine([cup])[0])) for pad,cup in zip(pad_surfaces,cups)],
        'forkToCup':[len(fork.overlap(shell)) for fork in forks],
        'forkToBand':[len(fork.overlap(band)) for fork in forks]}
 face,_=combine([bpy.data.objects['CH_SoftFace']])
 result['headphoneMount']=mount
 result['headNeckOverlap']=len(face.overlap(neck))
 assert len(pads)==len(cups)==2 and min(result['headphoneSeat'])>0,result
 assert len(forks)==4 and all(min(joins)>0 for joins in mount.values()),result
 assert result['headNeckOverlap']>0,result
if new_face:
 face,_=combine([new_face])
 matrix=new_face.matrix_world
 forward=matrix.to_3x3()@Vector((0,1,0))
 face_stations=[(0,0),(-.105,-.066),(.105,-.066),(0,.254)]
 result['faceSamples']=sum(face.ray_cast(matrix@Vector((x,-.8,z)),forward,1.5)[0] is not None
                           for x,z in face_stations)
 assert result['faceSamples']==len(face_stations),result
 tee,_=combine([bpy.data.objects['Sleeper_Tee']])
 shorts,_=combine([bpy.data.objects['Sleeper_Shorts']])
 arms,_=combine(obj for obj in bpy.data.objects if obj.get('sleeper_region')=='arm')
 legs,_=combine(obj for obj in bpy.data.objects if obj.get('sleeper_region')=='leg')
 scalp,_=combine(obj for obj in bpy.data.objects if obj is new_face or (
                obj.get('character_region')=='head' and obj.type=='MESH'
                and any(mat and mat.name.startswith('Sleeper_Hair') for mat in obj.data.materials)))
 band,band_points=combine([bpy.data.objects['Sleeper_Headband']])
 contacts={}
 gaps_mm={'band':1000*min(scalp.find_nearest(point)[3] for point in band_points)}
 hair_overlaps={'band':len(scalp.overlap(band))}
 for side in (-1,1):
  pad,pad_points=combine([bpy.data.objects[f'Sleeper_Ear_Pad_{side}']])
  cup,_=combine([bpy.data.objects[f'Sleeper_Ear_Cup_{side}']])
  yoke,_=combine([bpy.data.objects[f'Sleeper_EarYoke_{side}']])
  contacts[side]=[len(a.overlap(b)) for a,b in ((pad,cup),(cup,yoke),(yoke,band))]
  gaps_mm[f'pad{side:+}']=1000*min(scalp.find_nearest(point)[3] for point in pad_points)
  hair_overlaps[f'ear{side:+}']=sum(len(scalp.overlap(fitting)) for fitting in (pad,cup,yoke))
 result['headphoneMounts']=contacts
 result['headphoneHairGapsMm']=gaps_mm
 result['headphoneHairIntersections']=hair_overlaps
 result['neckAtCollar']=len(face.overlap(tee))
 clearances={'headToPillow':len(head.overlap(pillow_surface)),
             'armToPillow':len(arms.overlap(pillow_surface)),'armToHead':len(arms.overlap(head)),
             'sleeveToArm':len(tee.overlap(arms)),'shortsToLeg':len(shorts.overlap(legs))}
 result['sleeperIntersections']=clearances
 assert result['neckAtCollar']>0 and all(min(joints)>0 for joints in contacts.values()),result
 assert max(hair_overlaps.values())==0 and max(gaps_mm.values())<=10,result
 assert max(clearances.values())==0,result
 if bpy.data.objects.get('Sleeper_Anatomy'):
  floor,_=combine(obj for obj in bpy.data.objects if obj.name.startswith('BOAT_Floorboard'))
  seats,_=combine(obj for obj in bpy.data.objects if obj.name.startswith('BOAT_Thwart'))
  supports={}
  # The relaxed forefoot lifts. Its heel needs a smaller bearing patch than
  # the foot braced against the floor.
  for label,side,deck,xs,ys,min_area in [
      ('flexedSole',-1,floor,range(-57,-31),range(135,206),.005),
      ('extendedHeel',1,seats,range(23,47),range(209,250),.0025),
  ]:
   limb,_=combine([bpy.data.objects[f'Sleeper_Leg_{side}']])
   gaps=[]
   for ix in xs:
    for iy in ys:
     x,y=ix*spacing,iy*spacing
     under=limb.ray_cast(Vector((x,y,.10)),Vector((0,0,1)),1.3)[0]
     above=deck.ray_cast(Vector((x,y,1.1)),Vector((0,0,-1)),1.0)[0]
     if under is not None and above is not None:gaps.append(under.z-above.z)
   supports[label]={'minimumGap':min(gaps),'within10mmAreaM2':sum(0<=gap<=.010 for gap in gaps)*spacing**2}
   assert supports[label]['minimumGap']>=0 and supports[label]['within10mmAreaM2']>=min_area,supports
   assert not floor.overlap(limb) and not seats.overlap(limb),label
  result['footSupport']=supports
output=Path(args.out).resolve();output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,indent=2),encoding='utf-8');print('CHARACTER_CONTACT',json.dumps(result),flush=True)
