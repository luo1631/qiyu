"""Assemble the sleeping passenger, bedding and articulated boat cat."""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix
from build_sleeper import build_sleeper, fit_sleeper_pillow
from surface_texture import painted_surface, project_surface_uv


def build_character(materials, mesh, ball, curve):
    before = set(bpy.data.objects)

    def pigment(name, rgb, roughness=.86):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*rgb, 1)
        shader.inputs['Roughness'].default_value = roughness
        shader.inputs['Specular IOR Level'].default_value = .23
        materials[name] = mat

    pigment('CH_Linen', (.21,.29,.32), .92)
    pigment('CH_Pillow', (.38,.45,.46), .91)

    def surface(name, vertices, faces, mat):
        obj = mesh(name, vertices, faces, mat)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        return obj

    def catmull(values, samples=3):
        result = []
        values = [Vector(value) for value in values]
        for row in range(len(values)-1):
            p0,p1,p2,p3 = [values[max(0,min(len(values)-1,i))] for i in [row-1,row,row+1,row+2]]
            for step in range(samples):
                t=step/samples
                result.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
        result.append(values[-1])
        return result

    def tube(name, sections, mat, sides=10, samples=2):
        # x,y,z,radius, smoothly transported frames through each elbow/knee.
        samples4=catmull(sections,samples)
        points=[Vector(v[:3]) for v in samples4]
        vertices=[]
        previous=None
        for i,point in enumerate(points):
            tangent=(points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
            u=tangent.cross(Vector((0,0,1)))
            if u.length<.05:
                u=tangent.cross(Vector((0,1,0)))
            u.normalize()
            if previous is not None and u.dot(previous)<0:
                u.negate()
            previous=u.copy()
            v=tangent.cross(u).normalized()
            radius=max(.006,samples4[i][3])
            for j in range(sides):
                a=j/sides*math.tau
                vertices.append(point+(u*math.cos(a)+v*math.sin(a)*.98)*radius)
        faces=[tuple(reversed(range(sides)))]
        for row in range(len(points)-1):
            for j in range(sides):
                a,b=row*sides+j,row*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(range((len(points)-1)*sides,len(points)*sides)))
        return surface(name,vertices,faces,mat)

    # The padded berth tapers behind the shoulders and ends below the hips.
    # Leave the lower footwell and the timber alongside the figure visible.
    vertices=[];faces=[];cols,rows=22,32
    cushion_depth=.052
    for row in range(rows+1):
        t=row/rows;y=-1.20+t*1.48
        width=.283+.049*math.sin(t*math.pi)-.025*t*t
        for col in range(cols+1):
            u=col/cols*2-1;x=u*width+.008*math.sin(t*11)*u*u
            edge=abs(u)**5;end=abs(t-.5)*2
            back=max(0,min(1,(.23-y)/.95))
            z=.404+.105*back*(1-.50*edge)-.014*edge+.004*math.sin(u*10+t*7)*edge
            z+=.004*math.cos(t*math.tau)*max(0,1-u*u)
            z-=.009*end**9
            z+=.024*min(1,max(0,(y+.935)/.21))
            # Ease the thicker underside into the two real seat tops.
            for support,top in [(-1.10,.40),(.23,.37)]:
                distance=max(0,abs(y-support)-.115)
                z=max(z,top+cushion_depth+.002-.074*(1-math.exp(-(distance/.045)**2)))
            rounded_end=.026*edge*((1-t)**8-t**8)
            vertices.append((x,y+rounded_end+.007*math.sin(u*8)*end**6,z))
            if row<rows and col<cols:
                k=row*(cols+1)+col;faces.append((k,k+1,k+cols+2,k+cols+1))
    blanket=surface('CH_LooseFoldedThrow',vertices,faces,'CH_Linen')
    thickness=blanket.modifiers.new('Padded berth thickness','SOLIDIFY');thickness.thickness=cushion_depth;thickness.offset=-1
    radius=blanket.modifiers.new('Soft cushion edge','BEVEL');radius.width=.008;radius.segments=3
    # Coarse cushion faces bridged compressed vertices and cut into thin locks.
    pillow_z,pillow_depth=.493,.106
    pillow=ball('CH_SoftPillow',(-.015,-.972,pillow_z),(.35,.238,pillow_depth),'CH_Pillow',segments=96,rings=48)
    for vertex in pillow.data.vertices:
        # Squared soft corners, with the head indentation applied below.
        for axis in (0,1):
            value=vertex.co[axis]
            vertex.co[axis]=math.copysign(abs(value)**.64,value)
        # Inferred short corner tension folds in the cushion cover. Keep the
        # support underside fixed; head compression below uses this real mesh.
        if vertex.co.z>0:
            x,y=vertex.co.x,vertex.co.y
            corner=max(0,min(1,(abs(x)+abs(y)-1.15)/.55))
            crease=math.exp(-((abs(x)-abs(y)*.85-.08)/.055)**2)
            shoulder=math.exp(-((abs(x)-abs(y)*.85-.17)/.075)**2)
            vertex.co.z+=corner*(-.007*crease+.0025*shoulder)/pillow_depth
        if pillow_z+vertex.co.z*pillow_depth<.403:
            vertex.co.z=(.403-pillow_z)/pillow_depth

    passenger = build_sleeper(bpy.context.collection, resting=True)
    for obj in passenger:
        obj['character_subject'] = 'person'
        if obj.get('sleeper_region') == 'head':
            obj['character_region'] = 'head'
    bpy.context.view_layer.update()
    fit_sleeper_pillow(pillow, passenger)

    # The sleeping companion settles over its hocks on the forward thwart.
    pigment('CH_CatOrange',(.68,.34,.12),.87)
    pigment('CH_CatCream',(.91,.87,.73),.90)
    pigment('CH_CatPink',(.58,.30,.24),.85)
    cat_orange=Vector((.68,.34,.12));cat_cream=Vector((.91,.87,.73));ear_rose=Vector((.62,.36,.26))
    def cat_smooth(lo,hi,x):
        t=max(0,min(1,(x-lo)/(hi-lo)))
        return t*t*(3-2*t)

    def cat_shell(name,profile,material,section,sides=24):
        """Closed elliptical sections, with the silhouette shaped in metres."""
        sections=catmull(profile,2);vertices=[];faces=[tuple(reversed(range(sides)))]
        for row,(z,y,width,depth) in enumerate(sections):
            for j in range(sides):
                angle=j/sides*math.tau
                vertices.append(section(z,y,max(.001,width),max(.001,depth),math.cos(angle),math.sin(angle)))
                if row:
                    a=(row-1)*sides+j;b=(row-1)*sides+(j+1)%sides
                    faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(range((len(sections)-1)*sides,len(sections)*sides)))
        return surface(name,vertices,faces,material)

    def cat_pigment(obj, color_at, name=None):
        name=name or obj.name+'Coat'
        mat=materials.get(name)
        if mat is None:
            mat=materials['CH_CatCream'].copy();mat.name=name;materials[name]=mat
            node=mat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='CatCoat'
            mat.node_tree.links.new(node.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        obj.data.materials[0]=mat
        attribute=obj.data.color_attributes.new(name='CatCoat',type='FLOAT_COLOR',domain='POINT')
        for vertex in obj.data.vertices:
            attribute.data[vertex.index].color=(*color_at(vertex.co),1)

    torso_profile=[(.442,1.081,.067,.068),(.458,1.078,.096,.097),(.484,1.079,.120,.120),
                   (.519,1.086,.122,.131),(.561,1.101,.116,.119),(.603,1.112,.105,.102),
                   (.645,1.114,.097,.089),(.676,1.110,.085,.079),(.704,1.104,.077,.073),
                   (.732,1.096,.079,.078),(.756,1.093,.070,.072),(.771,1.092,.051,.051)]
    def cat_body_section(z,y,width,depth,x_arc,y_arc):
        haunch=math.exp(-((z-.506)/.060)**2)
        cheek=math.exp(-((z-.657)/.074)**2)
        # The inner haunch tucks in where it passes the sleeper's heel.
        heel_clearance=.028*math.exp(-((z-.484)/.048)**2-((y_arc-.19)/.66)**2)*max(0,-x_arc)**3
        return (-.32+x_arc*width*(1+.045*haunch*max(0,-y_arc))+heel_clearance,
                y+y_arc*depth-.008*cheek*x_arc*x_arc,z)
    cat_body=cat_shell('CH_CatBody',torso_profile,'CH_CatOrange',cat_body_section,28)
    def cat_bib(p):
        shoulder=abs(p.x+.32)
        bib=p.y-1.067-.24*shoulder+.012*math.cos((p.z-.48)*10)
        return cat_orange.lerp(cat_cream,cat_smooth(.006,.075,bib))
    head_size=Vector((.134,.110,.116))
    cat_head=ball('CH_CatHead',(-.32,1.103,.793),head_size,'CH_CatCream',segments=40,rings=26)
    head_center=cat_head.location.copy()
    face_parts = []
    ear_parts = []
    foot_parts = []

    def cat_face_form(normalized):
        x, y, z = normalized
        cheek=math.exp(-((z+.32)/.49)**2)
        jaw=cat_smooth(.35,1,-z)
        pads=max(0,y)*math.exp(-((abs(x)-.20)/.29)**2-((z+.32)/.33)**2)
        bridge=max(0,y)*math.exp(-(x/.27)**2-((z+.06)/.38)**2)
        temple=cat_smooth(.15,.80,z)
        return Vector((x*(.98+.09*cheek-.17*jaw-.07*temple),y+.17*pads+.045*bridge,z))

    def cat_face_point(x, z, clearance):
        u,v=x/head_size.x,(z-cat_head.location.z)/head_size.z
        shape = cat_face_form((u, math.sqrt(max(.02, 1 - u * u - v * v)), v))
        return cat_head.location+Vector((shape.x*head_size.x,shape.y*head_size.y+clearance,shape.z*head_size.z))

    for vertex in cat_head.data.vertices:
        vertex.co = cat_face_form(vertex.co)
    def cat_cheeks(p):
        muzzle=.11+.27*max(0,p.y)-p.z-.49*abs(p.x)
        white=cat_smooth(-.13,.29,muzzle)*cat_smooth(-.52,.31,p.y)
        return cat_orange.lerp(cat_cream,white)
    for side in [-1,1]:
        x=-.32+side*.080
        ear_profile=[(.842,1.074,.043,.030),(.858,1.079,.046,.027),(.881,1.080,.043,.023),
                     (.908,1.078,.031,.019),(.934,1.073,.019,.013),(.949,1.069,.010,.008),
                     (.954,1.068,.004,.004),(.956,1.067,.0012,.0014)]
        def ear_section(z,y,width,depth,x_arc,y_arc):
            t=cat_smooth(.842,.956,z)
            cradle=cat_smooth(.857,.891,z)*(1-cat_smooth(.930,.955,z))
            cup=.010*max(0,y_arc)**5*cradle
            return (x+side*.025*t+x_arc*width,y+y_arc*depth-cup-side*x_arc*.004,z)
        ear=cat_shell('CH_CatEar',ear_profile,'CH_CatOrange',ear_section,20)
        def cat_ear_color(p):
            pocket=cat_smooth(.863,.890,p.z)*(1-cat_smooth(.929,.950,p.z))
            front=cat_smooth(1.080,1.092,p.y)
            return cat_orange.lerp(ear_rose,pocket*front*.85)
        cat_pigment(ear,cat_ear_color,'CH_CatEarCoat')
        ear_parts.append((side,x,ear))

        foreleg_profile=[(.438,1.208,.030,.044),(.442,1.208,.038,.053),(.452,1.206,.043,.056),
                         (.465,1.203,.040,.052),(.484,1.190,.029,.040),(.520,1.179,.025,.032),
                         (.566,1.174,.027,.030),(.607,1.167,.032,.035),(.645,1.151,.036,.036),
                         (.665,1.138,.027,.027)]
        def foreleg_section(z,y,width,depth,x_arc,y_arc):
            paw=1-cat_smooth(.460,.507,z)
            knuckle=math.exp(-((z-.454)/.013)**2)
            notch=.0020*knuckle*max(0,y_arc)**7*math.exp(-((abs(x_arc)-.28)/.14)**2)
            foot_x=-.32+side*(.058+.008*cat_smooth(.468,.570,z))
            if side>0:foot_x-=.024*(1-cat_smooth(.455,.550,z))
            return (foot_x+math.copysign(abs(x_arc)**(1-.20*paw),x_arc)*width,
                    y+y_arc*(depth-notch)-.008*paw+side*.004*(1-cat_smooth(.438,.485,z)),max(.438,z))
        foot_parts.append(cat_shell('CH_CatPaw',foreleg_profile,'CH_CatCream',foreleg_section,20))
        eye=[]
        for i in range(7):
            t=i/6;xx=side*(.024+.052*t);zz=.809+.006*math.sin(t*math.pi)+.006*t
            eye.append(cat_face_point(xx,zz,.0017))
        face_parts.append(curve('CH_CatClosedEye',eye,.00195,'FaceLine'))
    nose=ball('CH_CatNose',cat_face_point(0,.778,.0022),(.009,.0046,.006),'CH_CatPink',segments=10,rings=8)
    for vertex in nose.data.vertices:
        vertex.co.x*=.82+.18*vertex.co.z
    face_parts.append(nose)
    lip=[cat_face_point(x,z,.0014) for x,z in [(-.013,.764),(-.007,.764),(0,.768),(.007,.764),(.013,.764)]]
    face_parts.append(curve('CH_CatMouth',lip,.0015,'FaceLine'))

    # A single skin runs from the cheeks to the planted paws. Give the two
    # junctions room to flex and keep the soles flat after union and smoothing.
    bpy.ops.object.select_all(action='DESELECT')
    for part in [cat_body,cat_head,*foot_parts]:part.select_set(True)
    bpy.context.view_layer.objects.active=cat_body
    bpy.ops.object.join()
    cat_body.name='CH_CatContour'
    union=cat_body.modifiers.new('Continuous cheeks, neck and shoulders','REMESH')
    union.mode='VOXEL';union.voxel_size=.0075;union.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=union.name)
    transition=cat_body.vertex_groups.new(name='Loose neck and shoulder skin')
    transition_name=transition.name
    for vertex in cat_body.data.vertices:
        x,y,z=vertex.co
        neck=math.exp(-((z-.716)/.045)**2)
        shoulder=math.exp(-((z-.602)/.061)**2)*cat_smooth(1.118,1.167,y)
        transition.add([vertex.index],max(neck,shoulder),'REPLACE')
    relax=cat_body.modifiers.new('Fair neck and shoulder transitions','SMOOTH')
    relax.vertex_group=transition_name;relax.factor=.64;relax.iterations=7
    bpy.ops.object.modifier_apply(modifier=relax.name)
    cat_body.vertex_groups.remove(cat_body.vertex_groups[transition_name])
    # Retopologise the joined form for the scale at which it appears on screen.
    # Keep the contact pad and the face in the same silhouette as the sculpt.
    triangles=sum(len(face.vertices)-2 for face in cat_body.data.polygons)
    web_shape=cat_body.modifiers.new('Continuous coat mesh density','DECIMATE')
    web_shape.ratio=min(1,4900/triangles)
    bpy.ops.object.modifier_apply(modifier=web_shape.name)
    for vertex in cat_body.data.vertices:
        if vertex.co.y>1.154 and abs(vertex.co.x+.32)>.025 and vertex.co.z<.453:
            vertex.co.z=max(.438,vertex.co.z-.005*(1-cat_smooth(.439,.453,vertex.co.z)))
    cat_body.data.materials.clear();cat_body.data.materials.append(materials['CH_CatCream'])
    for polygon in cat_body.data.polygons:polygon.material_index=0
    def cat_coat(p):
        delta=p-head_center
        face=cat_cheeks(Vector((delta.x/head_size.x,delta.y/head_size.y,delta.z/head_size.z)))
        return cat_bib(p).lerp(face,cat_smooth(.701,.773,p.z))
    cat_pigment(cat_body,cat_coat)

    # Smooth the curled tail and deform only its distal section when it stirs.
    tail_path = [(-.36,1.02,.56,.025), (-.418,1.04,.54,.023), (-.418,1.20,.494,.021),
                 (-.37,1.27,.486,.016), (-.33,1.25,.492,.011)]
    tail_sides, tail_samples = 10, 4
    cat_tail = tube('CH_CatCurledTail', tail_path, 'CH_CatOrange', sides=tail_sides, samples=tail_samples)
    cat_tail.shape_key_add(name='Basis')
    tip_lift = cat_tail.shape_key_add(name='TipLift')
    last_ring = (len(tail_path) - 1) * tail_samples
    for index, vertex in enumerate(tip_lift.data):
        t = max(0, 2 * (index // tail_sides / last_ring - .5))
        weight = t * t * (3 - 2 * t)
        vertex.co += weight * Vector((-.020, -.016, .052))

    # Face the sleeper and store real pivots in the editable asset.
    cat_turn = Matrix.Rotation(math.pi, 3, 'Z')
    cat_center = Vector((-.32, 1.10, 0))
    def facing_sleeper(at):
        # The bow narrows below the rail. Set the whole rig inboard so its
        # haunch fits inside both plank surfaces while the paws stay on the seat.
        return cat_center + cat_turn @ (Vector(at) - cat_center) + Vector((.103, .12, 0))

    def cat_pivot(name, at, parent=None):
        pivot = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(pivot)
        pivot.empty_display_size = .05
        pivot['pond_pose_pivot'] = True
        pivot.parent = parent
        pivot.location = facing_sleeper(at) - (parent.matrix_world.translation if parent else Vector((0, 0, 0)))
        bpy.context.view_layer.update()
        return pivot

    def attach(parent, parts):
        for obj in parts:
            obj.location = facing_sleeper(obj.location)
            obj.rotation_euler = (cat_turn @ obj.rotation_euler.to_matrix()).to_euler()
            if obj == cat_tail:
                obj.location.x -= .035  # Rest beside the relaxed heel.
        bpy.context.view_layer.update()
        for obj in parts:
            world = obj.matrix_world.copy()
            obj.parent = parent
            obj.matrix_world = world

    companion = cat_pivot('BoatCat', (-.32, 1.12, .44))
    chest = cat_pivot('BoatCatChest', (-.32, 1.12, .44), companion)
    head = cat_pivot('BoatCatHead', (-.32, 1.095, .703), companion)
    attach(companion, [cat_body,cat_tail])
    attach(head, face_parts)
    for side,x,shell in ear_parts:
        ear=cat_pivot('BoatCatEarL' if side<0 else 'BoatCatEarR',(x,1.078,.856),head)
        attach(ear,[shell])
    for name in ('CH_Linen', 'CH_Pillow'):
        painted_surface(materials[name], kind='cloth')
    bpy.context.view_layer.update()
    for obj in (blanket, pillow):
        project_surface_uv(obj, cloth=True)
    return set(bpy.data.objects) - before
