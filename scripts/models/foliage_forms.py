"""Rounded plant volumes shared by the editable island and shore kits."""

from math import cos, pi, sin, sqrt, tau

import bpy


def lobe(target, center, radii, color, phase, sides=12, rows=6):
    """Add a softly lobed canopy to a batch of vertices, faces and pigments."""
    vertices, faces, pigments = target
    x, y, z = center
    rx, ry, rz = radii
    first = len(vertices)
    vertices.append((x, y, z - rz))
    pigments.append(tuple(value * .76 for value in color))
    for ring in range(1, rows):
        latitude = pi * ring / rows
        rise = -cos(latitude)
        for side in range(sides):
            angle = side * tau / sides
            shape = sin(latitude) * (1 + .13 * cos(angle * 3 + phase) + .075 * sin(angle * 5 - phase + latitude))
            vertices.append((x + rx * shape * cos(angle), y + ry * shape * sin(angle),
                             z + rz * (rise + .07 * sin(angle * 3 + phase) * sin(latitude))))
            tone = .89 + .13 * rise + .045 * cos(angle * 2 + phase + latitude)
            pigments.append(tuple(value * tone for value in color))
    top = len(vertices)
    vertices.append((x, y, z + rz))
    pigments.append(tuple(value * 1.03 for value in color))
    for side in range(sides):
        after = (side + 1) % sides
        faces.append((first, first + 1 + after, first + 1 + side))
        for row in range(rows - 2):
            a = first + 1 + row * sides
            faces.append((a + side, a + after, a + sides + after, a + sides + side))
        a = top - sides
        faces.append((a + side, a + after, top))


def pigment(hexcode):
    rgb = (int(hexcode[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)


def weld_surface(obj, voxel_size, simplify=1):
    """Smooth the junctions of overlapping volumes while retaining their contour."""
    bpy.context.view_layer.objects.active = obj
    weld = obj.modifiers.new('Join overlapping volumes', 'REMESH')
    weld.mode = 'VOXEL'
    weld.voxel_size = voxel_size
    bpy.ops.object.modifier_apply(modifier=weld.name)
    fair = obj.modifiers.new('Smooth the joins', 'SMOOTH')
    fair.factor, fair.iterations = .78, 8
    bpy.ops.object.modifier_apply(modifier=fair.name)
    if simplify < 1:
        cut = obj.modifiers.new('Reduce surface triangles', 'DECIMATE')
        cut.ratio = simplify
        bpy.ops.object.modifier_apply(modifier=cut.name)


def foliage_layer(target, center, radii, color, axis, sides, profile):
    """A scalloped branch-sized layer with a raised back and a drooping lip."""
    vertices, faces, pigments = target
    x, y, z = center
    rx, ry, rz = radii
    along_x, along_y = cos(axis), sin(axis)
    first = len(vertices)
    vertices.append((x, y, z - rz))
    pigments.append(tuple(channel * gain for channel, gain in zip(color, (.53, .64, .75))))
    tips_per_turn = 7 if sides <= 24 else 13
    for span, rise in profile:
        sun = (rise + 1) * .5
        for side in range(sides):
            a = side * tau / sides
            forward = cos(a)
            tips = cos(tips_per_turn * a + .67 * sin(3 * a + axis) - axis * .8)
            scallops = .098 * cos(4 * a + axis) + .061 * sin(7 * a - axis * .7) + .093 * tips
            rim = span * (1 + scallops * span)
            length = rx * (rim * forward - .13 * rise)
            width = ry * rim * sin(a) * (1 + .15 * forward)
            lip = span * (.084 * cos(5 * a + axis) - .24 * forward - .13 * tips * span)
            vertices.append((x + along_x * length - along_y * width,
                             y + along_y * length + along_x * width, z + rz * (rise + lip)))
            lift = (.045 * cos(a * 3 - axis) + .058 * tips * sun) * span
            gains = (.61 + .49 * sun + lift, .71 + .37 * sun + lift, .80 + .24 * sun + lift)
            pigments.append(tuple(min(1, channel * gain) for channel, gain in zip(color, gains)))
    top = len(vertices)
    vertices.append((x - along_x * rx * .13, y - along_y * rx * .13, z + rz))
    pigments.append(tuple(min(1, channel * gain) for channel, gain in zip(color, (1.10, 1.08, 1.04))))
    for side in range(sides):
        after = (side + 1) % sides
        faces.append((first, first + 1 + after, first + 1 + side))
        for row in range(len(profile) - 1):
            a = first + 1 + row * sides
            faces.append((a + side, a + after, a + sides + after, a + sides + side))
        a = top - sides
        faces.append((a + side, a + after, top))


def layered_foliage(forms, *, compact=False, fringe=2, upper=0):
    """Group overlapping branch silhouettes in one mesh, leaving their shaded edges visible."""
    target = ([], [], [])
    profile = [(.61, -.71), (.93, -.36), (1, -.06), (.81, .50), (.42, .85)]
    full = [(.35, -.90), (.67, -.70), (.93, -.38), (1, -.07), (.94, .24), (.74, .56), (.46, .85), (.22, .96)]
    for center, radii, color, axis in forms:
        x, y, z = center
        rx, ry, rz = radii
        foliage_layer(target, center, radii, color, axis, 22 if compact else 52, profile if compact else full)
        for i in range(fringe):
            a = axis - 1.13 + i * tau / fringe + .17 * sin(axis + i * 2.3)
            size = .23 + .13 * (.5 + .5 * sin(axis * 1.7 + i * 4.2))
            reach = .73 + .08 * sin(a * 1.8 - axis)
            drop = -.14 + .24 * cos(i * 2.4 + axis)
            at = x + cos(a) * rx * reach, y + sin(a) * ry * reach, z + rz * drop
            foliage_layer(target, at, (rx * size * 1.18, ry * size, rz * size * 1.02), color, a,
                          14 if compact else 22, profile)
        # Small crowns on the lit shoulder follow the slope of their bough.
        # Their lower halves sit inside the supporting layer.
        for i in range(upper):
            a = axis + i * 2.39996
            reach = .23 + .46 * sqrt((i + .43) / upper)
            width = .27 + .11 * (.5 + .5 * sin(a * 2.1 + i))
            height = .95 - .74 * reach**1.5
            at = x + cos(a) * rx * reach - .08 * rx * cos(axis), y + sin(a) * ry * reach - .08 * rx * sin(axis), z + rz * height
            shade = tuple(min(1, v * gain) for v, gain in zip(color, (1.075, 1.045, 1.014)))
            foliage_layer(target, at, (rx * width * 1.18, ry * width, rz * (.25 + .048 * sin(a + i))),
                          shade, a, 26, profile)
    return target
