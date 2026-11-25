"""Bake bounded, nondirectional contact occlusion onto an independent UV atlas.

Run after build_scene.py -- pond-boat. Source forms remain in the editable blend;
this only processes the export copy. SurfaceUV, normal and roughness stay intact.
Experimental: the combined web export still needs colour/atlas parity review.
Do not stage this copy as the default visual asset; models:boat skips it.
"""
import argparse
import json
import sys
from pathlib import Path
import bpy
import numpy as np

p=argparse.ArgumentParser()
p.add_argument('--input',required=True)
p.add_argument('--output',required=True)
p.add_argument('--resolution',type=int,default=1024)
p.add_argument('--samples',type=int,default=32)
p.add_argument('--save')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(a.input).resolve()))
scene=bpy.context.scene;scene.render.engine='CYCLES'
scene.cycles.samples=a.samples
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU'
except (TypeError,RuntimeError):pass
meshes=sorted((o for o in scene.objects if o.type=='MESH'),key=lambda o:o.name)
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
    if obj.data.uv_layers.active:
        old=obj.data.uv_layers.active.name
        for mat in obj.data.materials:
            for node in mat.node_tree.nodes:
                if node.type=='UVMAP' and node.uv_map==old:node.uv_map='SurfaceUV'
        obj.data.uv_layers.active.name='SurfaceUV'
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.object.join();obj=bpy.context.object;obj.name='PondBoat'
if obj.data.color_attributes:
    # Joining into an unpainted hull clears the active/render colour indices.
    # Explicitly retain imported COLOR_0 for the face blush and cat markings.
    obj.data.color_attributes.active_color_index=0
    obj.data.color_attributes.render_color_index=0
    for mat in obj.data.materials:
        for node in mat.node_tree.nodes:
            if node.type=='VERTEX_COLOR' and not node.layer_name:
                node.layer_name=obj.data.color_attributes[0].name
obj.data.uv_layers.new(name='OcclusionUV');obj.data.uv_layers.active_index=1
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006,area_weight=.4)
bpy.ops.object.mode_set(mode='OBJECT')
image=bpy.data.images.new('Pond contact occlusion',width=a.resolution,height=a.resolution,alpha=False)
image.colorspace_settings.name='Non-Color'
restore=[]
for mat in set(obj.data.materials):
    nt=mat.node_tree
    output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL')
    previous=output.inputs['Surface'].links[0].from_socket
    target=nt.nodes.new('ShaderNodeTexImage');target.image=image
    ao=nt.nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.085
    ao.only_local=True;ao.samples=16
    emit=nt.nodes.new('ShaderNodeEmission')
    nt.links.new(ao.outputs['AO'],emit.inputs['Color']);nt.links.new(emit.outputs[0],output.inputs['Surface'])
    for node in nt.nodes:node.select=False
    target.select=True;nt.nodes.active=target
    restore.append((nt,output,previous,target,ao,emit))
scene.render.bake.margin=8
bpy.ops.object.bake(type='EMIT',use_clear=True)
# Preserve a modest contact effect instead of crushing seams into black paint.
pixels=np.empty(a.resolution*a.resolution*4,dtype=np.float32);image.pixels.foreach_get(pixels)
pixels=pixels.reshape((-1,4));pixels[:,:3]=.48+.52*np.clip(pixels[:,:3],0,1)
pixels[:,3]=1;image.pixels.foreach_set(pixels.ravel());image.pack()
group=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
if not any(s.name=='Occlusion' for s in group.interface.items_tree):
    group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
for nt,output,previous,target,ao,emit in restore:
    nt.links.new(previous,output.inputs['Surface']);nt.nodes.remove(ao);nt.nodes.remove(emit)
    uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='OcclusionUV'
    nt.links.new(uv.outputs['UV'],target.inputs['Vector'])
    settings=next((n for n in nt.nodes if n.type=='GROUP' and n.node_tree==group),None)
    if settings is None:settings=nt.nodes.new('ShaderNodeGroup');settings.node_tree=group
    nt.links.new(target.outputs['Color'],settings.inputs['Occlusion'])
obj.data.uv_layers.active_index=0
obj.data.uv_layers[0].active_render=True
if a.save:bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.save).resolve()))
bpy.ops.export_scene.gltf(filepath=str(Path(a.output).resolve()),export_format='GLB',use_selection=True,
    export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
print('POND_AO',json.dumps({'resolution':a.resolution,'samples':a.samples,'distanceM':.085,
    'uv':'OcclusionUV','range':[float(pixels[:,:3].min()),float(pixels[:,:3].max())],
    'output':str(Path(a.output).resolve())}),flush=True)
