"""The cedar box, recessed letter slot and its hardware, in Blender metres."""
import math

import bpy
from mathutils import Matrix


def build_mailbox(material, mesh, cube, rod, curve):
    before = set(bpy.data.objects)
    bottom = 1.20
    front, rear = -.35, .35
    door_face, door_back = -.337, -.304
    slot_height = 1.455
    cedar = 'MailCedar'
    door_cedar = 'MailCedarLight'
    shade = 'Metal'
    material(cedar, (.40, .215, .085), .60)
    material(door_cedar, (.52, .30, .13), .60)
    alternate = material('MailCedarWarm', (.445, .245, .10), .60)

    def profile(radius, base):
        return [(-radius, base), (radius, base)] + [
            (radius * math.cos(i * math.pi / 16), bottom + .20 + radius * math.sin(i * math.pi / 16))
            for i in range(17)
        ]

    def prism(name, cross_section, near, far, mat):
        n = len(cross_section)
        vertices = [(x, y, z) for y in (near, far) for x, z in cross_section]
        faces = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
        faces.extend((i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n))
        return mesh(name, vertices, faces, mat)

    outside = profile(.28, bottom)
    inside = profile(.253, bottom + .024)
    n = len(outside)
    vertices = [(x, y, z) for y in (front, rear) for loop in (outside, inside) for x, z in loop]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.extend([
            (i, i + 2 * n, j + 2 * n, j),  # outer wall
            (i + n, j + n, j + 3 * n, i + 3 * n),  # inner wall
            (i, j, j + n, i + n),  # exposed front rim
            (i + 2 * n, i + 3 * n, j + 3 * n, j + 2 * n),
        ])
    shell = mesh('Mailbox cedar shell', vertices, faces, cedar)
    shell.data.materials.append(alternate)
    for edge in range(2, n - 1):
        outside_wall = shell.data.polygons[edge * 4]
        shell.data.polygons[edge * 4 + 1].use_smooth = True
        outside_wall.use_smooth = True
        outside_wall.material_index = (edge - 2) // 3 % 2
    prism('Mailbox back', profile(.258, bottom + .020), .316, .346, cedar)

    cube('Mailbox base sill', (0, 0, bottom - .015), (.61, .76, .055), 'WoodLight', .012, bevel_segments=1)
    rod('Mailbox post', (0, 0, .30), (0, 0, 1.203), .065, 'WoodLight')
    for side in (-1, 1):
        rod('Mailbox support brace', (0, 0, .91), (0, side * .255, 1.175), .032, 'Wood', vertices=6)

    door = prism('Mailbox cedar door', profile(.246, bottom + .027), door_face, door_back, door_cedar)
    cutter = cube('Mailbox opening tool', (0, -.325, slot_height), (.278, .21, .048), None, 0)
    cut = door.modifiers.new('Through letter slot', 'BOOLEAN')
    cut.operation = 'DIFFERENCE'
    cut.solver = 'EXACT'
    cut.object = cutter
    bpy.ops.object.select_all(action='DESELECT')
    door.select_set(True)
    bpy.context.view_layer.objects.active = door
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

    # A shadowed return behind the opening and a hood deep enough to shed rain.
    cube('Mailbox interior baffle', (0, -.228, slot_height), (.40, .028, .158), 'Dark', .006, bevel_segments=1)
    cube('Mailbox slot hood', (0, -.355, slot_height + .026), (.318, .065, .016), shade, .004, bevel_segments=1)
    cube('Mailbox slot lip', (0, -.340, slot_height - .026), (.300, .034, .013), shade, .003, bevel_segments=1)
    for side in (-1, 1):
        cube('Mailbox slot liner', (side * .141, -.329, slot_height), (.010, .033, .048), shade, .002, bevel_segments=1)

    for x in (-.155, .155):
        rod('Mailbox hinge pin', (x - .050, -.362, 1.233), (x + .050, -.362, 1.233), .013, shade, vertices=10)
        cube('Mailbox hinge door leaf', (x, -.343, 1.253), (.073, .021, .041), shade, .006, bevel_segments=1)
        cube('Mailbox hinge sill leaf', (x, -.368, 1.209), (.072, .036, .046), shade, .005, bevel_segments=1)
    cube('Envelope plaque', (0, -.344, 1.371), (.175, .018, .082), 'PlasterLight', .006, bevel_segments=1)
    for side in (-1, 1):
        curve('Envelope fold', [(side * .071, -.356, 1.397), (0, -.356, 1.365)], .0027, shade)
        rod('Mailbox pull foot', (side * .048, -.353, 1.296), (side * .048, -.326, 1.296), .013, shade, vertices=8)
    curve('Mailbox pull', [(-.048, -.353, 1.296), (-.035, -.386, 1.309),
          (.035, -.386, 1.309), (.048, -.353, 1.296)], .010, shade)

    cube('Mailbox flag bearing', (.281, .028, 1.368), (.032, .089, .108), shade, .008, bevel_segments=1)
    rod('Mailbox flag axle', (.249, .028, 1.368), (.342, .028, 1.368), .021, shade, vertices=12)
    rod('Mailbox flag arm', (.329, .028, 1.365), (.329, .028, 1.874), .017, 'TileLight')
    cube('Mailbox flag plate', (.329, .094, 1.860), (.027, .162, .109), 'TileLight', .006, bevel_segments=1)

    # Turn the box toward the landing while keeping the original post position.
    objects = set(bpy.data.objects) - before
    placement = Matrix.Translation((-3.36, -1.72, 0)) @ Matrix.Rotation(math.radians(-35), 4, 'Z')
    bpy.context.view_layer.update()
    for obj in objects:
        obj.matrix_world = placement @ obj.matrix_world
    bpy.context.view_layer.update()
    return objects
