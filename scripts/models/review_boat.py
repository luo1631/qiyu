"""Fixed, reproducible review cameras for the existing person-and-boat pipeline.

blender -b --python review_boat.py -- --blend pond-boat-source.blend --out review
The reference collage is illustrative, not a calibrated orthographic blueprint.
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser()
p.add_argument('--blend',required=True)
p.add_argument('--out',required=True)
p.add_argument('--views',default='concept,head,side,top,clay')
p.add_argument('--samples',type=int,default=40)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
source=Path(a.blend).resolve()
if source.suffix=='.glb':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
else:
    bpy.ops.wm.open_mainfile(filepath=str(source))
    for collection in bpy.data.collections:
        collection.hide_render=collection.name not in ['Collection','pond-boat','pond-character']
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=a.samples
scene.cycles.use_denoising=True
preferences=bpy.context.preferences.addons['cycles'].preferences
try:
    preferences.compute_device_type='OPTIX';preferences.get_devices()
    for device in preferences.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
except (TypeError,RuntimeError):scene.cycles.device='CPU'
scene.cycles.seed=41
scene.render.use_persistent_data=True
scene.render.resolution_percentage=100
scene.world=scene.world or bpy.data.worlds.new('Review world')
scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.65,.74,.80,1);bg.inputs[1].default_value=.35
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=0

def area(name,position,energy,size,color):
    data=bpy.data.lights.new(name,'AREA');obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj);obj.location=position
    data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    obj.rotation_euler=(Vector((0,0,.6))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Review warm key',(-3,-1,5),450,3.3,(1,.85,.69))
area('Review sky fill',(3,1,4),180,4,(.74,.86,1))
area('Review rim',(1,-4,3),220,2.7,(1,.92,.82))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.23))
floor=bpy.context.object;floor.name='Review ground'
mat=bpy.data.materials.new('Review ground');mat.use_nodes=True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.48,.51,.49,1)
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.9
floor.data.materials.append(mat)
data=bpy.data.cameras.new('Fixed asset camera');camera=bpy.data.objects.new('Fixed asset camera',data)
scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
clay=bpy.data.materials.new('Neutral clay');clay.use_nodes=True
clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.48,.49,.47,1)
clay.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.7
views={
    'concept':((-4.6,4.6,3.2),(0,0,.45),4.35,1400,1000),
    'head':((-.012,-.64,3.4),(-.012,-.86,.8),1.05,1050,1050),
    'side':((-5,0,1.55),(0,0,.43),4.1,1400,850),
    'top':((0,.001,6),(0,0,.45),4.25,1100,1200),
    'clay':((-4.6,4.6,3.2),(0,0,.45),4.35,1400,1000),
    'web-size':((-4.6,4.6,3.2),(0,0,.45),4.35,280,200),
    # Inferred from the collage's main scene: a higher, more lateral camera
    # exposes the resting face and feet without altering the authored pose.
    'reference':((-4.6,1.7,3.8),(0,0,.45),4.25,1400,1000),
    'cloth':((-1.0,.45,2.7),(0,-.16,.63),1.50,1100,1100),
    'feet':((-.8,2.5,1.6),(0,1.14,.48),.90,900,900),
    'portrait':((-1.15,.08,1.8),(-.012,-.82,.82),1.10,1050,1050),
    # Same fixed cameras in neutral clay expose form without surface pigment.
    'head-clay':((-.012,-.64,3.4),(-.012,-.86,.8),1.05,1050,1050),
    'portrait-clay':((-1.15,.08,1.8),(-.012,-.82,.82),1.10,1050,1050),
    'body':((-1.8,1.9,2.6),(0,.16,.64),2.05,1100,1100),
    'body-clay':((-1.8,1.9,2.6),(0,.16,.64),2.05,1100,1100),
    'anatomy-top':((0,.029,6),(0,.03,.56),2.83,1300,800),
    'anatomy-side':((-7,.03,.68),(0,.03,.68),2.83,1300,650),
    'anatomy-oblique':((-2.25,2.65,2.90),(0,.04,.55),2.70,1200,900),
    'anatomy-hands':((-.85,-1.32,2.72),(-.09,-.884,.690),1.06,1250,900),
    'anatomy-palms':((-.13,-1.84,2.4),(-.01,-.957,.543),.92,1250,900),
    'anatomy-legs':((-.78,1.55,2.26),(0,.717,.490),1.46,1250,900),
}
anatomy = bpy.data.objects.get('Sleeper_Anatomy')
original_visibility = {obj: obj.hide_render for obj in scene.objects}
manifest={'source':str(source),'seed':41,'samples':a.samples,'views':{}}
manifest_path=out/'cameras.json'
if manifest_path.exists():
    previous=json.loads(manifest_path.read_text(encoding='utf-8'))
    if previous.get('source')==str(source) and previous.get('seed')==41:
        manifest['views']=previous.get('views',{})
for name in a.views.split(','):
    at,target,scale,width,height=views[name]
    body_study = name.startswith('anatomy-')
    if body_study and anatomy is None:
        p.error('Anatomy views require the editable boat master')
    for obj, hidden in original_visibility.items():
        if name == 'anatomy-palms' and obj.type in {'MESH','CURVE'}:
            obj.hide_render = not (obj.get('sleeper_region')=='arm' or obj.name=='CH_SoftPillow')
        elif body_study and obj.type in {'MESH','CURVE'}:
            obj.hide_render = not (obj == anatomy or (
                                       obj.get('sleeper_region') == 'head' and obj.name != 'Sleeper_Face')
                                   or obj.name.startswith(('CH_SoftPillow', 'CH_LooseFoldedThrow',
                                                           'BOAT_Floorboard', 'BOAT_Thwart')))
        else:
            obj.hide_render = hidden
    camera.location=at
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    if name == 'anatomy-top':
        camera.rotation_euler.rotate_axis('Z', math.pi/2)
    data.ortho_scale=scale;scene.render.resolution_x=width;scene.render.resolution_y=height
    scene.view_layers[0].material_override=clay if body_study or name=='clay' or name.endswith('-clay') else None
    scene.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    manifest['views'][name]={'camera':at,'target':target,'orthoScale':scale,'size':[width,height],'samples':a.samples}
manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
