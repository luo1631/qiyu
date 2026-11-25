"""Check the editable workstation's load path and seated keycaps."""
import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def surface(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    vertices = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    faces = [tuple(face.vertices) for face in mesh.polygons]
    evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(vertices, faces)


def keycap_contacts(obj, bed):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    assert all(edge.is_manifold for edge in mesh.edges), f'Open keycap on {obj.name}'
    remaining = set(mesh.verts)
    contacts = []
    while remaining:
        stack = [remaining.pop()]
        points = []
        while stack:
            vertex = stack.pop()
            points.append(obj.matrix_world @ vertex.co)
            for edge in vertex.link_edges:
                neighbour = edge.other_vert(vertex)
                if neighbour in remaining:
                    remaining.remove(neighbour)
                    stack.append(neighbour)
        center = sum(points, Vector((0, 0, 0))) / len(points)
        hit, _, _, _ = bed.ray_cast(center + Vector((0, 0, .04)), Vector((0, 0, -1)), .10)
        assert hit is not None, f'Keycap extends past the switch bed at {center}'
        contacts.append(hit.z - min(point.z for point in points))
    mesh.free()
    obj.data.calc_loop_triangles()
    return contacts, len(obj.data.loop_triangles)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blend', type=Path, default=Path(__file__).with_name('pond-world-source.blend'))
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    objects = bpy.data.objects
    joins = [
        ('Desk top', 'Monitor foot'),
        ('Monitor foot', 'Monitor stand plate'),
        ('Monitor stand plate', 'Monitor neck'),
        ('Monitor neck', 'Monitor pivot'),
        ('Monitor pivot', 'Monitor rear mount'),
        ('Monitor rear mount', 'Monitor housing'),
        ('Desk top', 'Keyboard base'),
        ('Keyboard base', 'Keyboard rim'),
        ('Keyboard rim', 'Keyboard switch bed'),
        ('Desk top', 'Open ceramic mug'),
        ('Open ceramic mug', 'Mug handle'),
        ('Desk top', 'Desk pencil'),
        ('Desk top', 'Notebook'),
    ]
    surfaces = {name: surface(objects[name], depsgraph) for name in {part for pair in joins for part in pair}}
    pairs = {a + ' / ' + b: len(surfaces[a].overlap(surfaces[b])) for a, b in joins}
    assert all(pairs.values()), f'Open assembly join {pairs}'
    for prop in ('Notebook', 'Keyboard base'):
        assert not surfaces['Desk pencil'].overlap(surfaces[prop]), f'The pencil clips {prop}'

    keycaps = [obj for obj in objects if obj.name.startswith('Keyboard keycaps ')]
    assert len(keycaps) == 3, 'Keycaps must share geometry by finish'
    contacts, triangles = [], 0
    for obj in keycaps:
        depths, count = keycap_contacts(obj, surfaces['Keyboard switch bed'])
        contacts.extend(depths)
        triangles += count
    assert len(contacts) == 39, f'Expected 39 separate keycaps, got {len(contacts)}'
    assert min(contacts) > .001, 'At least one keycap floats above the keyboard'
    print('WORKSTATION_CONTACT', json.dumps({
        'joins': pairs, 'keycaps': len(contacts), 'keycapTriangles': triangles,
        'minimumKeycapEmbedmentMetres': min(contacts),
    }), flush=True)


if __name__ == '__main__':
    main()
