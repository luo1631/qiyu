"""Author Pond's editable miniature in Blender; no downloaded model assets.

Run: blender --background --factory-startup --python scripts/models/build_scene.py
Blender meters, Z up. glTF exports Y up. Fixed seed keeps the layout repeatable.
"""
import argparse
import bpy
import math
import random
import sys
from pathlib import Path
from mathutils import Matrix, Vector
from mathutils.noise import noise_vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_stone import templates as stone_templates, export_templates
from export_scene import export_asset, island_specs
from foliage_forms import lobe

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('assets', nargs='*', metavar='ASSET')
parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parent)
options = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
output_dir = options.output_dir.resolve()
OUT = output_dir / 'raw'
OUT.mkdir(parents=True, exist_ok=True)
requested = set(options.assets)
unknown=requested-{'pond-boat','pond-character','pond-world','pond-fish'}
if unknown: raise ValueError('Unknown assets: '+str(unknown))
boat_only=bool(requested) and requested <= {'pond-boat','pond-character'}
world_only=requested == {'pond-world'}
selected_assets=requested.copy()
if 'pond-boat' in selected_assets: selected_assets.add('pond-character')
random.seed(41)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = {}


def material(name, color, roughness=.78, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    materials[name] = m
    return m


# Linear color values, exported as PBR materials (no fixed sunlight baked in).
for name, color in {
    'Plaster': (.78, .65, .43), 'PlasterLight': (.9, .78, .57),
    'Wood': (.235, .125, .065), 'WoodLight': (.44, .275, .135),
    'WoodEnd': (.30, .16, .075), 'Door': (.12, .235, .185),
    'Tile': (.48, .15, .064), 'TileLight': (.61, .23, .095),
    'TileDark': (.37, .105, .047), 'Sand': (.46, .40, .25), 'WetSand': (.27, .29, .20),
    'Grass': (.235, .335, .13), 'GrassLight': (.33, .405, .18), 'Leaf': (.16, .29, .11),
    'LeafLight': (.29, .38, .17), 'LeafDark': (.095, .20, .125),
    'Rock': (.30, .32, .27), 'RockLight': (.45, .43, .33),
    'Soil': (.19, .24, .16), 'Pot': (.44, .19, .09),
    'Metal': (.095, .12, .10), 'Dark': (.032, .046, .04),
    'Hull': (.66, .67, .48), 'Skin': (.95, .66, .45),
    'Shirt': (.81, .86, .68), 'Shorts': (.24, .30, .27),
    'Hair': (.51, .59, .49), 'HairLight': (.62, .69, .58),
    'HairShade': (.31, .39, .32), 'HairClip': (.90, .78, .52), 'FaceLine': (.21, .14, .095),
    'Blush': (.71, .37, .25), 'FishGold': (.85, .34, .055),
    'FishCream': (.85, .80, .61), 'Flower': (.94, .82, .55),
}.items():
    roughness = .60 if name in ['Wood','WoodLight','WoodEnd','Door','Pot','Metal'] else .88
    material(name, color, roughness)
material('WindowGlow', (1, .53, .16), .35, .1)
material('LandingGlass', (.60, .48, .32), .43, .08)
material('LandingBronze', (.10, .13, .115), .53).node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value = .24
material('LandingRope', (.30, .22, .12), .94)
landing_wood = material('LandingWood', (1, 1, 1), .86)
landing_color = landing_wood.node_tree.nodes.new('ShaderNodeVertexColor')
landing_color.layer_name = 'TimberTint'
landing_wood.node_tree.links.new(landing_color.outputs['Color'], landing_wood.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
material('Canopy', (1, 1, 1), .72)
leaf_color = materials['Canopy'].node_tree.nodes.new('ShaderNodeVertexColor')
leaf_color.layer_name = 'LeafTint'
materials['Canopy'].node_tree.links.new(leaf_color.outputs['Color'], materials['Canopy'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
material('BankPigment', (1, 1, 1), .88)
bank_color = materials['BankPigment'].node_tree.nodes.new('ShaderNodeVertexColor')
bank_color.layer_name = 'BankTint'
materials['BankPigment'].node_tree.links.new(bank_color.outputs['Color'], materials['BankPigment'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
material('BankStonePigment',(1,1,1),.83)
stone_color=materials['BankStonePigment'].node_tree.nodes.new('ShaderNodeVertexColor')
stone_color.layer_name='StoneTint'
materials['BankStonePigment'].node_tree.links.new(stone_color.outputs['Color'],materials['BankStonePigment'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])


def finish(obj, name, mat, smooth=False):
    obj.name = name
    if mat:
        obj.data.materials.append(materials[mat])
    if smooth and obj.type == 'MESH':
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj


def cube(name, at, size, mat, bevel=.025, rotation=None, bevel_segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = finish(bpy.context.object, name, mat)
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft crafted edges', 'BEVEL')
        mod.width = bevel
        mod.segments = bevel_segments
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    if rotation:
        obj.rotation_euler = rotation
    return obj


def ball(name, at, size, mat, ico=False, smooth=True, segments=16, rings=10):
    if ico:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=at)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=at)
    obj = finish(bpy.context.object, name, mat, smooth)
    obj.scale = size
    return obj


def rod(name, a, b, radius, mat, tip=None, vertices=10):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
                                   radius2=radius if tip is None else tip,
                                   depth=(b-a).length, location=(a+b)*.5)
    obj = finish(bpy.context.object, name, mat, True)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj


def curve(name, points, radius, mat, cyclic=False):
    bpy.ops.object.select_all(action='DESELECT')
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    # Very fine seams/ropes need only a four-sided profile at homepage scale.
    data.bevel_resolution = 0 if radius < .021 else 1
    path = data.splines.new('POLY')
    path.points.add(len(points)-1)
    for p, co in zip(path.points, points):
        p.co = (*co, 1)
    path.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(materials[mat])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    unique=[]
    seen=set()
    for face in faces:
        key=tuple(sorted(face))
        if key not in seen and len(set(face)) >= 3:
            unique.append(face)
            seen.add(key)
    data.from_pydata(vertices, [], unique)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat)


def vessel(name, at, radius, height, mat, bottom=.77, wall=.018):
    """A real open ceramic rim and inner wall, readable from the pond's high camera."""
    x,y,z=at
    rings=[(radius*bottom,0),(radius,height*.86),(radius,height),
           (radius-wall,height),(radius-wall,height*.82),(radius*bottom-wall,.025)]
    sides=12
    vertices=[(x+math.cos(i/sides*math.tau)*r,y+math.sin(i/sides*math.tau)*r,z+h)
              for r,h in rings for i in range(sides)]
    faces=[]
    for row in range(len(rings)-1):
        for i in range(sides):
            a,b=row*sides+i,row*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(5*sides,6*sides)))
    obj=mesh(name,vertices,faces,mat)
    for face in obj.data.polygons:
        face.use_smooth=True
    return obj


def plant(at, scale=1, mat='Leaf', count=5):
    x, y, z = at
    tuft = ([], [], [])
    for i in range(count):
        a = i * math.tau/count + random.uniform(-.25, .25)
        h = random.uniform(.073, .145)*scale
        reach = (.064+.029*(i%3))*scale
        lobe(tuft, (x+math.cos(a)*reach, y+math.sin(a)*reach, z+h-.023*scale),
             ((.164-.018*(i%3))*scale, .13*scale, h), (1, 1, 1), a, sides=10, rows=4)
    foliage = mesh('Rooted foliage clump', tuft[0], tuft[1], mat)
    for poly in foliage.data.polygons:
        poly.use_smooth = True


def bank_stone(name, at, size, seed):
    obj=bpy.data.objects.new(name,stone_templates()[int(seed)%3].copy())
    bpy.context.collection.objects.link(obj);obj.location=at;obj.scale=size
    obj.data.materials.append(materials['BankStonePigment'])
    return obj


def shore_outline(angle, phase):
    """The original bank remains the datum at the dock approach."""
    outline=max(.77,min(.99,.885+.068*math.sin(angle*2+phase)+.052*math.cos(angle*3-phase)+.027*math.sin(angle*5+.7*phase)))
    return max(outline,.925-.22*math.sin(angle)**2)


# Bearing, extent of the arc, radial change, rise, and sand-band change.
shore_features = {
    'about': ((-2.31, .61, .135, -.045, .115), (-.95, .35, -.24, -.088, .04),
              (1.64, .72, .055, .014, -.08)),
    'github': ((2.20, .67, .08, .059, -.10), (-1.15, .47, -.19, -.027, .065),
               (-.55, .52, .065, -.02, .025)),
    'email': ((-.74, .58, .09, -.037, .07), (.40, .48, -.20, -.048, -.065),
              (1.70, .60, -.125, .02, -.065)),
}


def eased(value):
    t=max(0,min(1,value))
    return t*t*(3-2*t)


def shore_detail(island, angle):
    """Return the beach and headland controls away from the timber abutment."""
    dock_bearing = math.pi if island == 'email' else 0
    dock_clearance = 1-eased((math.cos(angle-dock_bearing)-.74)/.15)
    # Retain the load-bearing sand immediately below the fixed name board.
    sign_clearance = eased((abs(math.atan2(math.sin(angle+math.pi/2),math.cos(angle+math.pi/2)))-.08)/.19)
    edge, rise, colour = 0, 0, 0
    for bearing, width, expansion, grade, sand in shore_features.get(island, ()):
        difference = math.atan2(math.sin(angle-bearing),math.cos(angle-bearing))
        influence = math.exp(-(difference/width)**2)*dock_clearance
        edge += influence*expansion*sign_clearance
        rise += influence*grade*sign_clearance
        colour += influence*sand
    return edge, rise, colour


def shore_ring_radius(radius, angle, phase, edge_change):
    outline=shore_outline(angle,phase)
    edge=min(.998,outline+edge_change)
    influence=eased((radius-.45)/.31)*(1-eased((radius-1.035)/.38))
    ripple=.92+(outline-.92)*min(1,radius/.73)
    ripple+=(edge-outline)*influence
    submerged=max(0,min(1,(radius-1.02)/.60))
    return radius*(ripple+submerged*(.055*math.sin(angle*3+phase)+.035*math.cos(angle*5-phase*.7)))


def island_ring(name, rx, ry, center=(0, 0), island=None):
    # One continuous bank: no grass disc stacked on a sandy pedestal.
    count=64
    phase=center[0]*.71+center[1]*.39
    # Above-water footprint stays fixed. A submerged apron descends through
    # several slopes and sediment fingers until its last edge is buried in bed.
    levels=[(.20,.335),(.43,.342),(.62,.316),(.73,.258),
            (.84,.155),(.92,.045),(.975,-.10),(1.025,-.29),
            (1.10,-.56),(1.22,-.85),(1.38,-1.14),(1.58,-1.56),(1.78,-1.86)]
    vertices=[(center[0],center[1],.338)]
    shades=[Vector((.32,.405,.14))]
    meadow=Vector((.32,.405,.14)); sand=Vector((.62,.51,.32)); wet=Vector((.21,.29,.235))
    angles=[i/count*math.tau for i in range(count)]
    features=[shore_detail(island,a) for a in angles]
    for radius,height in levels:
        for a,(edge,grade,sand_width) in zip(angles,features):
            underwater=max(0,min(1,(radius-1.02)/.60))
            r=shore_ring_radius(radius,a,phase,edge)
            x=center[0]+rx*math.cos(a)*r
            y=center[1]+ry*math.sin(a)*r
            inlet=(.5+.5*math.sin(a*2+phase))*.053*math.sin(min(radius,1)*math.pi)
            mound=.048*math.sin(a+phase)*math.sin(min(radius,1)*math.pi)
            # Small rooted hummocks interrupt the smooth platter surface;
            # the central support and the waterline stay at their old heights.
            hummock=.035*math.sin(a*4+phase+radius*2)*math.sin(min(radius,1)*math.pi)**2
            h=height+.017*math.sin(a*3+phase)*min(radius,1)-inlet+mound+hummock
            h+=grade*eased((radius-.45)/.31)*(1-eased((radius-.94)/.30))
            h+=underwater*.065*math.sin(a*4+phase+radius*3)
            vertices.append((x,y,h))
            beach=eased((radius-.62+sand_width+.075*math.sin(a*3+phase)+.025*math.cos(a*5))/.27)
            pigment=meadow.lerp(sand,beach)
            damp=max(0,min(1,(.13-h)/.32)); damp=damp*damp*(3-2*damp)
            pigment= pigment.lerp(wet,damp)
            sediment=max(0,min(1,(radius-1.12)/.48))
            pigment=pigment.lerp(Vector((.34,.37,.245)),sediment*.70)
            pigment*=.98+.045*math.sin(x*3.7+y*2.1)+.022*math.sin(x*9-y*5)
            shades.append(pigment)
    faces=[(0,i+1,(i+1)%count+1) for i in range(count)]
    for ring in range(len(levels)-1):
        for i in range(count):
            a=1+ring*count+i; b=1+ring*count+(i+1)%count
            faces.append((a,a+count,b+count,b))
    obj=mesh(name,vertices,faces,'BankPigment')
    tint=obj.data.color_attributes.new(name='BankTint',type='FLOAT_COLOR',domain='CORNER')
    for loop in obj.data.loops: tint.data[loop.index].color=(*shades[loop.vertex_index],1)
    for face in obj.data.polygons: face.use_smooth=True
    return obj


def bank_height(bank, x, y):
    hit,point,_,_=bank.ray_cast((x,y,1.6),(0,0,-1))
    if not hit:
        raise ValueError(f'Missing bank beneath {x:.3f}, {y:.3f}')
    return point.z


def seat_support(obj, bank):
    # Stretch the lower end into the slope while keeping the mortise and top fixed.
    to_world=obj.matrix_world.copy()
    to_local=to_world.inverted()
    points=[to_world@vertex.co for vertex in obj.data.vertices]
    bottom=min(point.z for point in points)
    floor=min(bank_height(bank,point.x,point.y) for point in points if point.z<=bottom+.024)
    change=min(0,floor-bottom-.024-.014)
    for vertex,point in zip(obj.data.vertices,points):
        point.z+=change*(1-eased((point.z-bottom-.024)/.12))
        vertex.co=to_local@point
    obj.data.update()


def landing(x, y, rx, side, island):
    """A short timber trestle with the lamp bolted to its water-side pile."""
    edge = rx * .80
    center = y - .19
    width = .82 if island == 'email' else .93
    lamp_x, lamp_y = x + side * (edge + .60), center - width * .39
    bronze, wood = 'LandingBronze', 'LandingWood'

    def tint(obj, color, weather=False):
        colors = obj.data.color_attributes.new(name='TimberTint', type='FLOAT_COLOR', domain='POINT')
        grain = 0 if island == 'email' else 1.4
        for vertex in obj.data.vertices:
            px, py, pz = obj.matrix_world @ vertex.co
            tone = .94 + .06 * math.sin(py * 12 + px * 6 + grain)
            if weather:
                dry = max(0, min(1, (pz - .02) / .18))
                tone *= .58 + .42 * dry
            colors.data[vertex.index].color = (*(c * tone for c in color), 1)
        return obj

    # Crossheads meet four driven piles. The stretchers touch the tread bottoms;
    # the nearest treads extend onto the sandy shoulder of the bank.
    for span, top in [(-.035, .22), (.60, .24)]:
        px = x + side * (edge + span)
        for sign in [-1, 1]:
            py = center + sign * width * .39
            cap = .53 if span > 0 and sign < 0 else .35 if span > 0 else top
            rings = [(-1.12, .083), (-.07, .080), (.11, .079), (cap - .016, .072), (cap, .063)]
            count = 8
            points = [(px + radius * math.cos(a * math.tau / count),
                       py + radius * math.sin(a * math.tau / count), z)
                      for z, radius in rings for a in range(count)]
            faces = [(r * count + a, r * count + (a + 1) % count,
                      (r + 1) * count + (a + 1) % count, (r + 1) * count + a)
                     for r in range(len(rings) - 1) for a in range(count)]
            faces.extend([tuple(reversed(range(count))), tuple(range(len(points) - count, len(points)))])
            post = mesh('Driven landing pile', points, faces, wood)
            for face in list(post.data.polygons)[:-2]:
                face.use_smooth = True
            tint(post, (.23, .135, .074), weather=True)
        tint(cube('Crosshead', (px, center, .186), (.128, width * .95, .10), wood, .009, bevel_segments=1), (.23, .139, .076))
    for sign in [-1, 1]:
        py = center + sign * width * .285
        tint(cube('Longitudinal dock beam', (x + side * (edge + .28), py, .228),
                  (.86, .096, .093), wood, .010, bevel_segments=1), (.25, .154, .089))

    colors = [(.34, .255, .166), (.39, .30, .21), (.32, .247, .174), (.40, .295, .185), (.35, .27, .195)]
    for i, color in enumerate(colors):
        px = x + side * (edge - .085 + i * .178)
        py = center + [-.009, .018, -.011, .006, 0][i]
        tint(cube('Weathered landing board', (px, py, .307),
                  (.166, width + [.016, -.025, .004, .025, -.013][i], .075), wood, .009,
                  (0, 0, (i - 2) * .006 * side), bevel_segments=1), color)
        for sign in [-1, 1]:
            py = center + sign * width * .285
            rod('Square deck nail', (px, py, .341), (px, py, .348), .013, bronze, vertices=4)
    # The raised treads end at a lower threshold sunk into the beach.
    tint(cube('Bank threshold', (x + side * (edge - .25), center, .204),
              (.205, width * .94, .125), wood, .012, bevel_segments=1), (.29, .217, .143))

    # A single hitch on the opposite pile marks the boat-side edge of each landing.
    tie_y = center + width * .39
    binding = [(lamp_x + .079 * math.cos(a * .39), tie_y + .079 * math.sin(a * .39), .310 + a * .0018) for a in range(35)]
    binding.extend([(lamp_x + .105, tie_y + .042, .339), (lamp_x + .092, tie_y + .049, .297)])
    curve('Mooring hitch', binding, .009, 'LandingRope')

    def fixture(name, z, size, mat=bronze, bevel=.005):
        return cube(name, (lamp_x, lamp_y, z), size, mat, bevel, bevel_segments=1)

    fixture('Lamp mounting plate', .539, (.171, .171, .024))
    fixture('Lantern plinth', .570, (.119, .119, .042))
    fixture('Lantern sill', .599, (.232, .215, .024))
    fixture('Lantern pane', .693, (.174, .161, .170), 'LandingGlass', .004)
    for dx in [-.091, .091]:
        for dy in [-.084, .084]:
            cube('Lantern corner stile', (lamp_x + dx, lamp_y + dy, .700),
                 (.021, .021, .201), bronze, .004, bevel_segments=1)
    fixture('Lantern eave', .800, (.263, .247, .023))
    roof = [(lamp_x + dx, lamp_y + dy, h) for half_x, half_y, h in [(.132, .121, .804), (.024, .097, .898)]
            for dx, dy in [(-half_x, -half_y), (half_x, -half_y), (half_x, half_y), (-half_x, half_y)]]
    mesh('Folded lantern hood', roof, [(3, 2, 1, 0), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)], bronze)
    fixture('Lantern ridge', .904, (.064, .205, .019))


world_objects=set()
if not boat_only:
    world_start = set(bpy.data.objects)
    island_ring('Sandy shore', 4.65, 3.0)
    island_ring('Meadow', 4.25, 2.60, (.1,.2))
    # A gently meandering sandy footpath from the dock to the porch.
    mesh('Garden path', [(-2.25,-3,.275),(-1.35,-3,.28),(-.50,-1.6,.365),
                         (.75,-1.5,.365),(.75,-.7,.375),(-.25,-.7,.375),(-1.2,-1.8,.375)],
         [(0,1,2,6),(6,2,3,4,5)], 'Sand')
    for i in range(26):
        a = i/26*math.tau
        if -2.2 < a-math.tau < -1.8:
            continue
        x, y = math.cos(a)*4.38, math.sin(a)*2.84
        if y < -2.3 and x < -.6 and x > -2.8:
            continue
        s = random.uniform(.25,.56)
        obj = ball('Shore stone', (x,y,.17), (s,s*.8,s*.72), 'Rock' if i%3 else 'RockLight', True, False)
        obj.rotation_euler.z = random.random()*6
        if i%3 == 0:
            plant((x*.88,y*.87,.36), .9)
    for i in range(18):
        x,y = random.uniform(-4,4), random.uniform(-2.3,2.2)
        if x > -.45 and y > -1.8:
            continue
        plant((x,y,.35), random.uniform(.4,.8), 'LeafLight' if i%3 else 'LeafDark', 4)


    terrain_objects = set(bpy.data.objects)-world_start


    def window(at, angle=0, width=.72, height=.85):
        # Build facing -Y, then rotate the whole little assembly for side walls.
        before = set(bpy.data.objects)
        x,y,z = at
        cube('Window recess', (x,y,z), (width+.18,.07,height+.17), 'Wood', .025)
        cube('Window glass', (x,y-.045,z), (width,.025,height), 'WindowGlow', .005)
        for dx in [-width/2, 0, width/2]:
            cube('Window mullion', (x+dx,y-.095,z), (.055,.10,height+.10), 'WoodLight', .009)
        for dz in [-height/2, .06, height/2]:
            cube('Window rail', (x,y-.095,z+dz), (width+.10,.10,.055), 'WoodLight', .009)
        cube('Deep window sill', (x,y-.14,z-height/2-.055), (width+.25,.29,.095), 'WoodLight', .018)
        for side in [-1,1]:
            sx=x+side*(width/2+.19)
            cube('Sage wooden shutter',(sx,y-.10,z),(.20,.07,height+.08),'Door',.012)
            for level in range(4):
                cube('Shutter louvre',(sx,y-.143,z-height*.33+level*height*.22),(.17,.022,.065),'LeafDark',0)
        if not angle:
            cube('Window herb box',(x,y-.26,z-height/2-.19),(width+.17,.25,.21),'Wood',.025)
            for index in range(3):
                plant((x+(index-1)*.23,y-.25,z-height/2-.08),.42,'LeafLight',4)
        if angle:
            pivot=Vector(at)
            transform=Matrix.Rotation(angle,4,'Z')
            for obj in set(bpy.data.objects)-before:
                obj.location=pivot+transform.to_3x3()@(obj.location-pivot)
                obj.rotation_euler.z+=angle


    house_start=set(bpy.data.objects)
    cx, cy = 1.1, .45
    cube('Stone footing',(cx,cy,.49),(3.25,2.65,.35),'RockLight',.07)
    cube('Warm plaster walls',(cx,cy,1.73),(3.08,2.48,2.28),'PlasterLight',.035)
    for y in [cy-1.24,cy+1.24]:
        mesh('Plaster gable',[(cx-1.54,y,2.87),(cx+1.54,y,2.87),(cx,y,4.02)],[(0,1,2),(2,1,0)],'PlasterLight')
    for side in [-1,1]:
        slope=math.atan2(1.25,1.82)
        cube('Roof plane',(cx+side*.90,cy,3.48),(2.27,2.97,.12),'TileDark',.025,(0,side*slope,0))
        for row in range(5):
            x=side*(.18+row*.36)
            for col in range(7):
                cube('Broad roof tile',(cx+x,cy-1.27+col*.425,4.20-abs(x)*.687),
                     (.47,.405,.075), ['Tile','TileLight','TileDark'][random.choices(range(3),[6,3,1])[0]],.025,(0,side*slope,0),bevel_segments=1)
    rod('Roof ridge',(cx,cy-1.55,4.14),(cx,cy+1.55,4.14),.10,'TileLight',vertices=12)
    for y in [cy-1.53,cy+1.53]:
        for side in [-1,1]:
            rod('Gable fascia',(cx,y,4.10),(cx+side*1.87,y,2.81),.073,'WoodLight',vertices=4)
    cube('Chimney',(cx+.90,cy+.70,3.94),(.40,.45,1.38),'Plaster',.03)
    cube('Chimney cap',(cx+.90,cy+.70,4.65),(.56,.59,.13),'TileDark',.025)
    cube('Chimney opening',(cx+.90,cy+.70,4.722),(.29,.32,.018),'Dark',.01)
    front=cy-1.27
    cube('Door surround',(cx-.52,front-.02,1.42),(.86,.15,1.76),'WoodLight',.018)
    cube('Sage door',(cx-.52,front-.112,1.39),(.70,.055,1.61),'Door',.025)
    for dz in [1.05,1.69]:
        cube('Door inset',(cx-.52,front-.148,dz),(.52,.022,.48),'LeafDark',.012)
    ball('Brass door knob',(cx-.26,front-.20,1.42),(.035,.035,.035),'WoodLight')
    window((cx+.78,front-.025,1.83),width=.66)
    window((cx+1.56,cy-.25,1.86),math.pi/2,width=.70)
    window((cx+1.56,cy+.78,1.86),math.pi/2,width=.56)
    cube('Attic vent',(cx,front-.035,3.30),(.15,.09,.38),'Wood',.01)
    for i in range(3):
        cube('Entry step',(cx-.5,front-.43-i*.22,.56-i*.095),(1.18,.47,.18),'RockLight',.028)
    for x in [cx-1.40,cx+.22]:
        rod('Porch upright',(x,front-.65,.45),(x,front-.65,2.55),.065,'WoodLight',vertices=6)
        rod('Porch brace',(x,front-.65,2.12),(x+(.3 if x<cx else -.3),front-.65,2.48),.045,'WoodLight',vertices=4)
    cube('Porch roof',(cx-.58,front-.47,2.60),(2.12,1.20,.12),'Tile',.025,(.12,0,0))
    rod('Porch front beam',(cx-1.65,front-1.05,2.51),(cx+.48,front-1.05,2.51),.07,'Wood',vertices=4)
    for x in [cx-1.25,cx+.13,cx+1.55]:
        y=front-.20
        rod('Terracotta pot',(x,y,.38),(x,y,.69),.16,'Pot',tip=.21,vertices=12)
        plant((x,y,.69),.8)
    rod('Lantern bracket',(cx-1.15,front-.1,2.28),(cx-1.15,front-.40,2.28),.026,'Metal')
    cube('Lantern glow',(cx-1.15,front-.4,2.06),(.17,.17,.27),'WindowGlow',.018)
    for dx in [-.10,.10]:
        for dy in [-.10,.10]:
            rod('Lantern frame',(cx-1.15+dx,front-.4+dy,1.90),(cx-1.15+dx,front-.4+dy,2.22),.014,'Metal',vertices=5)
    cube('Lantern cap',(cx-1.15,front-.4,2.24),(.25,.25,.055),'Metal',.02)
    house_objects=set(bpy.data.objects)-house_start

    # Deck, hand-built table, chair and mailbox make destinations spatially recognizable.
    dock_start=set(bpy.data.objects)
    for i in range(11):
        cube('Dock board',(-2.0,-2.25-i*.245,.30),(1.7,.232,.12),'WoodLight' if i%3 else 'WoodEnd',.02)
    for x in [-2.72,-1.28]:
        for y in [-2.45,-4.55]:
            rod('Dock piling',(x,y,-.65),(x,y,.58),.105,'Wood',vertices=10)
            cube('Dock post cap',(x,y,.59),(.23,.23,.07),'WoodLight',.018)
    for x in [-2.60,-1.40]:
        cube('Dock support',(x,-3.5,.17),(.12,2.9,.16),'Wood',.01)
    dock_objects=set(bpy.data.objects)-dock_start
    desk_start=set(bpy.data.objects)
    desktop=cube('Desk top',(-2.35,-.83,1.03),(1.35,.70,.10),'WoodLight',.035)
    for x in [-2.85,-1.85]:
        for y in [-1.08,-.58]:
            rod('Desk leg',(x,y,.34),(x,y,1.01),.045,'Wood')
    for y in [-1.08,-.58]:
        cube('Desk apron',(-2.35,y,.94),(1.10,.065,.12),'Wood',.012,bevel_segments=1)
    for x in [-2.85,-1.85]:
        rod('Desk foot stretcher',(x,-1.08,.48),(x,-.58,.48),.025,'WoodEnd',vertices=6)
    cube('Notebook',(-2.86,-.99,1.10),(.20,.25,.045),'Door',.008,(0,0,.12))
    cube('Notebook paper edge',(-2.86,-.994,1.105),(.18,.23,.025),'Shirt',.004,(0,0,.12))
    cube('Chair seat',(-2.37,-1.51,.69),(.53,.50,.08),'WoodLight',.025)
    for x in [-2.57,-2.17]:
        for y in [-1.70,-1.34]:
            rod('Chair leg',(x,y,.33),(x,y,.68),.035,'Wood')
        rod('Chair back upright',(x,-1.72,.65),(x,-1.72,1.21),.04,'WoodLight')
    for z in [.90,1.12]:
        cube('Chair back',(-2.37,-1.72,z),(.48,.07,.12),'WoodLight',.02)
    for x in [-2.57,-2.17]:
        rod('Chair stretcher',(x,-1.69,.46),(x,-1.34,.46),.022,'WoodEnd',vertices=6)
    desk_objects=set(bpy.data.objects)-desk_start
    from build_mailbox import build_mailbox
    mail_objects=build_mailbox(material,mesh,cube,rod,curve)

    # Only a handful of shallow-water stones; the lake floor itself is rendered separately.
    for x,y,s in [(-4.3,-5.3,.4),(1.8,-5.6,.42),(2.7,-6.1,.56),(4.7,-3.8,.4),(-1.1,-7.1,.3),(0,-5.4,.32)]:
        ball('Underwater stone',(x,y,-1.03),(s,s*.8,s*.6),'Rock',True,False)
    for x,y in [(-4.2,-5.5),(3.4,-5.7),(2.8,-7.1),(-1.2,-7.4),(4.6,-4.3)]:
        plant((x,y,-1.10),.75,'LeafDark',5)
    # These authored instances are content carriers; their count is not a limit.
    # Delete only intermediate generated terrain; no project files are removed.
    for obj in terrain_objects | dock_objects:
        bpy.data.objects.remove(obj, do_unlink=True)


    def relocate(objects, offset, island):
        for obj in objects:
            obj.location += Vector(offset)
            obj['pond_island']=island


    relocate(house_objects,(3.6,3.15,0),'projects')
    relocate(desk_objects,(-2.65,-3.17,0),'github')
    relocate(mail_objects,(8.26,-2.58,0),'email')
    island_banks={}
    for island,x,y,rx,ry in island_specs:
        before=set(bpy.data.objects)
        bank=island_ring('Sandy bank',rx,ry,(x,y),island)
        island_banks[island]=bank
        count=12 if island == 'about' else 9 if island == 'projects' else 6
        shore_phase=x*.71+y*.39
        def on_bank(angle, radius):
            edge,_,_=shore_detail(island,angle)
            r=shore_ring_radius(radius,angle,shore_phase,edge)
            px,py=x+math.cos(angle)*rx*r,y+math.sin(angle)*ry*r
            return px,py,bank_height(bank,px,py)
        for i in range(count):
            a=(i//3)*2.05+shore_phase+(i%3-1)*.22
            # Each pocket has one substantial embedded boulder and two lower
            # companions. Their overhang breaks the bank contour, not the route.
            s=[.27,.48,.32][i%3]*min(1,ry/1.8)
            shore_radius=.87 if i%3==1 else .91
            px,py,pz=on_bank(a,shore_radius)
            rock=bank_stone('Bank stone',(px,py,pz-s*.15),(s,s*(.78 if i%3==1 else 1.08),s*(.86 if i%3==1 else .52)),i+shore_phase)
            rock.rotation_euler.z=a+.45
            if i%3==0:
                for offset in [-.12,.09]:
                    plant(on_bank(a+offset,.69),.80 if offset<0 else .63,'LeafDark' if i%2 else 'Leaf',4)
        # Uneven pockets of narrow grass tie the stones into the soil. Keep
        # the central furniture and inner landing unobstructed.
        for tuft in range(26 if island in ['projects','about'] else 17):
            a=shore_phase+tuft*2.39996
            if abs(math.sin(a))<.27 or (island == 'about' and math.cos(a) > .38 and math.sin(a) < .18): continue
            r=.65+.14*math.sin(tuft*1.9)
            plant(on_bank(a,r),
                  .39+.11*(tuft%3),'Leaf' if tuft%3 else 'LeafLight',5)
        landing(x, y, rx, 1 if x < 0 else -1, island)
        for obj in set(bpy.data.objects)-before:
            obj['pond_island']=island

    before=set(bpy.data.objects)
    from build_rongyu import build_rongyu
    _, x, y, _, _ = next(spec for spec in island_specs if spec[0] == 'about')
    bank = island_banks['about']
    build_rongyu((x, y), lambda px, py: bank_height(bank, px, py), materials,
                 material, mesh, cube, rod, curve, ball, vessel, plant)
    for obj in set(bpy.data.objects)-before:
        obj['pond_island']='about'
    before=set(bpy.data.objects)
    from build_workstation import build_workstation
    build_workstation(desktop,material,mesh,cube,rod,curve,vessel)
    for obj in set(bpy.data.objects)-before:
        obj['pond_island']='github'
    before=set(bpy.data.objects)
    pots = [
        (4.30, -4.50, .173, .269, [(-.040, .025, .304, .047), (.054, -.043, .227, .036)]),
        (5.50, -4.00, .194, .292, [(-.053, -.028, .325, .052), (.067, .049, .231, .040)]),
        (4.70, -3.80, .158, .233, [(-.028, .048, .256, .039), (.055, -.036, .218, 0)]),
    ]
    bank = island_banks['email']
    for x, y, radius, height, flowers in pots:
        foot = .77 * radius
        base = min(bank_height(bank, x + foot * math.cos(i * math.tau / 12), y + foot * math.sin(i * math.tau / 12))
                   for i in range(12)) - .028
        vessel('Mail garden pot', (x, y, base), radius, height, 'Pot')
        soil = base + height - .040
        rod('Mail potting soil', (x, y, soil - .018), (x, y, soil), radius - .021, 'Wood', vertices=12)
        plant((x, y, soil - .008), .46, 'LeafLight')
        for dx, dy, stem_height, petal in flowers:
            top = soil + stem_height
            curve('Mail flower stem', [(x + dx * .36, y + dy * .36, soil - .012),
                  (x + dx * .51, y + dy * .58, top - .093), (x + dx, y + dy, top)], .009, 'LeafDark')
            bx, by = x + dx, y + dy
            if petal == 0:
                ball('Mail garden bud', (bx, by, top + .010), (.023, .021, .039), 'Flower', segments=7, rings=5)
                continue
            for p in range(5):
                a = p * math.tau / 5 + dx * 4
                ball('Flower petal', (bx + math.cos(a) * petal, by + math.sin(a) * petal, top + .007),
                     (petal * .93, petal * .57, petal * .34), 'Flower', segments=7, rings=5).rotation_euler.z = a
            ball('Flower centre', (bx, by, top + .016), (.025, .025, .016), 'TileLight', segments=7, rings=4)
    for obj in set(bpy.data.objects)-before:
        obj['pond_island']='email'
    before=set(bpy.data.objects)
    for x,y,a in [(4.06,1.35,-.12),(3.54,1.46,.17),(3.01,1.76,.30)]:
        cube('Garden stepping stone',(x,y,.345),(.43,.33,.055),'RockLight',.045,(0,0,a))
    for obj in set(bpy.data.objects)-before:
        obj['pond_island']='projects'
    world_objects=set(bpy.data.objects)-world_start
    bpy.context.view_layer.update()
    for obj in world_objects:
        if obj.name.startswith(('Bench leg','Desk leg','Chair leg','Mailbox post')):
            seat_support(obj,island_banks[obj['pond_island']])

# Boat and resting character are authored around their own local origin.
boat_objects, character_objects, person_objects = set(), set(), set()
if not world_only:
    boat_start = set(bpy.data.objects)
    from build_boat import build_boat
    from build_character import build_character
    build_boat(materials,mesh,cube,ball,curve,rod)
    character_objects=build_character(materials,mesh,ball,curve)
    person_objects={obj for obj in character_objects if obj.get('character_subject')=='person' and not obj.get('authoring_only')}
    boat_objects=set(bpy.data.objects)-boat_start

# One reusable fish. Separate tail pivot remains editable/animatable in the browser.
fish_objects=set()
if not boat_only and not world_only:
    fish_start=set(bpy.data.objects)
    ball('FishBody',(0,0,0),(.105,.30,.115),'FishGold',segments=12,rings=8)
    ball('Fish belly',(0,-.035,-.035),(.09,.22,.08),'FishCream',segments=12,rings=8)
    tail=mesh('FishTail',[(0,-.25,0),(-.16,-.47,.06),(0,-.41,-.015),(.16,-.47,.06)],[(0,1,2),(0,2,3),(2,1,0),(3,2,0)],'FishGold')
    for v in tail.data.vertices:
        v.co.y+=.25
    tail.location.y=-.25
    for side in [-1,1]:
        mesh('Pectoral fin',[(side*.07,.02,0),(side*.20,-.10,-.025),(side*.08,-.14,-.03)],[(0,1,2),(2,1,0)],'FishCream')
        ball('Fish eye',(side*.09,.16,.045),(.018,.02,.018),'Dark',segments=8,rings=6)
    mesh('Dorsal fin',[(0,.12,.08),(0,-.11,.23),(0,-.19,.07)],[(0,1,2),(2,1,0)],'FishGold')
    fish_objects=set(bpy.data.objects)-fish_start


# Preserve an editable authoring master before export-only merges and modifier baking.
if not boat_only:export_templates()
for name, objects in [('pond-world', world_objects), ('pond-boat', boat_objects-character_objects), ('pond-fish', fish_objects), ('pond-character', character_objects)]:
    if not objects: continue
    collection=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    # Keep the editable collection and mesh join inputs in a named order.
    for obj in sorted(objects, key=lambda item: item.name):
        for previous in list(obj.users_collection):
            previous.objects.unlink(obj)
        collection.objects.link(obj)
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
master='pond-boat-source.blend' if boat_only else 'pond-world-source.blend' if world_only else 'pond-source.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(output_dir / master))
print('POND_BUILD_SCOPE', 'boat-and-character' if boat_only else 'world' if world_only else 'full-scene', flush=True)

for name,objects in [('pond-world',world_objects),('pond-character',person_objects),('pond-boat',boat_objects),('pond-fish',fish_objects)]:
    if selected_assets and name not in selected_assets:
        continue
    objects = {obj for obj in objects if not obj.get('authoring_only')}
    if name=='pond-character':
        # Export copies before boat assembly so material merges cannot destroy
        # the originals used by the boat. Both files have identical source form.
        copies=[]
        for obj in sorted(objects, key=lambda item: item.name):
            copy=obj.copy();copy.data=obj.data.copy()
            bpy.context.scene.collection.objects.link(copy);copies.append(copy)
        objects=copies
    export_asset(name, objects, OUT/f'{name}.glb', world_only=world_only)
