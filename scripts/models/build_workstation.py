"""Author the tabletop props around the finished workbench."""
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def append_rectangular_solid(vertices, faces, tiers):
    first = len(vertices)
    for x, y, z, half_width, half_depth in tiers:
        vertices.extend([(x - half_width, y - half_depth, z), (x + half_width, y - half_depth, z),
                         (x + half_width, y + half_depth, z), (x - half_width, y + half_depth, z)])
    faces.append((first + 3, first + 2, first + 1, first))
    for level in range(len(tiers) - 1):
        lower = first + level * 4
        for side in range(4):
            a, b = lower + side, lower + (side + 1) % 4
            faces.append((a, b, b + 4, a + 4))
    upper = len(vertices) - 4
    faces.append(tuple(range(upper, upper + 4)))


def build_monitor(x, y, surface, material, mesh, cube, rod):
    cube('Monitor foot', (x, y + .135, surface + .015), (.33, .26, .033), 'Dark', .014, bevel_segments=2)
    cube('Monitor stand plate', (x, y + .145, surface + .038), (.235, .176, .018), 'Metal', .007, bevel_segments=1)
    screen_center = Vector((x, y + .16, surface + .52))
    tilt = -.35
    screen_tilt = (tilt, 0, 0)
    frame_to_world = Matrix.Rotation(tilt, 3, 'X')

    def screen_point(dx, dy, dz):
        return screen_center + frame_to_world @ Vector((dx, dy, dz))

    cube('Monitor housing', screen_point(0, .017, 0), (1.033, .083, .716), 'Dark', .031, screen_tilt, 2)
    cube('Monitor frame', screen_point(0, -.024, 0), (1.012, .022, .692), 'Metal', .020, screen_tilt, 2)
    cube('Monitor screen gasket', screen_point(0, -.036, 0), (.964, .007, .645), 'Dark', .009, screen_tilt, 1)
    cube('Monitor rear mount', screen_point(0, .067, -.142), (.169, .048, .138), 'Dark', .010, screen_tilt, 1)
    pivot = screen_point(0, .103, -.142)
    rod('Monitor pivot', pivot - Vector((.076, 0, 0)), pivot + Vector((.076, 0, 0)), .027, 'Metal', vertices=12)
    vertices, faces = [], []
    append_rectangular_solid(vertices, faces, [
        (x, y + .169, surface + .041, .067, .047),
        (x, y + .186, surface + .125, .046, .036),
        (x, pivot.y, pivot.z + .012, .040, .029),
    ])
    mesh('Monitor neck', vertices, faces, 'Metal')

    # Preserve the packed Octocat reference and compensate for the runtime island stretch.
    display_material = material('GitHubDisplay', (1, 1, 1), .55)
    display_material.use_backface_culling = True
    nodes = display_material.node_tree.nodes
    image_node = nodes.new('ShaderNodeTexImage')
    image_node.image = bpy.data.images.load(str(Path(__file__).with_name('textures') / 'github-mark-reference.png'))
    image_node.image.pack()
    image_node.extension = 'EXTEND'
    display_material.node_tree.links.new(image_node.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
    screen_corners = [(-.47, -.041, -.31), (.47, -.041, -.31), (.47, -.041, .31), (-.47, -.041, .31)]
    display = mesh('Octocat screen', screen_corners, [(0, 1, 2, 3)], 'GitHubDisplay')
    display.location = screen_center
    display.rotation_euler = screen_tilt
    uv = display.data.uv_layers.new(name='LogoUV')
    u_center = 35.5 / 63
    v_center = 1 - 35.5 / 78
    v_span = 55 / 78
    screen_stretch = math.hypot(math.sin(tilt) * .70, math.cos(tilt) * .82) / .70
    u_span = (.94 / .62) * 55 / 63 / screen_stretch
    for loop, (u, v) in zip(display.data.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop.index].uv = (u_center + (u - .5) * u_span, v_center + (v - .5) * v_span)


def build_keyboard(x, y, surface, material, mesh, cube):
    cube('Keyboard base', (x, y, surface + .0165), (.68, .235, .035), 'Dark', .013, bevel_segments=2)
    cube('Keyboard rim', (x, y, surface + .0345), (.643, .208, .013), 'Metal', .008, bevel_segments=1)
    cube('Keyboard switch bed', (x, y, surface + .0435), (.612, .183, .009), 'Dark', .006, bevel_segments=1)
    material('DeskKeyIvory', (.46, .46, .36), .72)
    material('DeskKeySage', (.19, .28, .22), .80)
    material('DeskKeyCedar', (.44, .20, .105), .76)
    batches = {tone: ([], []) for tone in ('DeskKeyIvory', 'DeskKeySage', 'DeskKeyCedar')}
    rows = [([1] * 12, .069), ([1.5] + [1] * 9 + [1.5], .022),
            ([1.8] + [1] * 8 + [2.2], -.025), ([1.5, 1.25, 5.75, 1.25, 1.25, 1], -.072)]
    pitch = .048
    for row, (widths, offset) in enumerate(rows):
        cursor = x - sum(widths) * pitch / 2
        top = surface + .064 + offset * .055
        for column, units in enumerate(widths):
            width = units * pitch
            center = cursor + width / 2
            modifier = column in (0, len(widths) - 1) or (row == 3 and column != 2)
            tone = 'DeskKeySage' if modifier else 'DeskKeyIvory'
            if (row, column) == (0, 0):
                tone = 'DeskKeyCedar'
            half_width = (width - .004) / 2
            vertices, faces = batches[tone]
            append_rectangular_solid(vertices, faces, [
                (center, y + offset, surface + .0445, half_width, .0195),
                (center, y + offset, top - .004, half_width, .0195),
                (center, y + offset, top, half_width - .0035, .016),
            ])
            cursor += width
    for tone, (vertices, faces) in batches.items():
        mesh('Keyboard keycaps ' + tone.removeprefix('DeskKey').lower(), vertices, faces, tone)


def build_workstation(desktop, material, mesh, cube, rod, curve, vessel):
    bpy.context.view_layer.update()
    table = desktop.matrix_world
    x, y = table.translation.xy
    surface = max((table @ vertex.co).z for vertex in desktop.data.vertices)
    build_monitor(x - .06, y, surface, material, mesh, cube, rod)
    build_keyboard(x - .06, y - .18, surface, material, mesh, cube)

    pencil_z = surface + .0048
    rod('Desk pencil', (x - .575, y - .310, pencil_z), (x - .365, y - .309, pencil_z), .007, 'WoodLight', tip=.0065, vertices=8)
    cup_x, cup_y, cup_base = x + .45, y - .19, surface - .0015
    vessel('Open ceramic mug', (cup_x, cup_y, cup_base), .073, .15, 'PlasterLight', bottom=.85, wall=.012)
    rod('Tea surface', (cup_x, cup_y, cup_base + .114), (cup_x, cup_y, cup_base + .118), .058, 'Wood', vertices=16)
    handle = [(cup_x + .063 + math.sin(i / 12 * math.pi) * .060, cup_y,
               cup_base + .075 + math.cos(i / 12 * math.pi) * .048) for i in range(13)]
    curve('Mug handle', handle, .012, 'PlasterLight')
