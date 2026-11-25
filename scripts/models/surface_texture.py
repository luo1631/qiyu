"""Small authored surface maps for the editable Blender/glTF assets.

Colour variation is intrinsic to the material; no directional light is baked.
The maps are packed into the .blend and GLB, so export has no external dependency.
"""
import bpy
import numpy as np
import zlib


_boat_paint_maps = None


def _reuse_boat_paint(material, images):
    """The twelve boards share one padded atlas and three portable maps."""
    shader=material.node_tree.nodes.get('Principled BSDF')
    nodes=[]
    for image in images:
        texture=material.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image=image;texture.interpolation='Linear';texture.extension='REPEAT'
        nodes.append(texture)
    material.node_tree.links.new(nodes[0].outputs['Color'],shader.inputs['Base Color'])
    normal=material.node_tree.nodes.new('ShaderNodeNormalMap')
    material.node_tree.links.new(nodes[1].outputs['Color'],normal.inputs['Color'])
    material.node_tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    channels=material.node_tree.nodes.new('ShaderNodeSeparateColor')
    material.node_tree.links.new(nodes[2].outputs['Color'],channels.inputs['Color'])
    material.node_tree.links.new(channels.outputs['Green'],shader.inputs['Roughness'])


def painted_surface(material, kind='wood', size=512):
    global _boat_paint_maps
    if kind=='weathered_paint' and _boat_paint_maps is not None:
        _reuse_boat_paint(material,_boat_paint_maps)
        return
    base = np.array(material.diffuse_color[:3], dtype=np.float32)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    roughness=material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value
    phase_seed=(zlib.crc32(material.name.encode('utf-8'))%997)/997*6.28
    if kind in ['wood','weathered_paint']:
        # Periodic value fields vary annual growth, bleaching and paint loss.
        # Their frequency follows the grain; they contain no light or AO.
        def field(px,py,key,nx,ny):
            gx=px*nx;gy=py*ny
            ix=np.floor(gx);iy=np.floor(gy);fx=gx-ix;fy=gy-iy
            fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
            def value(dx,dy):
                h=np.sin(np.mod(ix+dx,nx)*127.1+np.mod(iy+dy,ny)*311.7+key*74.7)*43758.5453
                return h-np.floor(h)
            a=value(0,0)*(1-fx)+value(1,0)*fx
            b=value(0,1)*(1-fx)+value(1,1)*fx
            return a*(1-fy)+b*fy
        def ramp(low,high,value):
            t=np.clip((value-low)/(high-low),0,1)
            return t*t*(3-2*t)
        # U crosses each plank; V follows it. A padded strip is unique per
        # painted board, while the timber maps tile without hard colour joins.
        sx=x
        if kind=='weathered_paint':
            slot=np.minimum((x*12).astype(np.int32),11)
            sx=x*12-slot
            # Clamp to an 8 px gutter on either side of each 85 px strip.
            # The UVs only use the centre 80%; lowest mips mix similar hues.
            sx=np.clip((sx-.095)/.81,0,1)
            seed=slot*2.399963
        else:
            seed=phase_seed
        drift=.042*(field(sx,y,seed+1,4,3)-.5)+.016*(field(sx,y,seed+2,11,5)-.5)
        ring=(sx+drift)*np.pi*20+2.1*(field(sx,y,seed+3,7,2)-.5)
        growth=np.sin(ring+.65*np.sin(ring*.7))
        fine=np.sin((sx+drift*.7)*np.pi*106+2*(field(sx,y,seed+4,14,7)-.5))
        density=.22+.78*field(sx,y,seed+5,9,5)
        pores=np.maximum(0,growth-.54)**1.3*density
        broad=.24*(field(sx,y,seed+6,3,3)-.5)+.14*(field(sx,y,seed+7,9,4)-.5)
        tone=1+broad+.032*fine*density+.035*growth-.68*pores
        # A quiet, offset knot distorts a small part of a timber face. It is
        # not a repeated dark oval and does not define the paint-loss mask.
        cx=.23+.26*(.5+.5*np.sin(seed));cy=.31+.17*np.sin(seed*1.7)
        dx=np.mod(sx-cx+.5,1)-.5;dy=np.mod(y-cy+.5,1)-.5
        r=np.sqrt((dx/.12)**2+(dy/.055)**2)
        tone-=.075*np.exp(-r*r)*(.4+.6*np.sin(r*12)**2)
        # Sparse photo-oxidised patches stay broad and pale; most of the
        # timber retains its deeper role colour instead of a uniform wash.
        bleach=.02+.32*ramp(.53,.85,field(sx,y,seed+8,4,3))
        bleach*=.70 if material.name=='Boat_TimberHoney' else .40 if material.name=='Boat_TimberShade' else 1
        aged=np.array((.46,.375,.265),dtype=np.float32)*tone[...,None]
        rgb=base*tone[...,None]*(1-bleach[...,None])+aged*bleach[...,None]
        moisture=.17*ramp(.57,.82,field(sx,y,seed+9,5,2))
        rgb*=1-moisture[...,None]
        height=(.095*growth+.022*fine-.36*pores)*(1+.30*bleach)
        rough=np.clip(roughness+.10*bleach+.055*pores+.035*moisture,.45,.93)
        if kind=='weathered_paint':
            row=slot%6
            colours=np.array([(.20,.285,.28),(.30,.385,.365),(.39,.465,.435),
                              (.45,.505,.465),(.36,.44,.415),(.435,.49,.45)],dtype=np.float32)
            chalk=.18*(field(sx,y,seed+10,5,5)-.5)+.065*(field(sx,y,seed+11,13,12)-.5)
            paint=colours[row]*(1+chalk-.035*pores)[...,None]
            # Chips are millimetre/centimetre fragments at real board edges,
            # sparse fastenings and the bow, not broad floating scrape ovals.
            region=np.zeros_like(x)
            for number in range(2):
                edge=number
                cy=.12+.73*np.mod(slot*.173+number*.413,1)
                length=.010+.009*(.5+.5*np.sin(seed+number*4))
                edge_zone=np.clip(1-np.abs(sx-edge)/(.16+.045*np.sin(seed+number)),0,1)
                region=np.maximum(region,edge_zone*np.exp(-((y-cy)/length)**4))
            # Only three lower/middle boards carry one readable wear group.
            # Its 120--220 mm length and 20--35 mm depth retain paint islands;
            # the other board edges keep their small, isolated chips.
            selected=np.isin(row,[1,2,4])
            centre=np.take(np.array([.5,.88,.66,.5,.91,.5]),row)
            centre-=.11*(slot>=6)
            half_length=.018+.014*(.5+.5*np.sin(seed+1.7))
            edge=np.where(row==2,1,0)
            depth=np.take(np.array([.1,.29,.235,.1,.22,.1]),row)
            group=(1-ramp(half_length*.65,half_length,np.abs(y-centre)))*(
                   1-ramp(depth*.40,depth,np.abs(sx-edge)))
            region=np.maximum(region,group*selected)
            # The geometric nail rows are at levels .38/.73/.92; their five
            # station positions come from build_boat's staggered fixings.
            for index,position in enumerate([-1.53,-1.02,.12,1.10,1.53]):
                nail_row=np.isin(row,[2,4,5])
                selected=np.mod(slot+index*3,5)==0
                across=np.take(np.array([.5,.5,.528,.5,.457,.543]),row)
                yy=.02+.96*(position+(np.where(row==2,-.022,np.where(row==5,.022,0)))+1.70)/3.45
                near=np.exp(-((sx-across)/.085)**2-((y-yy)/.007)**2)
                region=np.maximum(region,near*nail_row*selected*.8)
            bow=ramp(.90,.985,y)*np.clip(1-sx/.16,0,1)
            region=np.maximum(region,bow*.72)
            fragments=.64*field(sx,y,seed+12,29,109)+.36*field(sx,y,seed+13,57,193)
            chip=ramp(.50-.19*region,.69-.14*region,fragments)*region
            thin_depth=np.take(np.array([.29,.35,.255,.15,.29,.13]),row)
            thin=thin_depth*(.22+.78*field(sx,y,seed+14,3,4))
            thin+=.035*ramp(.86,.99,y)*field(sx,y,seed+15,7,9)
            wear=np.clip(thin+chip*(1-thin),0,1)
            timber=np.array((.31,.205,.115),dtype=np.float32)*tone[...,None]
            rgb=paint*(1-wear[...,None])+timber*wear[...,None]
            height=(.045*growth+.009*fine)*(1-wear)+height*wear-chip*.035
            rough=np.clip(.735+.045*thin+.075*chip+.018*pores,.70,.89)
    elif kind=='rope':
        # One circumference in U, one 90 mm lay in V. Three twisted hemp
        # plies and finer fibre bundles use a portable tangent-space normal.
        lay=2*np.pi*3*(x-y)
        fibres=np.sin(2*np.pi*23*(x-y)+.35*np.sin(x*2*np.pi))
        ply=np.cos(lay)
        rgb=base*(.985+.022*ply[...,None]+.013*fibres[...,None])
        height=.14*ply+.008*fibres
        rough=np.clip(roughness+.025*fibres,.82,.97)
    elif kind=='hair':
        flow=x+.007*np.sin(y*9+x*3)
        strand=np.sin(flow*np.pi*100)+.35*np.sin(flow*np.pi*212)
        rgb=base*(1+.016*strand[...,None]+.040*np.sin(x*11+y*2)[...,None])
        height=.012*strand
        rough=np.clip(roughness+.025*strand,.35,.72)
    else:
        weave = np.sin(x*np.pi*128)*np.sin(y*np.pi*128)
        broad = .015*np.sin(x*17+y*11)*np.sin(y*23)
        rgb = base*(1+broad[...,None]+.018*weave[...,None])
        height=.022*weave
        rough=np.clip(roughness+.02*weave,.65,.98)
    pixels = np.ones((size,size,4),dtype=np.float32)
    # Image pixels are stored as display colour for the glTF base-colour texture.
    rgb = np.clip(rgb, .001, 1)
    pixels[:,:,:3] = np.where(rgb <= .0031308, rgb*12.92, 1.055*np.power(rgb,1/2.4)-.055)
    image=bpy.data.images.new(material.name+' surface',width=size,height=size,alpha=False)
    image.colorspace_settings.name='sRGB'
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    shader=material.node_tree.nodes.get('Principled BSDF')
    texture=material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image=image
    texture.interpolation='Linear'
    texture.extension='REPEAT'
    material.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
    # Portable tangent-space normal and roughness: actual texture channels,
    # not a Blender-only procedural bump network. No sunlight is baked in.
    dy,dx=np.gradient(height)
    # Hair's former sub-degree normal disappeared under both renderers. Small
    # flow-aligned slopes break the moulded-plastic highlight at close range;
    # mips average the fibres away when the character occupies few pixels.
    strength=2.0 if kind in ['wood','weathered_paint'] else 18.0 if kind=='rope' else 4.0 if kind=='hair' else .9
    normal=np.stack((-dx*strength,-dy*strength,np.ones_like(x)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    def data_map(suffix,rgb):
        data=np.ones((size,size,4),dtype=np.float32);data[:,:,:3]=rgb
        img=bpy.data.images.new(material.name+suffix,width=size,height=size,alpha=False)
        img.colorspace_settings.name='Non-Color';img.pixels.foreach_set(data.ravel());img.pack()
        node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=img
        node.interpolation='Linear';node.extension='REPEAT'
        return node
    normal_tex=data_map(' normal',normal*.5+.5)
    normal_node=material.node_tree.nodes.new('ShaderNodeNormalMap')
    material.node_tree.links.new(normal_tex.outputs['Color'],normal_node.inputs['Color'])
    material.node_tree.links.new(normal_node.outputs['Normal'],shader.inputs['Normal'])
    packed=data_map(' roughness',np.stack((np.ones_like(x),rough,np.zeros_like(x)),axis=-1))
    channels=material.node_tree.nodes.new('ShaderNodeSeparateColor')
    material.node_tree.links.new(packed.outputs['Color'],channels.inputs['Color'])
    material.node_tree.links.new(channels.outputs['Green'],shader.inputs['Roughness'])
    if kind=='weathered_paint':
        _boat_paint_maps=(image,normal_tex.image,packed.image)


def project_surface_uv(obj, across=False, cloth=False):
    if obj.type != 'MESH':
        return
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='SurfaceUV')
    uv.name='SurfaceUV'
    obj.update_tag()
    # Use a construction plane per face. Mixing x+z on every face produced
    # diagonal streaks across the old hull and collapsed UVs on some ends.
    world=[obj.matrix_world@v.co for v in obj.data.vertices]
    xmin=min((p.x for p in world),default=0);xmax=max((p.x for p in world),default=1)
    zmin=min((p.z for p in world),default=0);zmax=max((p.z for p in world),default=1)
    for polygon in obj.data.polygons:
        n=obj.matrix_world.to_3x3().inverted().transposed()@polygon.normal
        for index in polygon.loop_indices:
            p=world[obj.data.loops[index].vertex_index]
            if cloth:
                if abs(n.z)>=max(abs(n.x),abs(n.y)):u,v=p.x*2.1,p.y*1.8
                elif abs(n.x)>abs(n.y):u,v=p.z*2.1,p.y*1.8
                else:u,v=p.x*2.1,p.z*1.8
            elif obj.name.startswith(('BOAT_SternTransom','BOAT_RoundedStem')) and polygon.material_index==0:
                slot=int(obj.get('boat_plank_atlas',2))
                u=(slot+.095+.81*(p.x-xmin)/max(.001,xmax-xmin))/12
                v=.08+.84*(p.z-zmin)/max(.001,zmax-zmin)
            elif abs(n.y)>=max(abs(n.x),abs(n.z)) and not (
                    obj.name.startswith('BOAT_LongitudinalStrake') and
                    polygon.index<6*(len(world)//6-1) and polygon.index%6<4):
                # End grain / transom: x/z spans the face, x/y collapses it.
                u,v=p.x*2.5,p.z*4
            elif obj.name.startswith('BOAT_LongitudinalStrake') and polygon.index<6*(len(world)//6-1) and polygon.index%6<4:
                # Six rings: three outer, three inner. Logical across-board UV
                # tracks the rising sheer, so edge wear stays on the board edge.
                station_count=len(world)//6
                ring=obj.data.loops[index].vertex_index//station_count
                if polygon.index%6<2:
                    slot=int(obj.get('boat_plank_atlas',0))
                    u=(slot+.095+.81*(ring%3)*.5)/12
                    v=.02+.96*(p.y+1.70)/3.45
                else:
                    offset=(zlib.crc32(obj.name.encode('utf-8'))%997)/997
                    # A different section of the shared timber map per board,
                    # including density and longitudinal phase, prevents a
                    # repeated growth/fade pattern across the whole interior.
                    u,v=(ring%3)*(.31+.13*offset)+offset,p.y*(.27+.11*offset)+offset*.73
            elif across:
                u,v=(p.y*2.5 if abs(n.z)>abs(n.y) else p.z*4),p.x*.72
            elif abs(n.z)>=abs(n.x):u,v=p.x*2.5,p.y*.72
            else:u,v=p.z*4,p.y*.72
            if obj.name.startswith('BOAT_') and not cloth and not obj.name.startswith('BOAT_LongitudinalStrake') and not (
                    obj.name.startswith(('BOAT_SternTransom','BOAT_RoundedStem')) and polygon.material_index==0):
                # Phase each timber independently; the oar's oblique axis and
                # the cross-boat seats need actual construction directions.
                offset=(zlib.crc32(obj.name.encode('utf-8'))%997)/997
                if obj.name.startswith('BOAT_OarBlade'):
                    # The finished oar is mirrored onto -X. Its long axis is
                    # (-.805,.514,-.262); keep the grain parallel to the shaft.
                    u,v=(.514*p.x+.805*p.y)*3.4,(-.805*p.x+.514*p.y-.262*p.z)*.78
                elif obj.name.startswith(('BOAT_OarShaft','BOAT_OarGrip')):
                    u,v=(.514*p.x+.805*p.y)*7,(-.805*p.x+.514*p.y-.262*p.z)*.78
                elif obj.name.startswith('BOAT_StemTimber'):
                    u,v=p.x*8,p.z*1.1
                elif obj.name.startswith('BOAT_InteriorFrame'):
                    u,v=(p.y if abs(n.x)>abs(n.y) else p.x)*6,p.z*1.6
                elif obj.name.startswith('BOAT_Floorboard'):
                    u,v=p.x*(2.4+.7*offset),p.y*(.27+.11*offset)
                elif obj.name.startswith('BOAT_EasedGunwale'):
                    u,v=(p.x*3 if abs(n.z)>abs(n.x) else p.z*5)*(.84+.31*offset),p.y*(.27+.11*offset)
                elif obj.name.startswith('BOAT_Thwart'):
                    u,v=(p.y*2.5 if abs(n.z)>abs(n.y) else p.z*4)*(.80+.35*offset),p.x*(.60+.23*offset)
                u+=offset;v+=offset*.73
            uv.data[index].uv=(u,v)


def repair_degenerate_uv(obj):
    """Give modifier-created rims and lock end caps a nonzero tangent plane.

    Include near-collinear UVs: float32 glTF V-flipping can erase their tiny
    residual area. Only failed polygons change; authored flowing UVs remain.
    """
    from mathutils import Vector
    uv=obj.data.uv_layers.active
    if uv is None:return 0
    obj.data.calc_loop_triangles()
    failed=set();face_crosses={}
    for tri in obj.data.loop_triangles:
        p,q,r=(obj.data.vertices[i].co for i in tri.vertices)
        normal=(q-p).cross(r-p)
        if normal.length<=2e-12:continue
        face_crosses.setdefault(tri.polygon_index,[]).append(normal)
        a,b,c=(uv.data[i].uv for i in tri.loops)
        cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
        edge_sq=max((b-a).length_squared,(c-a).length_squared,(c-b).length_squared)
        if abs(cross)<=max(1e-10,edge_sq*1e-6):
            failed.add(tri.polygon_index)
    for index in failed:
        face=obj.data.polygons[index]
        normals=[n.normalized() for n in face_crosses[index]]
        # Real triangle crosses avoid stale polygon normals. Choose a plane
        # that also spans every triangle of a mildly nonplanar polygon.
        candidates=[max(face_crosses[index],key=lambda n:n.length_squared).normalized()]
        candidates.extend(Vector(v).normalized() for v in
                          [(1,0,0),(0,1,0),(0,0,1),(1,2,3),(-2,3,1)])
        normal=max(candidates,key=lambda n:min(abs(n.dot(t)) for t in normals))
        axis=Vector((1,0,0)) if abs(normal.x)<.8 else Vector((0,1,0))
        tangent=normal.cross(axis).normalized();bitangent=normal.cross(tangent)
        for loop in face.loop_indices:
            point=obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(point.dot(tangent)*2.1,point.dot(bitangent)*2.1)
    if failed:obj.data.update()
    return len(failed)
