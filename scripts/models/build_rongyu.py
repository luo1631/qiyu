"""The peach-tree pavilion on Rongyu Island, authored in metres with Z up.

The supplied three-quarter concept fixes the relative silhouettes and materials.
The hexagonal plan, north face, and dimensions are inferred. A compact
roof and plinth give the tree room to arch above a human-scale opening.
"""

import math

import bpy
from mathutils import Vector

from foliage_forms import layered_foliage, pigment, weld_surface


def build_rongyu(origin, bank_height, materials, material, mesh, cube, rod, curve, ball, vessel, plant):
    ox, oy = origin
    cx, cy = ox + .96, oy + .075
    doorway = math.radians(-72)  # Turn the entrance from the front toward the east landing.
    pavilion_start = set(bpy.data.objects)
    ground_level, floor_level, eave_level = .32, .654, 2.91
    pavilion_scale, post_scale, roof_scale = .80, .92, .61

    def height_after_scale(height):
        floor = ground_level + (floor_level - ground_level) * pavilion_scale
        if height <= floor_level:
            return ground_level + (height - ground_level) * pavilion_scale
        if height <= eave_level:
            return floor + (height - floor_level) * post_scale
        return floor + (eave_level - floor_level) * post_scale + (height - eave_level) * roof_scale

    def pavilion_ground(x, y):
        ground = bank_height(cx + (x - cx) * pavilion_scale, cy + (y - cy) * pavilion_scale)
        return ground_level + (ground - ground_level) / pavilion_scale
    for name, color in {
        'PavilionStone': 'a5a89b', 'PavilionStep': 'c3bdac', 'PavilionFloor': '8d8170',
        'PavilionTimber': '784c34', 'PavilionTrim': 'a5744a', 'PavilionFascia': '3c494c',
        'PavilionTiles': '657579', 'PavilionLanternFrame': '796346', 'TreeBark': '76604a',
        'PeachBlossom': 'ffffff', 'PeachPetal': 'f1adae', 'PeachStamen': 'c88759',
    }.items():
        material(name, pigment(color), .86)
    material('PavilionLantern', pigment('efbd78'), .67, .40)

    def batch(name, vertices, faces, colors, mat):
        obj = mesh(name, vertices, faces, mat)
        data = obj.data.color_attributes.new('GardenPigment', 'FLOAT_COLOR', 'POINT')
        for entry, color in zip(data.data, colors):
            entry.color = (*color, 1)
        nodes = materials[mat].node_tree.nodes
        vertex_color = nodes.get('Garden pigment')
        if vertex_color is None:
            vertex_color = nodes.new('ShaderNodeVertexColor')
            vertex_color.name = 'Garden pigment'
            vertex_color.layer_name = 'GardenPigment'
            materials[mat].node_tree.links.new(vertex_color.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
        for poly in obj.data.polygons:
            poly.use_smooth = True
        return obj

    def ring_point(index, radius, z):
        a = doorway - math.pi / 6 + index * math.tau / 6
        return Vector((cx + math.cos(a) * radius, cy + math.sin(a) * radius, z))

    def solid_hex(name, levels, mat):
        verts = [ring_point(i, r, z) for r, z in levels for i in range(6)]
        faces = [(5, 4, 3, 2, 1, 0)]
        for row in range(len(levels) - 1):
            for i in range(6):
                a, b = row * 6 + i, row * 6 + (i + 1) % 6
                faces.append((a, b, b + 6, a + 6))
        faces.append(tuple(range(len(verts) - 6, len(verts))))
        mesh(name, verts, faces, mat)

    toe_radius = 1.52
    foundation = min(pavilion_ground(*ring_point(i, toe_radius, 0)[:2]) for i in range(6)) - .06
    solid_hex('Pavilion foundation', [(toe_radius, foundation), (toe_radius, .46), (1.47, .50)], 'PavilionStone')
    solid_hex('Pavilion cap', [(1.46, .50), (1.48, .53), (1.47, .605), (1.43, .635)], 'PavilionStep')
    solid_hex('Pavilion floor', [(1.36, .631), (1.36, .654)], 'PavilionFloor')

    nx, ny = math.cos(doorway), math.sin(doorway)
    for index, (reach, top) in enumerate(((1.32, .55), (1.50, .451), (1.68, .352))):
        x, y = cx + nx * reach, cy + ny * reach
        width = 1.11 + .09 * index
        base = min(pavilion_ground(x + nx * depth - ny * offset, y + ny * depth + nx * offset)
                   for depth in (-.12, .12) for offset in (-width / 2, width / 2)) - .045
        cube('Pavilion entrance tread', (x, y, (top + base) * .5), (.29, width, top - base),
             'PavilionStep', .018, (0, 0, doorway), bevel_segments=1)

    posts = [ring_point(i, 1.255, .654) for i in range(6)]
    for i, base in enumerate(posts):
        x, y, _ = base
        rod('Column stone shoe', (x, y, .647), (x, y, .76), .134, 'PavilionStone', tip=.115, vertices=10)
        rod('Cedar column', (x, y, .733), (x, y, 2.93), .094, 'PavilionTimber', tip=.079, vertices=10)
        for h, w in ((.803, .197), (2.815, .226), (2.908, .307)):
            cube('Column collar', (x, y, h), (w, w, .066), 'PavilionTrim', .011, bevel_segments=1)
        other = posts[(i + 1) % 6]
        across = (other - base).normalized()
        mid = base.lerp(other, .5)
        yaw = math.atan2(across.y, across.x)
        cube('Open pavilion lintel', (*mid[:2], 2.874), (1.34, .143, .13), 'PavilionTimber', .012, (0, 0, yaw), bevel_segments=1)
        for t in (.11, .89):
            a, b = base.lerp(other, t), base.lerp(other, t * .69 + .155)
            curve('Curved cedar bracket', [(*a[:2], 2.63), (*a.lerp(b, .42)[:2], 2.74), (*b[:2], 2.81)],
                  .047, 'PavilionTrim')
        if i == 0:
            continue
        for height, section in ((.82, .047), (1.24, .081)):
            cube('Pavilion railing rail', (*mid[:2], height), (1.13, section, section),
                 'PavilionTrim', .009, (0, 0, yaw), bevel_segments=1)
        for j in range(1, 6):
            slat = base.lerp(other, j / 6)
            cube('Railing stile', (*slat[:2], 1.025), (.044, .045, .40), 'PavilionTimber', .004, (0, 0, yaw), bevel_segments=1)

    def eave(side, u, t):
        point = ring_point(side, 1.73, 0).lerp(ring_point(side + 1, 1.73, 0), u)
        corner = abs(2 * u - 1)
        height = 2.91 + 1.15 * (1 - t)**1.62 + .281 * corner**4 * t**3
        return (cx + (point.x - cx) * t, cy + (point.y - cy) * t, height)

    # The roof tiles run down the pitch. A shallow rolled profile reads in
    # the close camera while the six hips and upturned corners carry the icon.
    tile_color = pigment('657376')
    verts, faces, colors = [], [], []
    divisions, pitch_rows = 36, 11
    roof_radii = [.063 + .937 * i / pitch_rows for i in range(pitch_rows + 1)]
    for side in range(6):
        start = len(verts)
        for ri, t in enumerate(roof_radii):
            for column in range(divisions + 1):
                u = column / divisions
                x, y, z = eave(side, u, t)
                barrel = .5 + .5 * math.cos(math.tau * u * 9)
                verts.append((x, y, z + .038 * t * barrel**2))
                value = .82 + barrel * .18 + math.sin(u * 38 + side * 1.13 + t * 5) * .035
                colors.append(tuple(channel * value for channel in tile_color))
                if ri and column:
                    a = start + (ri - 1) * (divisions + 1) + column - 1
                    b = a + divisions + 1
                    faces.append((a, b, b + 1, a + 1))
        edge = [eave(side, j / 18, 1) for j in range(19)]
        mesh('Deep eave skirt', edge + [(x, y, z - .092) for x, y, z in edge],
             [(j, j + 19, j + 20, j + 1) for j in range(18)], 'PavilionFascia')
        inner = [(x, y, z - .087) for x, y, z in edge]
        inner.append((cx, cy, 3.02))
        mesh('Timber soffit', inner, [(19, j + 1, j) for j in range(18)], 'PavilionTimber')
        curve('Lifted eave bead', edge, .035, 'PavilionFascia')
        curve('Swept hip ridge', [eave(side, 0, t) for t in [.065, .17, .27, .41, .55, .69, .80, .90, 1]],
              .051, 'PavilionFascia')
    batch('Rolled slate tiles', verts, faces, colors, 'PavilionTiles')
    for lower, upper, radius, tip in [(3.998, 4.075, .177, .137), (4.073, 4.144, .121, .081), (4.144, 4.245, .064, .036)]:
        rod('Ridge finial', (cx, cy, lower), (cx, cy, upper), radius, 'PavilionFascia', tip=tip, vertices=12)
    ball('Ridge finial crown', (cx, cy, 4.245), (.071, .071, .063), 'PavilionFascia', segments=12, rings=7)

    # Local pool of warm light comes from the same pane position used in Three.
    rod('Hanging lantern stem', (cx, cy, 2.50), (cx, cy, 2.99), .017, 'PavilionLanternFrame', vertices=8)
    rod('Lantern parchment', (cx, cy, 2.143), (cx, cy, 2.443), .100, 'PavilionLantern', tip=.098, vertices=8)
    for z in (2.135, 2.457):
        rod('Lantern end cap', (cx, cy, z - .031), (cx, cy, z + .031), .130, 'PavilionLanternFrame', vertices=8)
    for i in range(8):
        a = i * math.tau / 8
        x, y = cx + .104 * math.cos(a), cy + .104 * math.sin(a)
        rod('Lantern rib', (x, y, 2.132), (x, y, 2.463), .012, 'PavilionLanternFrame', vertices=6)
    for ox_table in (-.32, .32):
        for oy_table in (-.19, .19):
            rod('Tea table foot', (cx + ox_table, cy + oy_table, .65), (cx + ox_table, cy + oy_table, 1.054),
                .039, 'PavilionTimber', vertices=6)
    cube('Tea table', (cx, cy, 1.073), (.86, .53, .075), 'PavilionTrim', .022)
    vessel('Glazed teapot', (cx - .16, cy, 1.11), .118, .144, 'PavilionFascia')
    rod('Teapot lid', (cx - .16, cy, 1.234), (cx - .16, cy, 1.265), .077, 'PavilionFascia', tip=.053, vertices=12)
    curve('Teapot handle', [(cx - .245 - math.sin(a * math.pi / 8) * .075, cy, 1.15 + a * .013) for a in range(9)], .015, 'PavilionFascia')
    rod('Teapot spout', (cx - .07, cy, 1.17), (cx + .025, cy, 1.241), .039, 'PavilionFascia', tip=.026, vertices=8)
    for dx, dy in ((.16, -.081), (.215, .108)):
        vessel('Small tea bowl', (cx + dx, cy + dy, 1.11), .056, .062, 'PavilionStep')

    bpy.context.view_layer.update()
    for part in set(bpy.data.objects) - pavilion_start:
        transform = part.matrix_world.copy()
        inverse = transform.inverted()
        for vertex in part.data.vertices:
            x, y, z = transform @ vertex.co
            vertex.co = inverse @ Vector((cx + (x - cx) * pavilion_scale, cy + (y - cy) * pavilion_scale, height_after_scale(z)))
        part.data.update()

    tree_scale = 1.3
    root_datum = Vector((-1.36, .60, .28))
    tree_x, tree_y = ox - 1.75, cy
    tree_root = Vector((tree_x, tree_y, bank_height(tree_x, tree_y) - .06))

    def tree_point(position):
        return tree_root + (Vector(position) - root_datum) * tree_scale

    def branch(name, stations, sides=10):
        points = [tree_point(station[:3]) for station in stations]
        vertices, faces, distances = [], [], []
        previous = points[0]
        for i in range(len(points) - 1):
            a, b = points[i], points[i + 1]
            a_tangent = (b - points[max(0, i - 1)]) * .44
            b_tangent = (points[min(len(points) - 1, i + 2)] - a) * .44
            for step in range(4 + (i == len(points) - 2)):
                t = step / 4
                center = (2*t**3 - 3*t*t + 1)*a + (t**3 - 2*t*t + t)*a_tangent + (-2*t**3 + 3*t*t)*b + (t**3 - t*t)*b_tangent
                distances.append((distances[-1] if distances else 0) + (center - previous).length)
                previous = center
                tangent = (6*t*t - 6*t)*a + (3*t*t - 4*t + 1)*a_tangent + (-6*t*t + 6*t)*b + (3*t*t - 2*t)*b_tangent
                across = tangent.cross(Vector((0, 1, 0))).normalized()
                up = tangent.normalized().cross(across)
                radius = tree_scale * (stations[i][3] * (1 - t) + stations[i + 1][3] * t)
                for side in range(sides):
                    angle = side * math.tau / sides
                    grain = .093 * math.cos(angle * 5 + center.z * .68) + .038 * math.sin(angle * 9 - center.z * .46)
                    buttress = .10 * math.cos(angle * 4 + .6) * max(0, 1 - center.z) ** 2
                    size = radius * (1 + grain + buttress)
                    vertices.append(center + size * (across * math.cos(angle) + up * math.sin(angle)))
        for start in range(0, len(vertices) - sides, sides):
            for i in range(sides):
                j = (i + 1) % sides
                faces.append((start + i, start + j, start + sides + j, start + sides + i))
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range(len(vertices) - sides, len(vertices))))
        obj = mesh(name, vertices, faces, 'TreeBark')
        uv = obj.data.uv_layers.new(name='Grain')
        for poly in obj.data.polygons:
            wraps = len(poly.vertices) == 4 and any(v % sides == sides - 1 for v in poly.vertices)
            for loop in poly.loop_indices:
                row, side = divmod(obj.data.loops[loop].vertex_index, sides)
                uv.data[loop].uv = (1 if wraps and side == 0 else side / sides, distances[row])
        for poly in list(obj.data.polygons)[:-2]:
            poly.use_smooth = True
        return obj

    wood = [
        branch('Peach trunk', [(*root_datum, .301), (-1.53, .57, .80, .240), (-1.47, .55, 1.24, .199),
               (-1.27, .59, 1.79, .174), (-1.09, .65, 2.32, .151), (-1.08, .66, 2.69, .117)], 22),
        branch('Peach left scaffold', [(-1.09, .65, 2.55, .132), (-1.19, .63, 2.79, .114),
               (-1.51, .57, 3.00, .095), (-1.98, .42, 3.09, .070),
               (-2.49, .32, 3.19, .045), (-2.93, .28, 3.46, .022)], 16),
        branch('Peach right scaffold', [(-1.09, .66, 2.51, .157), (-.89, .68, 2.75, .141),
               (-.49, .72, 2.97, .121), (.10, .71, 3.09, .099), (.77, .61, 3.21, .079),
               (1.40, .48, 3.43, .050), (2.14, .38, 3.67, .024)], 18),
        branch('Peach left crown branch', [(-1.83, .46, 3.07, .064), (-1.88, .62, 3.25, .049),
               (-1.66, .84, 3.57, .023), (-1.54, .90, 3.78, .015)]),
        branch('Peach right crown branch', [(.39, .67, 3.15, .068), (.50, .84, 3.27, .052),
               (.74, 1.08, 3.53, .032), (.81, 1.16, 3.77, .015)]),
    ]
    for dx, dy in ((-.51, -.10), (.46, -.27), (-.30, .51), (.39, .37), (-.36, -.43)):
        x, y = root_datum.x + dx, root_datum.y + dy
        tip = tree_point((x, y, root_datum.z))
        z = root_datum.z + (bank_height(tip.x, tip.y) - tree_root.z) / tree_scale
        wood.append(branch('Peach exposed root', [(*root_datum.xy, root_datum.z + .35, .128),
             (root_datum.x + dx * .48, root_datum.y + dy * .49, z + .11, .072),
             (root_datum.x + dx * .81, root_datum.y + dy * .82, z + .016, .042), (x, y, z - .041, .023)]))

    bpy.ops.object.select_all(action='DESELECT')
    for part in wood:
        part.select_set(True)
    wood_shell = wood[0]
    bpy.context.view_layer.objects.active = wood_shell
    bpy.ops.object.join()
    # Restore the original along-branch strokes onto the fused fork and roots.
    grain_source = wood_shell.copy()
    grain_source.data = wood_shell.data.copy()
    bpy.context.collection.objects.link(grain_source)
    weld_surface(wood_shell, .037, simplify=.64)
    wood_shell.data.uv_layers.new(name='Grain')
    grain = wood_shell.modifiers.new('Project along-branch grain', 'DATA_TRANSFER')
    grain.object = grain_source
    grain.use_loop_data = True
    grain.data_types_loops = {'UV'}
    grain.loop_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=grain.name)
    for poly in wood_shell.data.polygons:
        poly.use_smooth = True
    grain_mesh = grain_source.data
    bpy.data.objects.remove(grain_source, do_unlink=True)
    bpy.data.meshes.remove(grain_mesh)

    crown = [
        # Warm upper shoulders over a deeper rose middle. The rear lobes fill
        # the canopy between the two scaffold paths in the homepage view.
        ((-2.92, .14, 3.56), (.80, .73, .42), 'ca7f8b'),
        ((-2.26, .32, 3.93), (.98, .86, .53), 'dd9297'),
        ((-1.76, 1.13, 4.15), (.96, .95, .58), 'd78e96'),
        ((-1.07, .88, 4.60), (1.02, 1.01, .67), 'eca9a3'),
        ((-.22, 1.17, 4.46), (1.16, 1.03, .64), 'e39a99'),
        ((.52, .95, 4.25), (1.04, .94, .58), 'df9a9a'),
        ((-.61, .66, 3.94), (1.11, .91, .52), 'c98793'),
        ((-1.68, -.22, 3.95), (.94, .76, .47), 'e2a09e'),
        ((-.48, -.32, 4.09), (.92, .72, .49), 'e8a5a0'),
        ((.65, .01, 3.98), (1.07, .83, .50), 'dc969b'),
        ((1.49, .72, 4.13), (.96, .81, .52), 'e7a69e'),
        ((1.96, .29, 3.84), (.82, .81, .49), 'd88e96'),
        ((2.51, .09, 3.66), (.66, .66, .43), 'd18593'),
    ]
    volumes = [(tree_point((x * 1.06, y, z)), (rx * tree_scale * 1.04, ry * tree_scale, rz * tree_scale),
                pigment(color), .44 + i * 1.61) for i, ((x, y, z), (rx, ry, rz), color) in enumerate(crown)]
    batch('Layered peach canopy', *layered_foliage(volumes, fringe=6, upper=5), 'PeachBlossom')

    # Low flowering undergrowth follows the root side and leaves an open dock path.
    for i, (dx, dy) in enumerate([(-1.04, -.23), (-1.84, -.31), (-1.94, .77), (-1.21, 1.46),
                                  (-.51, 1.54), (-2.28, .30), (.90, 1.23), (-.24, -1.28)]):
        x, y = ox + dx, oy + dy
        z = bank_height(x, y)
        plant((x, y, z), .49 + .07 * (i % 3), 'Leaf', 5)
        for j in range(2 + i % 2):
            angle = j * 2.4 + i
            bx, by, bz = x + .13 * math.cos(angle), y + .13 * math.sin(angle), z + .11 + .038 * j
            for k in range(5):
                a = k * math.tau / 5 + angle
                petal = ball('Low peach meadow flower', (bx + .041 * math.cos(a), by + .041 * math.sin(a), bz),
                             (.038, .028, .012), 'PeachPetal', segments=7, rings=4)
                petal.rotation_euler.z = a
            ball('Warm flower centre', (bx, by, bz + .007), (.022, .022, .014), 'PeachStamen', segments=7, rings=4)
