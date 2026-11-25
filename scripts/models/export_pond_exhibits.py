"""Export the three shore objects from the open world master without saving the blend."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_scene import prepare


def top_center(obj):
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    top = max(point.z for point in points)
    rim = [point for point in points if point.z >= top - .0001]
    return sum(rim, Vector()) / len(rim)


def pivot(name, position, parts=(), yaw=0):
    joint = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(joint)
    joint.matrix_world = Matrix.Translation(position) @ Matrix.Rotation(yaw, 4, 'Z')
    bpy.context.view_layer.update()
    for part in parts:
        placement = part.matrix_world.copy()
        part.parent = joint
        part.matrix_world = placement
    return joint


def export(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    output = Path(__file__).resolve().parents[2] / 'public' / 'models' / f'exhibit-{name}.glb'
    result = bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                                      export_animations=False, export_cameras=False, export_lights=False)
    if 'FINISHED' not in result:
        raise RuntimeError(f'Could not export {name}')


world = bpy.data.collections['pond-world'].all_objects
pavilion = {obj for obj in world if obj.type == 'MESH' and obj.get('pond_island') == 'about'
            and any(slot.material and slot.material.name.startswith('Pavilion') for slot in obj.material_slots)}
lantern = {obj for obj in pavilion if obj.name.startswith(('Hanging lantern', 'Lantern'))}
hinge = top_center(next(obj for obj in lantern if obj.name.startswith('Hanging lantern')))
fixed = prepare(pavilion - lantern, world_only=True)
moving = prepare(lantern, world_only=True)
export('pavilion', [*fixed, *moving, pivot('LanternSwing', hinge, moving)])

mailbox = {obj for obj in world if obj.get('pond_island') == 'email' and obj.name.startswith(('Mailbox', 'Envelope'))}
flag = {obj for obj in mailbox if obj.name.startswith(('Mailbox flag arm', 'Mailbox flag plate'))}
axle = next(obj for obj in mailbox if obj.name.startswith('Mailbox flag axle'))
hinge = sum((axle.matrix_world @ Vector(corner) for corner in axle.bound_box), Vector()) / 8
hood = next(obj for obj in mailbox if obj.name.startswith('Mailbox slot hood'))
slot = hood.matrix_world.translation - Vector((0, 0, .026))
fixed = prepare(mailbox - flag, world_only=True)
moving = prepare(flag, world_only=True)
yaw = math.radians(-35)
export('mailbox', [*fixed, *moving, pivot('MailFlag', hinge, moving, yaw), pivot('LetterSlot', slot, yaw=yaw)])

desk = {obj for obj in world if obj.get('pond_island') == 'github' and obj.name.startswith(
    ('Chair', 'Desk', 'Keyboard', 'Monitor', 'Notebook', 'Octocat', 'Open ceramic', 'Mug handle', 'Tea surface'))}
steam = top_center(next(obj for obj in desk if obj.name.startswith('Tea surface')))
export('desk', [*prepare(desk, world_only=True), pivot('TeaSurface', steam)])
