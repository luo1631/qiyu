"""Weathered stone templates shared by authored shores and instanced lakebed.

Blender's convex hull, bevel and weighted normals preserve broad mineral faces.
The small JSON is generated geometry, read by Three without another GLB load.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector


def stone_mesh(variant=0):
    outline=[(-.87,-.44),(-.43,-.91),(.54,-.80),(.99,-.19),
             (.72,.63),(.08,.91),(-.72,.65),(-1.0,.08)]
    vertices=[]
    for level in range(3):
        for i,(x,y) in enumerate(outline):
            if level==2 and i in ([1,5] if variant!=1 else [0,4]):continue
            a=1+.08*math.sin(i*1.7+variant*2)
            scale=[.79,1.0,.70 if variant!=1 else .85][level]
            px=x*scale*a+(.13 if level==2 else -.05)*variant
            py=y*scale*a+(level-1)*.07
            z=[-.55,.05,.67 if variant!=1 else .37][level]+px*.15-py*.10
            if level==1:z+=.09*math.sin(i*2+variant)
            vertices.append((px,py,z))
    bm=bmesh.new()
    for point in vertices:bm.verts.new(point)
    hull=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
    bmesh.ops.delete(bm,geom=hull.get('geom_interior',[]),context='VERTS')
    bmesh.ops.dissolve_limit(bm,angle_limit=.015,verts=list(bm.verts),edges=list(bm.edges))
    data=bpy.data.meshes.new('WeatheredStone-'+str(variant));bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bevel=obj.modifiers.new('Worn mineral edges','BEVEL');bevel.width=.075 if variant!=1 else .055
    bevel.segments=3;bevel.affect='EDGES'
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for face in obj.data.polygons:face.use_smooth=True
    normals=obj.modifiers.new('Broad stone planes','WEIGHTED_NORMAL');normals.keep_sharp=True;normals.weight=60
    bpy.ops.object.modifier_apply(modifier=normals.name)
    tint=obj.data.color_attributes.new(name='StoneTint',type='FLOAT_COLOR',domain='CORNER')
    for loop in obj.data.loops:
        p=obj.data.vertices[loop.vertex_index].co
        moss=max(0,min(.42,(p.z-.12)*.50+.11*math.sin(p.x*4+p.y*3+variant)))
        colour=Vector((.43,.425,.36)).lerp(Vector((.21,.285,.12)),moss)
        colour*=.92+.06*(p.z+.7)+.018*math.sin(p.x*16+p.y*11)
        tint.data[loop.index].color=(*colour,1)
    data=obj.data.copy();bpy.data.objects.remove(obj,do_unlink=True)
    return data


_templates=None


def templates():
    global _templates
    if _templates is None:_templates=[stone_mesh(i) for i in range(3)]
    return _templates


def export_templates(path=None):
    path=path or Path(__file__).resolve().parents[2]/'src/scene/stone-shapes.json'
    shapes=[]
    for data in templates():
        data.calc_loop_triangles();normals=data.corner_normals;tint=data.color_attributes['StoneTint']
        shape={'position':[],'normal':[],'color':[]}
        for tri in data.loop_triangles:
            for loop_index in tri.loops:
                p=data.vertices[data.loops[loop_index].vertex_index].co;n=normals[loop_index].vector
                # Exactly the same Z-up to Y-up conversion as the glTF exporter.
                shape['position'] += [round(p.x,6),round(p.z,6),round(-p.y,6)]
                shape['normal'] += [round(n.x,6),round(n.z,6),round(-n.y,6)]
                shape['color'] += [round(v,6) for v in tint.data[loop_index].color[:3]]
        shapes.append(shape)
    Path(path).write_text(json.dumps(shapes,separators=(',',':')),encoding='utf-8')
    return shapes


if __name__=='__main__':export_templates()
