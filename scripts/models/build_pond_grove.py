"""Author and export three individually shaped trees for the pond's outer bank."""
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from foliage_forms import layered_foliage, pigment, weld_surface


ROOT = Path(__file__).resolve().parents[2]
arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
destination = Path(arguments[0]) if arguments else ROOT / 'public/models/pond-grove.glb'
master = Path(arguments[1]) if len(arguments) > 1 else ROOT / 'scripts/models/pond-grove.blend'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.preferences.filepaths.save_version = 0


def painted_material(name, roughness, two_sided):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = not two_sided
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = roughness
    color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Pigment'
    material.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
    return material


bark = painted_material('Grove bark', .92, False)
leaves = painted_material('Grove foliage', .88, True)
bark_shadow, bark_light = Vector(pigment('494638')), Vector(pigment('89765d'))


def cubic(points, t):
    a, b, c, d = points
    s = 1 - t
    return a * s ** 3 + b * (3 * s * s * t) + c * (3 * s * t * t) + d * t ** 3


def bough(collection, name, controls, radius0, radius1, resolution):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = resolution
    curve.bevel_depth = 1
    curve.bevel_resolution = 1 if radius0 > .025 else 0
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(1)
    start, end = spline.bezier_points
    for point, position, radius in [(start, controls[0], radius0), (end, controls[3], radius1)]:
        point.co = position
        point.radius = radius
        point.handle_left_type = point.handle_right_type = 'FREE'
    start.handle_right, end.handle_left = controls[1:3]
    start.handle_left = start.co * 2 - start.handle_right
    end.handle_right = end.co * 2 - end.handle_left
    object = bpy.data.objects.new(name, curve)
    collection.objects.link(object)
    return object


def crown_mesh(collection, name, parts):
    vertices, faces, pigments = parts
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    colors = mesh.color_attributes.new('Pigment', 'FLOAT_COLOR', 'POINT')
    for entry, shade in zip(colors.data, pigments):
        entry.color = (*shade, 1)
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.materials.append(leaves)
    object = bpy.data.objects.new(name, mesh)
    collection.objects.link(object)
    return object


def grow_tree(name, seed, axis, spread, arms, tones, droop=0):
    rng = random.Random(seed)
    palette = [Vector(pigment(tone)) for tone in tones]
    trunk = [Vector(point) for point in axis]
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    compact_collection = bpy.data.collections.new(name + ' compact foliage')
    collection.children.link(compact_collection)
    parts = [bough(collection, 'Main trunk', trunk, .157 + .040 * spread, .019, 20)]
    crown = []
    for i in range(5):
        a = i * math.tau / 5 + rng.uniform(-.27, .27)
        direction = Vector((math.cos(a), math.sin(a), 0))
        tip = direction * rng.uniform(.40, .65) + Vector((0, 0, -.061))
        controls = [cubic(trunk, .14), direction * .10 + Vector((0, 0, .09)), tip * .69, tip]
        parts.append(bough(collection, 'Root flare', controls, .105, .024, 8))
    for index, (height, tx, ty, tz, radius) in enumerate(arms):
        start = cubic(trunk, height)
        tip = Vector((tx, ty, tz))
        vector = tip - start
        controls = [start, start + vector * .33, tip - vector * .30 + Vector((0, 0, .13)), tip]
        parts.append(bough(collection, 'Scaffold fork', controls, radius, .009, 11))
        for fork, t in enumerate((.57, .83, .99)):
            joint = cubic(controls, t)
            a = math.atan2(vector.y, vector.x) + (-1 if fork % 2 else 1) * rng.uniform(.63, 1.72)
            branch = Vector((math.cos(a), math.sin(a), rng.uniform(-.13, .62))).normalized()
            reach = spread * rng.uniform(.32, .65) * (1.10 - fork * .12)
            end = joint + branch * reach - Vector((0, 0, droop * (.36 + .23 * fork)))
            bow = Vector((0, 0, .13 + .10 * (fork % 2)))
            secondary = [joint, joint + branch * reach * .29, end - branch * reach * .27 + bow, end]
            parts.append(bough(collection, 'Secondary branch', secondary, .029 - fork * .004, .003, 7))
            width = spread * rng.uniform(.65, .87)
            shade = palette[(index + fork) % len(palette)].lerp(palette[2], .23 + rng.uniform(.06, .19))
            center = joint.lerp(end, .69) + Vector((0, 0, .13 + width * .12))
            radii = (width * 1.13, width * .98, width * (.63 + .10 * math.sin(index + fork)) + droop * .17)
            crown.append((center, radii, shade, a))
            if droop and fork != 0:
                fringe = center.lerp(end, .68) - Vector((0, 0, droop * .52))
                crown.append((fringe, (width * .57, width * .62, width * .63), shade, a + .7))
    canopy = crown_mesh(collection, 'Layered canopy', layered_foliage(crown))
    compact = crown_mesh(compact_collection, 'Compact canopy', layered_foliage(crown, compact=True))
    return name, parts, canopy, compact


trees = [
    grow_tree('GroveLeaning', 2901, [(0, 0, -.12), (-.52, .12, .97), (-.67, .34, 2.05), (-.36, .38, 3.62)], .86,
              [(.38, -1.59, -.38, 1.92, .091), (.49, .70, -.53, 2.38, .073), (.57, -.96, .99, 2.52, .070),
               (.62, -.21, -1.11, 2.65, .060), (.70, -1.30, -.56, 3.05, .048), (.78, .47, .68, 3.15, .038),
               (.88, -.45, .28, 3.59, .028)], ['426452', '537a55', '729061', '9dae71']),
    grow_tree('GroveUpright', 2973, [(0, 0, -.12), (.19, -.11, .99), (-.23, .26, 2.63), (.25, .17, 3.92)], .68,
              [(.43, -.79, .37, 2.34, .078), (.55, .76, -.45, 2.65, .066), (.65, .13, .70, 2.95, .051),
               (.69, -.66, -.43, 3.14, .049), (.79, .65, -.37, 3.50, .037), (.89, .25, .12, 3.93, .027)],
              ['4c6853', '65845c', '819664', 'a6ad76']),
    grow_tree('GroveSpreading', 3037, [(0, 0, -.12), (.27, -.15, .81), (.02, .29, 1.87), (.35, -.05, 3.15)], 1.04,
              [(.40, -1.56, -.05, 1.78, .092), (.47, 1.65, .30, 2.13, .086), (.53, .17, -1.00, 2.27, .071),
               (.58, -.84, 1.03, 2.37, .057), (.68, -.99, -.52, 2.61, .049), (.75, 1.13, .78, 2.69, .043),
               (.84, .33, .10, 3.22, .032)], ['3e6454', '507b61', '6f8e65', '97a975']),
    grow_tree('GroveWillow', 3577, [(0, 0, -.12), (-.08, .06, .82), (.40, .16, 1.90), (.14, -.09, 2.93)], .91,
              [(.41, -1.58, -.29, 1.91, .087), (.49, 1.53, -.22, 2.06, .083), (.57, -.49, .93, 2.37, .066),
               (.64, .32, -.81, 2.42, .062), (.71, 1.05, .66, 2.65, .045), (.80, -.71, -.29, 2.74, .039),
               (.88, .25, .12, 3.09, .031)], ['416c58', '5a815f', '75976a', '9aa978'], droop=.36),
]


def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = objects[0]
    for object in objects:
        object.select_set(True)
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


master.parent.mkdir(parents=True, exist_ok=True)
compact_collections = [bpy.data.collections[name + ' compact foliage'] for name, *_ in trees]
for collection in compact_collections:
    collection.hide_viewport = collection.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=str(master))
for collection in compact_collections:
    collection.hide_viewport = collection.hide_render = False
bpy.context.view_layer.update()
for name, branches, canopy, compact_canopy in trees:
    collection = bpy.data.collections[name]
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = branches[0]
    for branch in branches:
        branch.select_set(True)
    bpy.ops.object.convert(target='MESH')
    stems, twigs = [], []
    for branch in bpy.context.selected_objects:
        (twigs if branch.name.startswith('Secondary branch') else stems).append(branch)
    trunk = join(stems, 'Joined trunk')
    weld_surface(trunk, .045, simplify=.58)
    wood = join([trunk] + twigs, name + '_Bark')
    wood.data.materials.append(bark)
    colors = wood.data.color_attributes.new('Pigment', 'FLOAT_COLOR', 'POINT')
    for vertex, entry in zip(wood.data.vertices, colors.data):
        p = vertex.co
        grain = math.sin(p.x * 17 + p.z * 2.7 + math.sin(p.y * 19))
        shade = bark_shadow.lerp(bark_light, .40 + .12 * grain + max(0, p.z) * .065)
        entry.color = (*shade, 1)
    for face in wood.data.polygons:
        face.use_smooth = True
    canopy.name = name + '_Foliage'
    compact_canopy.name = name + '_CompactFoliage'
    root = bpy.data.objects.new(name, None)
    collection.objects.link(root)
    wood.parent = canopy.parent = compact_canopy.parent = root
    print(name, sum(len(object.data.polygons) for object in [wood, canopy]), 'full polygons,',
          len(compact_canopy.data.polygons), 'compact canopy faces')

destination.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', export_materials='EXPORT')
