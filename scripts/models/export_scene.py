"""Prepare and export a scene already open in Blender.

For hand edits, open a saved island master in a background process and pass a
scratch output path. Export-time modifier and mesh changes stay in that process.
"""
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))

# The four authoring-space origins are also used to place the island banks.
island_specs = [('projects', 4.7, 3.6, 3.0, 2.6), ('about', -5, 3.6, 4.86, 4.05),
                ('github', -5, -4, 2.0, 1.6), ('email', 4.9, -4.3, 1.65, 1.4)]
island_origins = {name: (x, y, 0) for name, x, y, _, _ in island_specs}


def prepare(objects, character_parts=False, world_only=False):
    """Bake remaining modifiers and merge by material while keeping named pivots."""
    from surface_texture import repair_degenerate_uv

    groups = {}
    bpy.ops.object.select_all(action='DESELECT')
    for obj in sorted(objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        if world_only and obj.parent:
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            world_matrix = evaluated.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = world_matrix
        # Blender's transform/modifier operators require single user mesh data.
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        needs_transform = not world_only or any(abs(axis - 1) > 1e-8 for axis in obj.scale)
        if obj.modifiers or needs_transform:
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            for modifier in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            if needs_transform:
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            obj.select_set(False)
        # Blender joins UV layers by name. A mixed name drops parts of the map.
        if obj.data.uv_layers.active:
            obj.data.uv_layers.active.name = 'SurfaceUV'
            if obj.get('pond_boat_part') or obj.get('sleeper_region') == 'garment' or obj.name.startswith('CH_'):
                repair_degenerate_uv(obj)
        if character_parts:
            scope = 'head' if obj.get('character_region') == 'head' else 'body'
        else:
            scope = obj.get('pond_island', 'waterbed')
        if obj.parent and obj.parent.get('pond_pose_pivot'):
            scope = obj.parent.name
        keep_mesh = obj.name == 'FishTail' or obj.data.shape_keys is not None
        key = obj.name if keep_mesh else scope + '|' + '|'.join(m.name if m else '' for m in obj.data.materials)
        groups.setdefault(key, []).append(obj)

    merged = []
    for key, items in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in items:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = items[0]
        if len(items) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = key.replace('|', '_')
        merged.append(obj)
    return merged


def export_asset(name, objects, destination, world_only=False):
    pivots = [obj for obj in objects if obj.get('pond_pose_pivot')] if name == 'pond-boat' else []
    merged = prepare(objects, character_parts=name == 'pond-character', world_only=world_only)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in merged:
        obj.select_set(True)
    for pivot in pivots:
        pivot.select_set(True)
    if name == 'pond-world':
        island_parents = {}
        for obj in merged:
            island = obj.get('pond_island')
            if not island:
                continue
            if island not in island_parents:
                parent = bpy.data.objects.new('island-' + island, None)
                bpy.context.collection.objects.link(parent)
                parent.location = island_origins[island]
                island_parents[island] = parent
            obj.parent = island_parents[island]
            # Retain the authored view while letting Three place the island at
            # its configured position and scale independently of the other islands.
            obj.matrix_parent_inverse = Matrix.Translation(-obj.parent.location)
        for parent in island_parents.values():
            parent.select_set(True)
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name('.' + path.stem + '.pending.glb')
    result = bpy.ops.export_scene.gltf(filepath=str(pending), export_format='GLB',
        use_selection=True, export_apply=True, export_animations=False, export_cameras=False,
        export_lights=False, export_yup=True, export_draco_mesh_compression_enable=False)
    if 'FINISHED' not in result:
        raise RuntimeError('Blender glTF export failed')
    for attempt in range(6):
        try:
            pending.replace(path)
            break
        except PermissionError as error:
            # A Windows reader can briefly hold the old asset during rebuilds.
            if attempt==5 or getattr(error,'winerror',None) not in (5,32,33):raise
            time.sleep(.06 * 2**attempt)
    triangles = sum(len(face.vertices) - 2 for obj in merged for face in obj.data.polygons)
    print('POND_ASSET', name, len(merged), triangles, path.stat().st_size, flush=True)


def export_edited_world(output):
    collection = bpy.data.collections.get('pond-world')
    if collection is None:
        raise ValueError('The saved Blender file needs the pond-world collection')
    bpy.context.view_layer.update()
    export_asset('pond-world', collection.all_objects, output, world_only=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(args) != 1:
        raise ValueError('Pass the GLB output path after --')
    export_edited_world(args[0])
