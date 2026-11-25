"""Check the slot and load-bearing joins in the editable mailbox assembly."""
import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def geometry(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    faces = [tuple(face.vertices) for face in mesh.polygons]
    evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(points, faces), points


def embedment(points, supports, foot_margin):
    base = min(point.z for point in points)
    offsets = []
    for point in points:
        if point.z > base + foot_margin:
            continue
        origin = Vector((point.x, point.y, 1))
        hits = [surface.ray_cast(origin, Vector((0, 0, -1)), 1)[0] for surface in supports]
        hits = [hit.z for hit in hits if hit is not None]
        assert hits, f'Missing surface below {point}'
        offsets.append(max(hits) - point.z)
    return min(offsets)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blend', type=Path, default=Path(__file__).with_name('pond-world-source.blend'))
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()))
    objects = bpy.data.objects
    shell = objects['Mailbox cedar shell']
    local = shell.matrix_world
    direction = (local.to_3x3() @ Vector((0, 1, 0))).normalized()
    door, _ = geometry(objects['Mailbox cedar door'])
    wall, _ = geometry(shell)
    baffle, _ = geometry(objects['Mailbox interior baffle'])

    def shoot(tree, x, z):
        return tree.ray_cast(local @ Vector((x, -.48, z)), direction, .26)[3]

    depths = []
    for x in (-.105, -.052, 0, .052, .105):
        for z in (1.444, 1.455, 1.466):
            assert shoot(door, x, z) is None, 'Timber fills the letter slot'
            assert shoot(wall, x, z) is None, 'The shell blocks the letter slot'
            depth = shoot(baffle, x, z)
            assert depth is not None and depth - .143 > .08, 'Slot return is too shallow'
            depths.append(depth - .143)
    for x, z in [(-.164, 1.455), (.164, 1.455), (0, 1.413), (0, 1.500)]:
        distance = shoot(door, x, z)
        assert distance is not None and abs(distance - .143) < .001, 'A ray outside the slot misses the front'

    for part in (shell, objects['Mailbox cedar door']):
        topology = bmesh.new()
        topology.from_mesh(part.data)
        assert all(edge.is_manifold for edge in topology.edges), f'Open mesh edge on {part.name}'
        topology.free()

    joints = [
        ('Mailbox cedar shell', 'Mailbox base sill'),
        ('Mailbox base sill', 'Mailbox post'),
        ('Mailbox base sill', 'Mailbox support brace'),
        ('Mailbox base sill', 'Mailbox support brace.001'),
        ('Mailbox cedar shell', 'Mailbox flag bearing'),
        ('Mailbox flag bearing', 'Mailbox flag axle'),
        ('Mailbox flag axle', 'Mailbox flag arm'),
        ('Mailbox flag arm', 'Mailbox flag plate'),
    ]
    for suffix in ('', '.001'):
        joints.extend([
            ('Mailbox cedar door', 'Mailbox hinge door leaf' + suffix),
            ('Mailbox hinge door leaf' + suffix, 'Mailbox hinge pin' + suffix),
            ('Mailbox hinge pin' + suffix, 'Mailbox hinge sill leaf' + suffix),
            ('Mailbox hinge sill leaf' + suffix, 'Mailbox base sill'),
        ])
    names = {part for pair in joints for part in pair}
    snaps = {name: geometry(objects[name])[0] for name in names}
    pairs = {a + ' / ' + b: len(snaps[a].overlap(snaps[b])) for a, b in joints}
    assert all(pairs.values()), f'Open hardware or timber join {pairs}'

    bank = next(obj for obj in objects if obj.name.startswith('Sandy bank') and obj.get('pond_island') == 'email')
    ground, _ = geometry(bank)
    _, post = geometry(objects['Mailbox post'])
    post_in_ground = embedment(post, [ground], .035)
    assert post_in_ground > .010, 'The post floats above the island'
    assert direction.x > .45, 'The door faces away from the west landing'

    pots = [geometry(obj)[1] for obj in objects if obj.name.startswith('Mail garden pot')]
    soil = [geometry(obj)[0] for obj in objects if obj.name.startswith('Mail potting soil')]
    stems = [geometry(obj)[1] for obj in objects if obj.name.startswith('Mail flower stem')]
    assert len(pots) == len(soil) == 3 and len(stems) == 6, 'Missing mailbox garden forms'
    pot_in_ground = min(embedment(pot, [ground], .009) for pot in pots)
    stem_in_soil = min(embedment(stem, soil, .005) for stem in stems)
    assert pot_in_ground > .012 and stem_in_soil > .003, 'A pot or stem lacks support'
    print('MAILBOX_CONTACT', json.dumps({
        'boreSamples': len(depths), 'recessMetres': min(depths), 'intersections': pairs,
        'postEmbedmentMetres': post_in_ground, 'westApproachAlignment': direction.x,
        'potEmbedmentMetres': pot_in_ground, 'stemEmbedmentMetres': stem_in_soil,
    }), flush=True)


if __name__ == '__main__':
    main()
