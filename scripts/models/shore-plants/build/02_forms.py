"""Reference-led shore kit; metres, Z up, root-centred static GLB prefabs.
References: ref/grass-clumps.png and ref/shrub-forms.png, supplied 2026-11-04.
Grass has independent roots and folded blades that close together near the ground.
Shrubs carry softly lobed volumes on woody forks. Dimensions, camera
elevation (~20 degrees) and hidden sides are inferred from concept views.
Low groundcover spreads from several rosettes, with optional small meadow flowers.
Source roots remain editable. Small screens share the same roots with
wider, lower-resolution grass blades and simplified shrub and groundcover meshes.
"""
import bpy
import bmesh
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from foliage_forms import layered_foliage, lobe, pigment

ROOT=Path(__file__).resolve().parents[4]
ASSET=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'.playwright-mcp/vegetation-forms-20261104'
arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if any(argument != '--review' for argument in arguments):
    raise ValueError('Only --review is supported')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.studiolight_rotate_z=.35
scene.display.shading.color_type='VERTEX';scene.display.shading.show_shadows=True
scene.display.shading.show_cavity=False;scene.display.shading.show_specular_highlight=False
scene.display.shading.background_type='WORLD';scene.world=bpy.data.worlds.new('Neutral review')
scene.world.color=(.76,.77,.75);scene.view_settings.view_transform='Standard'
scene.render.resolution_x=1400;scene.render.resolution_y=800;scene.render.resolution_percentage=100

GRASS=[pigment(c) for c in ['62795b','7d9066','99a376']]
SHRUB=[pigment(c) for c in ['4d7058','65865f','8c9b70']]
BARK=pigment('756750')
material=bpy.data.materials.new('Plant vertex pigment');material.use_nodes=True
bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.88
tint_node=material.node_tree.nodes.new('ShaderNodeVertexColor');tint_node.layer_name='PlantTint'
material.node_tree.links.new(tint_node.outputs['Color'],bsdf.inputs['Base Color'])

def mesh(name,vertices,faces,shades,collection):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(name,data);collection.objects.link(obj);data.materials.append(material)
    colors=data.color_attributes.new(name='PlantTint',type='FLOAT_COLOR',domain='POINT')
    for i,c in enumerate(shades):colors.data[i].color=(*c,1)
    for f in data.polygons:f.use_smooth=True
    return obj

def bezier(points,t):
    p=[Vector(v) for v in points];s=1-t
    return p[0]*s**3+p[1]*3*s*s*t+p[2]*3*s*t*t+p[3]*t**3

def blade_geometry(points,width,color,rows,broad=False):
    v=[];faces=[];colors=[]
    direction=Vector(points[-1])-Vector(points[0]);across=Vector((-direction.y,direction.x,0)).normalized()
    for shell in (1,-1):
        for row in range(rows+1):
            t=row/rows
            if broad:
                t=.5-.5*math.cos(math.pi*t)
            centre=bezier(points,t)
            tangent=(bezier(points,min(1,t+.001))-bezier(points,max(0,t-.001))).normalized()
            normal=across.cross(tangent).normalized()
            arc=math.sin(math.pi*t)
            profile=arc**.48*(.83+.32*t+.046*math.sin(t*math.tau*3)) if broad else (.46+.69*arc**.85)*(1-t)**.63
            w=max(.0002,width*profile)
            for side in (-1,0,1):
                fold=(.27 if broad else .17)*w*arc*(1-abs(side))
                p=centre+across*(w*side)+normal*(fold+shell*.0011)
                p.z=max(.001,p.z);v.append(tuple(p))
                tone=.72+.29*t+.13*arc*(1-abs(side))
                colors.append(tuple(c*tone for c in color))
    stride=(rows+1)*3
    for shell in range(2):
        for row in range(rows):
            for col in range(2):
                k=shell*stride+row*3+col;q=(k,k+1,k+4,k+3);faces.append(q if shell==0 else q[::-1])
    edge=[0,1,2]+[r*3+2 for r in range(1,rows+1)]+[rows*3+1,rows*3]+[r*3 for r in range(rows-1,0,-1)]
    for i,a in enumerate(edge):
        b=edge[(i+1)%len(edge)];faces.append((a,b,b+stride,a+stride))
    return v,faces,colors

def append_geometry(target,part):
    v,f,c=target;pv,pf,pc=part;start=len(v);v.extend(pv)
    f.extend(tuple(start+i for i in face) for face in pf);c.extend(pc)

def tube_geometry(points,radius,segments=9,color=BARK):
    vertices=[];faces=[];colors=[];sides=7
    for row in range(segments+1):
        t=row/segments;p=bezier(points,t)
        tangent=(bezier(points,min(1,t+.001))-bezier(points,max(0,t-.001))).normalized()
        across=tangent.cross(Vector((0,1,0))).normalized();up=tangent.cross(across).normalized();r=radius*(1-.76*t)
        for side in range(sides):
            a=side/sides*math.tau;q=p+across*(math.cos(a)*r)+up*(math.sin(a)*r)
            vertices.append(tuple(q));colors.append(color)
            if row<segments:faces.append((row*sides+side,row*sides+(side+1)%sides,(row+1)*sides+(side+1)%sides,(row+1)*sides+side))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple(segments*sides+i for i in range(sides))])
    return vertices,faces,colors

def collection(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c

TEMPLATES=collection('Grass templates');tufts=[];compact_tufts=[]
for variant in range(3):
    parts=([],[],[]);compact=([],[],[]);rng=random.Random(94+variant)
    lobe(parts, (0,0,.024), (.061,.047,.023), GRASS[0], variant, sides=8, rows=4)
    lobe(compact, (0,0,.024), (.061,.047,.023), GRASS[0], variant, sides=7, rows=3)
    for leaf in range(5):
        a=leaf*2.39996+variant*.47+rng.uniform(-.20,.20)
        h=[.43,.34,.30,.25,.19][leaf]*rng.uniform(.89,1.10)
        reach=[.16,.25,.28,.29,.23][leaf]*rng.uniform(.86,1.11)
        d=Vector((math.cos(a),math.sin(a),0));root=d*.010+Vector((0,0,.004))
        tip=h*(.91 if leaf==0 else .48)
        controls=[root,root+d*reach*.12+Vector((0,0,h*.66)),
                  root+d*reach*.60+Vector((0,0,h*1.15)),root+d*reach+Vector((0,0,tip))]
        width=(.044+.006*leaf)*rng.uniform(.92,1.18)
        color=GRASS[(leaf+variant)%3]
        append_geometry(parts,blade_geometry(controls,width,color,rows=7))
        if leaf in (0, 2, 3):
            append_geometry(compact,blade_geometry(controls,width*1.20,color,rows=3))
    obj=mesh('GrassRootVariant'+str(variant),*parts,TEMPLATES);tufts.append(obj)
    compact_obj=mesh('GrassCompact'+str(variant),*compact,TEMPLATES);compact_tufts.append(compact_obj)

prefabs=[];root_counts={};compact_sources=[]
grass_specs=[('EN_GrassSmall',9,.55,.42),('EN_GrassMedium',23,.84,.66),('EN_GrassLarge',47,1.35,.91)]
for index,(name,count,rx,ry) in enumerate(grass_specs):
    c=collection(name);parent=bpy.data.objects.new(name,None);c.objects.link(parent);prefabs.append(parent);root_counts[name]=count
    parent['role']='multi-root grass clump';parent['rootCount']=count
    rng=random.Random(107+index)
    for i in range(count):
        a=i*2.39996+rng.uniform(-.15,.15);r=math.sqrt(i/max(1,count-1))
        scale=(1.03-.49*r*r)*rng.uniform(.88,1.08)
        x=math.cos(a)*rx*r+.06*math.sin(a*3)*r;y=math.sin(a)*ry*r
        obj=bpy.data.objects.new(name+'_Root_'+str(i),tufts[i%3].data);c.objects.link(obj);obj.parent=parent
        obj.location=(x,y,0);obj.rotation_euler.z=rng.uniform(0,math.tau);obj.scale=(scale,scale,scale*(1.35 if index==1 else .95 if index==2 else 1))
        obj['rootContact']=True
        obj['grassVariant']=i%3

def shrub(name,kind):
    c=collection(name);parent=bpy.data.objects.new(name,None);c.objects.link(parent)
    parent['role']='woody shrub';parent['rootCount']=1;prefabs.append(parent)
    parts=([],[],[]);crown=[];rng=random.Random(460+kind)
    terminals=[(-.58,.12,.36),(.60,.03,.39),(-.24,-.29,.47),(.25,.30,.50),(.02,.01,.59)] if kind==0 else [(-.43,-.08,.58),(.43,.0,.62),(-.22,.30,.75),(.20,-.24,.77),(.02,.08,1.0)] if kind==1 else [(-.48,-.03,.68),(.53,.0,.63),(-.25,.19,.95),(.25,.1,1.22)]
    if kind==1:terminals += [(-.30,-.25,.26),(.34,-.25,.30),(.02,.28,.38),(-.05,-.35,.52)]
    if kind==2:terminals[0]=(-.63,-.03,.68);terminals[1]=(.66,.0,.63)
    trunk=[Vector((0,0,.018)),Vector((0,0,.19)),Vector((-.025,.015,.39 if kind==1 else .52)),Vector((.025,0,.58 if kind==1 else .75))]
    if kind>0:append_geometry(parts,tube_geometry(trunk,.054))
    for branch_id,end in enumerate(terminals):
        end=Vector(end)
        start=Vector(((branch_id-2)*.026,0,.018)) if kind==0 else bezier(trunk,.14 if branch_id>=5 else min(.90,.24+branch_id*.17))
        control=[start,start+Vector((0,0,.18)) if kind==0 else start.lerp(end,.27)+Vector((0,0,.06)),start.lerp(end,.72)+Vector((0,0,.045)),end]
        append_geometry(parts,tube_geometry(control,.040 if kind==0 else .028))
        width = (.36 if kind == 0 else .29 if kind == 1 else .28) * rng.uniform(.86, 1.13)
        color = SHRUB[branch_id % 3]
        a = math.atan2(end.y - start.y, end.x - start.x)
        crown.append((end + Vector((0, 0, .051)), (width * 1.15, width * .96, width * .59), color, a))
        reach = width * rng.uniform(.48, .67)
        offset = a + (1 if branch_id % 2 else -1) * 1.42
        at = end + Vector((math.cos(offset) * reach, math.sin(offset) * reach, rng.uniform(.065, .14)))
        small = width * rng.uniform(.49, .58)
        crown.append((at, (small * 1.23, small, small * .71), SHRUB[(branch_id + 1) % 3], offset))
    append_geometry(parts, layered_foliage(crown, compact=True, fringe=1))
    obj=mesh(name+'_Crown',*parts,c);obj.parent=parent;obj['rootContact']=True;root_counts[name]=1
    obj['plantVariant']=name
    compact_sources.append(obj)

for kind,name in enumerate(['EN_ShrubSpreading','EN_ShrubCompact','EN_ShrubOpen']):shrub(name,kind)


def groundcover(name, flowers=False):
    bed=collection(name)
    parent=bpy.data.objects.new(name,None)
    bed.objects.link(parent);prefabs.append(parent);root_counts[name]=1
    parent['role']='low groundcover';parent['rootCount']=1
    parts=([],[],[])
    rng=random.Random(934 if flowers else 921)
    palette=[pigment(c) for c in ['527658','769360','91a26e','65865c']]
    roots=[(0,0,1.02),(-.28,.06,.94),(.25,.095,.88),(.13,-.20,.74),(-.15,-.18,.71)]
    lobe(parts,(0,0,.032),(.053,.049,.031),palette[0],.4,sides=8,rows=4)
    for index,(x,y,size) in enumerate(roots):
        root=Vector((x,y,.018))
        stem_angle=rng.uniform(0,math.tau)
        for leaf in range(5):
            a=stem_angle+leaf*2.39996+rng.uniform(-.23,.23)
            direction=Vector((math.cos(a),math.sin(a),0))
            length=rng.uniform(.27,.44)*size*(.87 if flowers else 1)
            rise=rng.uniform(.14,.27)*size*(1.12 if leaf==0 else 1)
            tip=rise*(.78 if leaf==0 else .42)
            controls=[root,root+direction*(length*.12)+Vector((0,0,rise*.72)),
                      root+direction*(length*.65)+Vector((0,0,rise*1.18)),root+direction*length+Vector((0,0,tip))]
            width=rng.uniform(.063,.106)*size
            append_geometry(parts,blade_geometry(controls,width,palette[(index+leaf)%len(palette)],rows=6,broad=True))
    if flowers:
        petals=[pigment('e5d4ad'),pigment('e0b89a'),pigment('ebdfba')]
        gold=pigment('a38252')
        sites=[(-.35,.012,.294,.82),(-.20,-.14,.326,.92),(.02,.06,.365,1.06),
               (.15,.12,.300,.80),(.30,-.055,.242,.86),(.25,.22,.273,.69)]
        for i,(x,y,z,size) in enumerate(sites):
            append_geometry(parts,tube_geometry([(x-.04,y,.019),(x-.033,y,.16),(x,y,z-.047),(x,y,z)],
                .009,segments=4,color=GRASS[1]))
            for petal in range(5):
                a=(petal/5+i*.19)*math.tau
                lobe(parts,(x+math.cos(a)*.035*size,y+math.sin(a)*.035*size,z+.006*size),
                     (.024*size,.023*size,.011*size),petals[i%len(petals)],a,sides=7,rows=3)
            lobe(parts,(x,y,z+.013*size),(.021*size,.020*size,.012*size),gold,i,sides=8,rows=3)
    obj=mesh(name+'_Leaves',*parts,bed)
    obj.parent=parent;obj['rootContact']=True
    obj['plantVariant']=name
    compact_sources.append(obj)


groundcover('EN_Groundcover')
groundcover('EN_MeadowFlowers', flowers=True)
TEMPLATES.hide_viewport=TEMPLATES.hide_render=True
for i,parent in enumerate(prefabs):parent.location=((i%3-1)*3.4,(i//3)*2.8,0)
camera_data=bpy.data.cameras.new('ReviewCamera');camera=bpy.data.objects.new('ReviewCamera',camera_data)
scene.collection.objects.link(camera);scene.camera=camera;camera_data.type='ORTHO';camera_data.ortho_scale=10
camera.location=(0,-10,9);camera.rotation_euler=(Vector((0,1.4,.2))-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'shore-plants.blend'))

compact_collection = collection('Compact shore plants')
compact_export = []
for variant, template in enumerate(compact_tufts):
    obj = bpy.data.objects.new('GrassCompactRoot'+str(variant), template.data)
    compact_collection.objects.link(obj)
    obj['compactGrassVariant'] = variant
    obj.data.calc_loop_triangles()
    compact_export.append({'name': obj.name, 'triangles': len(obj.data.loop_triangles)})
compact_plants = []
for source in compact_sources:
    name = source['plantVariant']
    obj = bpy.data.objects.new('PlantLow_' + name, source.data.copy())
    compact_collection.objects.link(obj)
    obj['compactPlantVariant'] = name
    obj.data.name = obj.name
    bpy.context.view_layer.objects.active = obj
    cut = obj.modifiers.new('Simplify for low quality', 'DECIMATE')
    cut.ratio = .35
    bpy.ops.object.modifier_apply(modifier=cut.name)
    obj.data.calc_loop_triangles()
    compact_plants.append({'name': obj.name, 'triangles': len(obj.data.loop_triangles)})

for parent in prefabs:parent.location=(0,0,0)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT');manifest=[]
for obj in compact_collection.objects:
    obj.select_set(True)
for parent in prefabs:
    parent.select_set(True);points=[];tris=0
    for obj in parent.children:
        obj.select_set(True);obj.data.calc_loop_triangles();tris+=len(obj.data.loop_triangles)
        points.extend(obj.matrix_local@v.co for v in obj.data.vertices)
        if any(t.area<1e-12 for t in obj.data.loop_triangles):raise RuntimeError('Degenerate triangle: '+obj.name)
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    if bounds[2][0]<-.001:raise RuntimeError('Below root plane: '+parent.name)
    manifest.append({'name':parent.name,'triangles':tris,'rootCount':root_counts[parent.name],'boundsZUp':bounds})
raw = ROOT / 'scripts/models/raw/shore-plants.glb'
target = raw.with_name('.shore-plants.pending.glb')
result = bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_apply=False,export_animations=False,export_extras=True)
if 'FINISHED' not in result:
    raise RuntimeError('Blender glTF export failed')

scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
compact_collection.hide_render = True
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.82,.85,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
scene.render.resolution_y=480
clay=bpy.data.materials.new('Review clay');clay.use_nodes=True
clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.56,.57,.55,1)
clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.86
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));floor=bpy.context.object
floor.name='ReviewFloor';floor.data.materials.append(clay)
light_data=bpy.data.lights.new('Soft key','AREA');light_data.energy=850;light_data.shape='DISK';light_data.size=5
light=bpy.data.objects.new('Soft key',light_data);scene.collection.objects.link(light);light.location=(-3,-4,8)
light.rotation_euler=(Vector((0,0,.3))-light.location).to_track_quat('-Z','Y').to_euler()

for family,chosen in (zip(('grass','shrubs','groundcover'),(prefabs[:3],prefabs[3:6],prefabs[6:])) if '--review' in arguments else ()):
    REVIEW.mkdir(parents=True, exist_ok=True)
    for parent in prefabs:
        for obj in parent.children:obj.hide_render=parent not in chosen
    for i,parent in enumerate(chosen):parent.location=((i-(len(chosen)-1)/2)*3.4,0,0)
    for mode in ('clay','material'):
        scene.view_layers[0].material_override=clay if mode=='clay' else None
        scene.display.shading.color_type='SINGLE' if mode=='clay' else 'VERTEX'
        scene.display.shading.single_color=(.56,.57,.55)
        for view,loc in [('front',(0,-12,4.6)),('side',(9,-3,3.5)),('top',(0,0,12))]:
            if mode=='material' and view!='front':continue
            camera.location=loc;camera.rotation_euler=(Vector((0,0,.30))-camera.location).to_track_quat('-Z','Y').to_euler()
            camera_data.ortho_scale=10.1;scene.render.filepath=str(REVIEW/(family+'-'+mode+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
    for parent in chosen:parent.location=(0,0,0)

bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(target));roundtrip=[]
for row in manifest:
    parent=bpy.data.objects.get(row['name'])
    if parent is None:raise RuntimeError('Missing prefab '+row['name'])
    points=[];tris=0
    for obj in parent.children_recursive:
        if obj.type!='MESH':continue
        obj.data.calc_loop_triangles();tris+=len(obj.data.loop_triangles);points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    if tris!=row['triangles'] or any(abs(bounds[i][j]-row['boundsZUp'][i][j])>.0001 for i in range(3) for j in range(2)):raise RuntimeError('Roundtrip changed '+row['name'])
    roundtrip.append({'name':row['name'],'triangles':tris,'roots':len(parent.children),'boundsMatch':True})
for row in [*compact_export,*compact_plants]:
    obj = bpy.data.objects.get(row['name'])
    if obj is None or obj.type != 'MESH':
        raise RuntimeError('Missing compact tuft '+row['name'])
    obj.data.calc_loop_triangles()
    if len(obj.data.loop_triangles) != row['triangles']:
        raise RuntimeError('Roundtrip changed compact tuft '+row['name'])
if '--review' in arguments:
    (REVIEW/'roundtrip.json').write_text(json.dumps(roundtrip,indent=2),encoding='utf-8')
public = ROOT / 'public/models/shore-plants.glb'
pending = public.with_name('.shore-plants.pending.glb')
pending.write_bytes(target.read_bytes())
target.replace(raw)
pending.replace(public)
(ASSET/'asset-manifest.json').write_text(json.dumps({'units':'metres','authoringAxes':'Z up','runtimeAxes':'Y up','references':['ref/grass-clumps.png','ref/shrub-forms.png'],'inferred':'Absolute dimensions, camera elevation and hidden sides; reference is a concept sheet, not calibrated orthographic views.','animation':'static','materials':'vertex pigment, roughness .88; no textures','assets':manifest,'compactGrass':compact_export,'compactPlants':compact_plants},indent=2),encoding='utf-8')
print(json.dumps({'assets':manifest,'roundtrip':roundtrip}))
