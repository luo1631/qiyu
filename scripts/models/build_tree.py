"""A continuous broadleaf crown, grown along unequal scaffold branches.
Existing metres / Z-up and island origin; opaque leaves attach to real shoots.
"""
import bpy
import math
import random
from mathutils import Vector


def build_tree(materials, mesh):
    origin = Vector((-2.15, .55, 0))
    rng = random.Random(731)
    bark = materials['Wood'].copy()
    bark.name = 'TreeBark'
    bark.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .84
    node = bark.node_tree.nodes.new('ShaderNodeVertexColor')
    node.layer_name = 'BarkTint'
    bark.node_tree.links.new(node.outputs['Color'], bark.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    materials['TreeBark'] = bark
    structure=[]

    def bough(name, points):
        data = bpy.data.curves.new(name, 'CURVE')
        data.dimensions = '3D'; data.resolution_u = 6
        twig=name=='Tree leaf-bearing twig'
        data.bevel_depth = 1; data.bevel_resolution = 0 if twig else 2; data.use_fill_caps = True
        spline = data.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
        for point, (x, y, z, radius) in zip(spline.bezier_points, points):
            point.co = origin + Vector((x, y, z)); point.radius = radius
            point.handle_left_type = point.handle_right_type = 'AUTO'
        obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj)
        obj.data.materials.append(bark)
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
        bpy.context.view_layer.objects.active = obj; bpy.ops.object.convert(target='MESH')
        pigments = []
        for vertex in obj.data.vertices:
            p = vertex.co-origin; angle = math.atan2(p.y, p.x)
            groove = math.sin(angle*11+p.z*.8)*.5 + math.sin(angle*23-p.z*.6)*.18
            if p.z < 1.65:
                radial = Vector((p.x, p.y, 0))
                if radial.length > .001: vertex.co += radial.normalized()*groove*.009
            pigments.append(Vector((.21,.115,.058)).lerp(Vector((.35,.24,.115)),.46+groove*.25))
        tint = obj.data.color_attributes.new(name='BarkTint',type='FLOAT_COLOR',domain='CORNER')
        for loop in obj.data.loops: tint.data[loop.index].color=(*pigments[loop.vertex_index],1)
        for face in obj.data.polygons: face.use_smooth=True
        if not twig:structure.append(obj)
        obj.select_set(False)

    bough('Tree rooted trunk',[(0,0,.24,.30),(.04,.02,.70,.25),(-.07,.06,1.20,.21),
          (.02,.13,1.78,.17),(.18,.17,2.36,.125),(.10,.30,2.93,.075),(.26,.33,3.48,.016)])
    for i in range(5):
        a=i/5*math.tau+.2
        reach=.53+.075*math.sin(a*3)
        bough('Tree buttress root',[(math.cos(a)*reach,math.sin(a)*reach*.78,.27,.009),
              (math.cos(a)*.33,math.sin(a)*.29,.31,.052),(math.cos(a)*.14,math.sin(a)*.13,.46,.11),(0,0,.70,.14)])

    # Three load-bearing arms emerge at different heights. Upper twigs continue
    # the leader, so the crown reads as one tree rather than identical parasols.
    scaffolds=[
        [(-.04,.07,1.42,.145),(-.46,-.03,1.84,.119),(-.99,-.13,2.22,.071),(-1.41,-.15,2.48,.025)],
        [(.02,.13,1.87,.129),(.47,.08,2.16,.104),(.92,.13,2.49,.063),(1.28,.38,2.78,.023)],
        [(.15,.18,2.24,.095),(-.10,.59,2.57,.071),(-.38,1.03,2.93,.037),(-.42,1.28,3.17,.012)],
    ]
    for points in scaffolds:bough('Tree scaffold branch',points)
    # anchor, terminal, crown spread. Staggered heights and overlapping volumes
    # leave a few windows through the crown, without horizontal stacked shelves.
    crowns=[
        ((-.99,-.13,2.22),(-1.48,-.18,2.62),.86),
        ((-.46,-.03,1.84),(-.88,-.71,2.64),.78),
        ((-.99,-.13,2.22),(-1.06,.51,2.94),.80),
        ((.02,.13,1.78),(-.29,-.83,2.94),.79),
        ((.47,.08,2.16),(.61,-.65,2.85),.85),
        ((.92,.13,2.49),(1.34,-.26,2.96),.80),
        ((1.00,.18,2.56),(1.25,.53,3.12),.76),
        ((.15,.18,2.24),(.60,.76,3.25),.84),
        ((-.38,1.03,2.93),(-.42,1.18,3.30),.72),
        ((.10,.30,2.93),(-.62,.43,3.47),.81),
        ((.18,.17,2.36),(-.40,-.18,3.34),.80),
        ((.02,.13,1.78),(-.05,-.45,2.76),.70),
        ((.10,.30,2.93),(.30,-.16,3.60),.78),
        ((.26,.33,3.35),(.34,.48,3.64),.71),
    ]
    vertices=[]; faces=[]; pigments=[]

    def leaf(base,direction,normal,length,width,shade):
        direction=direction.normalized(); across=direction.cross(normal).normalized()
        normal=across.cross(direction).normalized()
        start=len(vertices); rows=4
        for row in range(rows+1):
            t=row/rows; breadth=max(.006,math.sin(math.pi*t)**.72)
            for side in [-1,0,1]:
                p=base+direction*(length*t)+across*(width*breadth*side)
                p+=normal*(length*(.17*math.sin(math.pi*t)-.10*t*t)+width*.12*(1-abs(side))*breadth)
                vertices.append(tuple(p))
                pigments.append(shade*(.90+.10*(side==0)+.08*t))
            if row<rows:
                k=start+row*3
                faces.extend([(k,k+3,k+4,k+1),(k+1,k+4,k+5,k+2)])

    for i,(anchor,terminal,spread) in enumerate(crowns):
        start=Vector(anchor);centre=Vector(terminal)
        mid=start.lerp(centre,.55)+Vector((0,0,.07))
        bough('Tree secondary branch',[(*start,.052),(*mid,.033),(*centre,.012)])
        for spray in range(8):
            az=spray*2.39996+i*.79
            # Shoots occupy upper and lower parts of the crown, with drooping
            # outer tips; every leaf's petiole starts on this curved shoot.
            reach=spread*rng.uniform(.53,.89)
            rise=[-.16,.21,.32,.04,.27,-.23,.35,.12][spray]
            direction=Vector((math.cos(az)*reach,math.sin(az)*reach,rise))
            def shoot(t):return centre+direction*t+Vector((0,0,.12*math.sin(t*math.pi)-.09*t*t))
            bough('Tree leaf-bearing twig',[(*shoot(0),.011),(*shoot(.50),.006),(*shoot(1),.0015)])
            def attached_leaf(at,phi,t):
                pitch=rng.uniform(-.45,.48)-.20*t
                facing=Vector((math.cos(phi),math.sin(phi),pitch))
                tilt=rng.uniform(-.75,.75)
                normal=Vector((math.cos(phi)*tilt,math.sin(phi)*tilt,1))
                shade=Vector((.08,.19,.040)).lerp(Vector((.29,.43,.105)),rng.uniform(.25,.90))
                length=rng.uniform(.22,.32)*(1-.12*t)
                leaf(origin+at,facing,normal,length,length*rng.uniform(.31,.40),shade)
            for n in range(7):
                t=.12+n*.14
                phi=az+(-1 if n%2 else 1)*rng.uniform(.65,1.20)
                attached_leaf(shoot(t),phi,t)
            # Short laterals break the regular ladder/fern silhouette of a
            # single paired-leaf shoot, filling the crown in three dimensions.
            for lateral in range(3):
                t=.30+lateral*.25;side=-1 if (lateral+spray)%2 else 1
                phi=az+side*rng.uniform(.85,1.25)
                base=shoot(t);extent=rng.uniform(.22,.35)
                tip=base+Vector((math.cos(phi)*extent,math.sin(phi)*extent,rng.uniform(-.07,.14)))
                mid=base.lerp(tip,.5)+Vector((0,0,.025))
                bough('Tree leaf-bearing twig',[(*base,.0045),(*mid,.003),(*tip,.001)])
                for n in range(4):
                    f=.18+n*.25
                    attached_leaf(base.lerp(tip,f),phi+(-1 if n%2 else 1)*.78,f)
    foliage=mesh('Continuous broadleaf crown',vertices,faces,'Canopy')
    tint=foliage.data.color_attributes.new(name='LeafTint',type='FLOAT_COLOR',domain='CORNER')
    for loop in foliage.data.loops: tint.data[loop.index].color=(*pigments[loop.vertex_index],1)
    for face in foliage.data.polygons: face.use_smooth=True
    # Union the weight-bearing forks and root flares into one continuous trunk.
    # The thin leaf-bearing twigs keep their authored diameter and endpoints.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in structure:obj.select_set(True)
    bpy.context.view_layer.objects.active=structure[0];bpy.ops.object.join()
    trunk=structure[0]
    union=trunk.modifiers.new('Grown branch junctions','REMESH')
    union.mode='VOXEL';union.voxel_size=.030;union.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=union.name)
    smooth=trunk.modifiers.new('Soft branch collars','SMOOTH');smooth.factor=.32;smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    tint=trunk.data.color_attributes.get('BarkTint')
    if tint is None:tint=trunk.data.color_attributes.new(name='BarkTint',type='FLOAT_COLOR',domain='CORNER')
    for loop in trunk.data.loops:
        p=trunk.data.vertices[loop.vertex_index].co-origin
        groove=.5*math.sin(math.atan2(p.y,p.x)*11+p.z*.8)
        colour=Vector((.21,.115,.058)).lerp(Vector((.35,.24,.115)),.46+groove*.25)
        tint.data[loop.index].color=(*colour,1)
