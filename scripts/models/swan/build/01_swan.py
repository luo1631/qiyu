"""Independent swan asset; never opens/rebuilds the shared pond or boat masters.
Blender metres, -Y forward, Z up, origin at the waterline. Hidden forms inferred.
Run: blender --background --python scripts/models/swan/build/01_swan.py
"""
import bpy, bmesh, math, json, sys
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[2]
BLOCKOUT = '--blockout' in sys.argv
arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
output = next((Path(value).resolve() for value in arguments if not value.startswith('--')), None)
if output:
    output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
bpy.context.preferences.filepaths.save_version = 0
low = bpy.data.collections.new('LOW'); scene.collection.children.link(low)

def material(name, color, roughness):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=roughness
    return m
ivory=material('Ivory plumage',(.92,.924,.90),.76)
feather=material('Warm white feather vanes',(.96,.96,.93),.75)
beak=material('Muted orange keratin',(.67,.245,.065),.42)
mask=material('Charcoal face and feet',(.018,.025,.023),.56)
eye=material('Dark wet eye',(.008,.011,.010),.20)

def own(o,name,mat):
    o.name=name
    for c in list(o.users_collection):c.objects.unlink(o)
    low.objects.link(o)
    o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=True
    return o

def oval(name,at,scale,mat,segments=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=at)
    o=own(bpy.context.object,name,mat);o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return o

def mesh(name,verts,faces,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);low.objects.link(o);o.data.materials.append(mat)
    for f in data.polygons:f.use_smooth=True
    return o

def sample(points,t):
    f=t*(len(points)-1);i=min(len(points)-2,int(f));u=f-i
    a=points[max(0,i-1)];b=points[i];c=points[i+1];d=points[min(len(points)-1,i+2)]
    return [.5*(2*b[k]+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u) for k in range(len(b))]

def tube(name,points,mat,steps=72,sides=20):
    verts=[];faces=[]
    for i in range(steps+1):
        t=i/steps;p=sample(points,t);a=sample(points,max(0,t-.001));b=sample(points,min(1,t+.001))
        tangent=Vector(b[:3])-Vector(a[:3]);tangent.normalize()
        u=Vector((1,0,0));v=tangent.cross(u).normalized()
        for j in range(sides):
            angle=j/sides*math.tau
            verts.append(Vector(p[:3])+u*math.cos(angle)*p[3]+v*math.sin(angle)*(p[4] if len(p)>4 else p[3]))
    for i in range(steps):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(steps*sides+j for j in range(sides))])
    return mesh(name,verts,faces,mat)

# One continuous, oval-section surface from tail through breast, neck and head.
# The reference's low body / thin receding neck / small head take precedence over
# adding small feather pieces. No voxel junction bulge at the base of the neck.
body=tube('CR_Swan_Body_LOD0',[
    (0,.77,.10,.012,.012),(0,.56,.105,.16,.12),(0,.32,.10,.27,.21),
    (0,.06,.095,.30,.245),(0,-.20,.11,.245,.225),(0,-.43,.20,.125,.125),
    (0,-.57,.31,.078,.085),(0,-.50,.48,.050,.057),(0,-.36,.66,.044,.050),
    (0,-.35,.82,.045,.052),(0,-.42,.945,.050,.056),(0,-.54,.986,.056,.059),
    (0,-.63,.976,.046,.040),(0,-.687,.961,.026,.025)],ivory,180,40)

def vane(name,start,end,width,arch,mat,rows=10,cols=6):
    # The open silhouette reads clearly when the small tail vanes meet.
    a,b=Vector(start),Vector(end);d=b-a
    side=Vector((d.y,-d.x,0)).normalized();verts=[];faces=[]
    for k in range(2):
        for i in range(rows+1):
            t=i/rows;w=width*(.08+.92*math.sin(math.pi*t)**.65)*(1-.40*t)
            for j in range(cols+1):
                q=j/cols*2-1
                p=a+d*t+side*(w*q)
                p.z+=arch*math.sin(math.pi*t)+(1-q*q)*(.0015 if k==0 else -.001)*math.sin(math.pi*t)
                # subtle central keel; feather vanes remain broad, smooth highlights.
                if k==0:p.z+=.0006*math.exp(-q*q*45)*math.sin(math.pi*t)
                verts.append(p)
    layer=(rows+1)*(cols+1)
    for k in range(2):
        for i in range(rows):
            for j in range(cols):
                a=k*layer+i*(cols+1)+j
                face=(a,a+1,a+cols+2,a+cols+1)
                faces.append(face if k==0 else tuple(reversed(face)))
    border=list(range(cols+1))+[i*(cols+1)+cols for i in range(1,rows+1)]+[rows*(cols+1)+j for j in range(cols-1,-1,-1)]+[i*(cols+1) for i in range(rows-1,0,-1)]
    for n,a in enumerate(border):
        b=border[(n+1)%len(border)];faces.append((a,b,b+layer,a+layer))
    return mesh(name,verts,faces,mat)


def flight_wing(side,label):
    # A closed airfoil runs from the breast to the outer hand. The trailing
    # vanes overlap it and widen toward the tip, with six broad primary ends.
    stations=[(.14,-.16,.24,.246,.062),(.23,-.22,.37,.268,.074),(.37,-.23,.46,.282,.071),
              (.53,-.22,.46,.307,.061),(.69,-.20,.43,.322,.051),(.82,-.18,.38,.333,.042),
              (.97,-.14,.32,.337,.035),(1.12,-.078,.27,.329,.029),
              (1.28,.012,.23,.310,.020),(1.46,.128,.17,.285,.008)]
    section=[(0,0),(.10,.59),(.24,1),(.49,.88),(.73,.53),(.92,.20),(1,0),
             (.92,-.08),(.73,-.23),(.49,-.42),(.24,-.53),(.10,-.35)]
    verts=[];faces=[];n=len(section)
    for i,(span,front,back,height,thick) in enumerate(stations):
        verts.extend((side*span,front+(back-front)*depth,height+thick*camber) for depth,camber in section)
        if i>0:
            for j in range(n):
                a=(i-1)*n+j;b=(i-1)*n+(j+1)%n
                faces.append((a,b,b+n,a+n))
    faces.extend([tuple(reversed(range(n))),tuple(range(len(verts)-n,len(verts)))])
    name='CR_Swan_FlightWing_'+label
    wing=mesh(name,verts,faces,ivory)
    vanes=[]
    ends=[(.53,.30,.73,.53,.096),(.64,.27,.90,.53,.089),(.76,.23,1.09,.51,.084),
          (.86,.19,1.24,.47,.079),(.95,.15,1.39,.42,.073),(1.03,.125,1.48,.36,.068),
          (1.12,.10,1.53,.29,.061),(1.20,.10,1.53,.226,.056),(1.26,.11,1.50,.17,.045)]
    for i,(x,root,tip,end,width) in enumerate(ends):
        vanes.append(vane(name+' vane '+str(i),(side*x,root,.301+.021*math.sin(i*.43)),
                          (side*tip,end,.27+.012*math.sin(i*.45)),width,.017,feather,rows=5,cols=4))
    bpy.ops.object.select_all(action='DESELECT')
    for part in [wing,*vanes]:part.select_set(True)
    bpy.context.view_layer.objects.active=wing;bpy.ops.object.join()
    wing.name=name
    return wing


wings=[]
folded_wings=[]
for s,side in [(-1,'L'),(1,'R')]:
    wing=oval('CR_Swan_FoldedWing_'+side+'_LOD0',(s*.105,.17,.205),(.195,.46,.16),ivory,64,48)
    folded_wings.append(wing)
    # Folded primaries are continuous relief on the curved wing. The root is
    # buried through the back; the seams open gradually toward the trailing tip.
    for vertex in wing.data.vertices:
        p=vertex.co;rear=max(0,min(1,(p.y+.02)/.43))
        p.x*=1-.26*rear
        if p.z>0 and not BLOCKOUT:
            progress=max(0,min(1,(p.y+.13)/.56));fade=math.sin(math.pi*progress)**.85
            across=(s*p.x+.164+progress*.040+progress*progress*.035)/.329
            course=(across+.032*math.sin(progress*math.pi))*5.0
            seam=math.exp(-(math.sin(math.pi*course)/.33)**2)
            p.z-=.008*seam*fade*(p.z/.16)**.65
            p.z+=.016*rear*rear*(p.z/.16)**.65
    for i in range(3):
        vane('Tail '+side+str(i),(s*.035*i,.43,.20),(s*(.015+.045*i),.81-.04*i,.12),.043,.015,feather)
    # Small eyes are inset in the face, no cartoon socket bulbs.
    oval('CR_Swan_Eye_'+side+'_LOD0',(s*.048,-.601,.997),(.006,.008,.007),eye,20,12)
    # Inferred folded legs, waterline keeps these quiet in the real scene.
    foot=mesh('CR_Swan_Foot_'+side+'_LOD0',[(s*.13,.19,-.09),(s*.09,.35,-.22),(s*.24,.47,-.20),(s*.24,.35,-.22),(s*.31,.43,-.20)],[(0,1,2),(0,2,3),(0,3,4)],mask)
    sol=foot.modifiers.new('Web thickness','SOLIDIFY');sol.thickness=.006
    bpy.context.view_layer.objects.active=foot;bpy.ops.object.modifier_apply(modifier=sol.name)
    if not BLOCKOUT:wings.append((s,side,flight_wing(s,side)))

# Rounded wedge beak, tapering from the black base to a low tip.
beak_obj=mesh('CR_Swan_Beak_LOD0',[(-.027,-.675,.985),(.027,-.675,.985),(-.030,-.681,.948),(.030,-.681,.948),
    (-.015,-.816,.953),(.015,-.816,.953),(-.013,-.815,.941),(.013,-.815,.941)],
    [(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5),(0,2,3,1),(4,5,7,6)],beak)
bev=beak_obj.modifiers.new('Keratin edge','BEVEL');bev.width=.006;bev.segments=3
bpy.context.view_layer.objects.active=beak_obj;bpy.ops.object.modifier_apply(modifier=bev.name)
oval('Black basal knob',(0,-.675,.981),(.019,.020,.012),mask,24,16)
for s in [-1,1]:oval('Nostril '+str(s),(s*.022,-.716,.965),(.002,.008,.003),mask,12,8)

# Materials and geometry are shared by both render profiles. UVs retained for future maps.
for o in list(low.objects):
    bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-8)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    o.data.name=o.name
    for f in o.data.polygons:f.use_smooth=True
    if not o.data.uv_layers:
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')

if wings:
    armature=bpy.data.armatures.new('Swan flight joints')
    rig=bpy.data.objects.new('Swan Flight Rig',armature);low.objects.link(rig);rig.show_in_front=True
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for s,label,wing in wings:
        shoulder=armature.edit_bones.new('SwanShoulder_'+label)
        shoulder.head=(s*.16,.03,.27);shoulder.tail=(s*.78,.03,.27)
        wrist=armature.edit_bones.new('SwanWrist_'+label)
        wrist.head=shoulder.tail;wrist.tail=(s*1.42,.03,.27);wrist.parent=shoulder;wrist.use_connect=True
    bpy.ops.object.mode_set(mode='OBJECT')
    for s,label,wing in wings:
        wing.shape_key_add(name='Basis');tucked=wing.shape_key_add(name='Tucked')
        shoulder=wing.vertex_groups.new(name='SwanShoulder_'+label)
        wrist=wing.vertex_groups.new(name='SwanWrist_'+label)
        for v,k in zip(wing.data.vertices,tucked.data):
            x,y,z=v.co;span=max(0,min(1,(abs(x)-.14)/1.40))
            k.co=(s*(.14+.084*math.sin(math.pi*span)-.05*span+(y-.18)*.08),
                  -.03+.62*span+.22*(y-.16),.225+(z-.27)*.33+.026*math.sin(math.pi*span))
            w=max(0,min(1,(abs(x)-.60)/.35));w=w*w*(3-2*w)
            if w<1:shoulder.add([v.index],1-w,'REPLACE')
            if w>0:wrist.add([v.index],w,'REPLACE')
        tucked.value=1
        wing.parent=rig
        skin=wing.modifiers.new('Shoulder and wrist skin','ARMATURE');skin.object=rig

scene.world=bpy.data.worlds.new('Review neutral');scene.world.color=(.36,.36,.36)
scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
scene.display.shading.background_type='WORLD';scene.world.color=(.12,.15,.14)
scene.render.resolution_x=900;scene.render.resolution_y=700;scene.render.resolution_percentage=100
camdata=bpy.data.cameras.new('ReviewCamera');cam=bpy.data.objects.new('ReviewCamera',camdata);scene.collection.objects.link(cam);scene.camera=cam
camdata.type='ORTHO';camdata.ortho_scale=2.28
review=output or ROOT/'.playwright-mcp/wildlife-20261104';review.mkdir(parents=True,exist_ok=True)
phase='blockout' if BLOCKOUT else 'final'
for name,pos in [('side',(3,-.05,1.0)),('front',(0,-3,1.0)),('oblique',(2,-3,2.5))]:
    cam.location=pos;cam.rotation_euler=(Vector((0,-.06,.47))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(review/(phase+'-'+name+'.png'));bpy.ops.render.render(write_still=True)

if wings:
    for _,_,wing in wings:wing.data.shape_keys.key_blocks['Tucked'].value=0
    for wing in folded_wings:wing.hide_render=True
    camdata.ortho_scale=3.60;cam.location=(1.15,-3.30,2.55)
    cam.rotation_euler=(Vector((0,.02,.43))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(review/'flight-spread.png');bpy.ops.render.render(write_still=True)
    for _,_,wing in wings:wing.data.shape_keys.key_blocks['Tucked'].value=1
    for wing in folded_wings:wing.hide_render=False

bpy.ops.wm.save_as_mainfile(filepath=str((output or HERE)/('blockout.blend' if BLOCKOUT else 'CR_Swan_master.blend')))
if not BLOCKOUT:
    # Keep the folded volumes independent so they can settle into the back as the wings unfold.
    bpy.ops.object.select_all(action='DESELECT')
    for wing in folded_wings:wing.select_set(True)
    folded=folded_wings[0]
    bpy.context.view_layer.objects.active=folded;bpy.ops.object.join()
    folded.name='CR_Swan_FoldedWings_LOD0'
    folded.shape_key_add(name='Basis');stowed=folded.shape_key_add(name='BlendIntoBack')
    for v,k in zip(folded.data.vertices,stowed.data):
        x,y,z=v.co
        k.co=(x*.37,.17+(y-.17)*.52,.154+(z-.205)*.27)
    # Consolidate the remaining static parts by material. Feet keep real stroke pivots.
    feet=[o for o in low.objects if 'Foot_' in o.name]
    static=[o for o in low.objects if o.type=='MESH' and o!=folded and o not in feet and all(o!=wing for _,_,wing in wings)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in static:o.select_set(True)
    bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body.name='CR_Swan_Body_LOD0'
    # A gentle neck glance deforms the continuous surface; no joint seam.
    body.shape_key_add(name='Basis');glance=body.shape_key_add(name='Glance')
    for v,k in zip(body.data.vertices,glance.data):
        x,y,z=v.co;w=max(0,min(1,(z-.48)/.55));w=w*w*(3-2*w)
        k.co.x+=w*.025
    reach=body.shape_key_add(name='FlightReach')
    for v,k in zip(body.data.vertices,reach.data):
        _,_,z=v.co;w=max(0,min(1,(z-.29)/.65));w=w*w*(3-2*w)
        k.co.y-=.34*w;k.co.z-=.49*w
    for foot in feet:
        pivot=Vector((-.13 if '_L_' in foot.name else .13,.19,-.09))
        for v in foot.data.vertices:v.co-=pivot
        foot.location=pivot
    bpy.ops.object.select_all(action='DESELECT')
    for o in low.objects:o.select_set(True)
    out=(output or ROOT/'public/models')/'pond-swan.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_animations=False,export_morph=True)
    # A clean reimport checks deliverable dimensions and every actual triangle.
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(out))
    # Blender also creates a viewport marker for bones on import.
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('CR_Swan_')]
    points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    tris=sum(len(p.vertices)-2 for o in objects for p in o.data.polygons)
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    joints=[bone.name for o in bpy.context.scene.objects if o.type=='ARMATURE' for bone in o.data.bones]
    report={'asset':'CR_Swan','bytes':out.stat().st_size,'triangles':tris,'boundsBlender':bounds,'materials':len(bpy.data.materials),'meshes':len(objects),'roundtrip':'pass','inferred':'hidden underside, feet, back and feather rows','animation':'glide, water run, low flight and landing; skinned shoulders and wrists, tucked wings and neck reach','flightJoints':joints}
    assert len(joints)==4 and len(objects)==6,report
    assert tris<35000 and out.stat().st_size<2000000,report
    ((output or HERE)/'asset-manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))
