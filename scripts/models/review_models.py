"""Render the editable boat and islands with consistent Workbench lighting."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
full_source=Path(__file__).with_name('pond-source.blend')


def review_scene(source, visible_collections):
    bpy.ops.wm.open_mainfile(filepath=str(source if source.is_file() else full_source))
    for collection in bpy.data.collections:
        collection.hide_render=collection.name not in visible_collections
    scene=bpy.context.scene
    scene.render.engine='BLENDER_WORKBENCH'
    shading=scene.display.shading
    shading.light='STUDIO'
    shading.studiolight_rotate_z=.6
    shading.color_type='MATERIAL'
    shading.show_shadows=True
    shading.show_cavity=True
    shading.cavity_type='WORLD'
    shading.curvature_ridge_factor=1.2
    shading.curvature_valley_factor=.8
    shading.background_type='WORLD'
    scene.world.color=(.72,.76,.70)
    scene.render.resolution_x=1152
    scene.render.resolution_y=1152
    scene.render.resolution_percentage=100
    camera=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'))
    scene.collection.objects.link(camera)
    scene.camera=camera
    camera.data.type='ORTHO'
    return scene,camera


scene,camera=review_scene(full_source.with_name('pond-boat-source.blend'), {'Collection','pond-boat','pond-character'})
camera.data.ortho_scale=4.5
for name,at in [('boat',(2.9,-3.8,5.9)),('boat-side',(3.8,1.1,3.6))]:
    camera.location=at
    camera.rotation_euler=(Vector((-.10,0,.50))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(ROOT/'.playwright-mcp'/f'polished-{name}.png')
    bpy.ops.render.render(write_still=True)

scene,camera=review_scene(full_source.with_name('pond-world-source.blend'), {'Collection','pond-world'})
for name,center in [('github',(-5,-4,.65)),('email',(4.9,-4.3,.6)),('about',(-5,3.6,1.7))]:
    for obj in bpy.data.collections['pond-world'].objects:
        obj.hide_render=obj.get('pond_island')!=name
    camera.location=Vector(center)+Vector((3.6,-4.8,5.8))
    camera.rotation_euler=(Vector(center)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=5 if name!='about' else 7.8
    scene.render.filepath=str(ROOT/'.playwright-mcp'/f'polished-{name}.png')
    bpy.ops.render.render(write_still=True)
