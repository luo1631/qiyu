"""Full-bellied painted wooden boat; Z-up, within the 1.795 m envelope.
Keep the seated figure's support heights while giving the hull visible volume.
"""
import math
import bpy
import bmesh
from mathutils import Vector
from surface_texture import painted_surface, project_surface_uv


def build_boat(materials, mesh, cube, ball, curve, rod):
    before = set(bpy.data.objects)
    def palette(name, color, roughness):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = roughness
        materials[name] = mat
    palette('Boat_Timber', (.275, .153, .076), .70)
    palette('Boat_TimberHoney', (.350, .205, .100), .66)
    palette('Boat_TimberShade', (.215, .116, .052), .73)
    palette('Boat_WetKeel', (.18, .24, .23), .49)
    palette('Boat_PaintedBlue', (.39, .46, .435), .70)
    palette('Boat_PaintedBlueLight', (.47, .53, .49), .74)
    palette('Boat_PaintedBlueShade', (.28, .37, .36), .68)
    palette('Boat_EndGrain', (.245, .12, .053), .72)
    palette('Boat_Rope',(.38,.245,.12),.91)
    palette('Boat_LanternIron',(.075,.088,.078),.49)
    palette('Boat_LanternGlass',(.94,.53,.17),.26)
    palette('Boat_LanternFlame',(1,.64,.22),.35)
    palette('Boat_BookCover',(.27,.095,.055),.80)
    palette('Boat_BookGreen',(.16,.235,.18),.84)
    palette('Boat_Sprout',(.26,.36,.12),.83)
    palette('Boat_BookPages',(.69,.61,.43),.93)
    def rope(name, points, radius):
        """Keep the existing path/envelope; wrap the shared three-ply map."""
        data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D'
        data.bevel_depth=radius;data.bevel_resolution=1
        path=data.splines.new('POLY');path.points.add(len(points)-1)
        for point,position in zip(path.points,points):point.co=(*position,1)
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
        obj.data.materials.append(materials['Boat_Rope'])
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        bpy.ops.object.convert(target='MESH');obj.select_set(False)
        ring_size=len(obj.data.vertices)//len(points)
        distances=[0]
        for a,b in zip(points,points[1:]):distances.append(distances[-1]+(Vector(b)-Vector(a)).length)
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='SurfaceUV')
        uv.name='SurfaceUV'
        for face in obj.data.polygons:
            face.use_smooth=True
            around=[index%ring_size for index in face.vertices]
            seam=max(around)-min(around)>ring_size/2
            for loop in face.loop_indices:
                vertex=obj.data.loops[loop].vertex_index;ring,around=divmod(vertex,ring_size)
                uv.data[loop].uv=((around+(ring_size if seam and around==0 else 0))/ring_size,
                                  distances[ring]/.09)
        obj['boat_rope_uv']=True
        return obj
    glow=materials['Boat_LanternGlass'].node_tree.nodes.get('Principled BSDF')
    glow.inputs['Base Color'].default_value=(.94,.67,.33,.26)
    glow.inputs['Alpha'].default_value=.26
    glow.inputs['Roughness'].default_value=.18
    glow.inputs['Emission Color'].default_value=(1,.48,.12,1)
    glow.inputs['Emission Strength'].default_value=.025
    glass=materials['Boat_LanternGlass']
    glass.diffuse_color=(.94,.67,.33,.26)
    glass.surface_render_method='DITHERED'
    glass.use_backface_culling=False
    if hasattr(glass,'use_transparency_overlap'):glass.use_transparency_overlap=False
    flame=materials['Boat_LanternFlame'].node_tree.nodes.get('Principled BSDF')
    flame.inputs['Emission Color'].default_value=(1,.57,.16,1)
    flame.inputs['Emission Strength'].default_value=3.0
    materials['Boat_LanternIron'].node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.55

    # y, half beam, gunwale height. The broad stern and rounded shoulders give
    # the boat a readable belly at the homepage's elevated viewing angle.
    # Inferred from the reference top view: a definite, wider transom rather
    # than a second pointed end. Keep the pillow's y=-1.10 support unchanged.
    station_anchors = [(-1.70,.345,.64),(-1.53,.485,.60),(-1.30,.60,.565),
                (-1.02,.69,.54),(-.68,.75,.525),(-.28,.77,.52),
                (.12,.755,.525),(.48,.70,.545),(.82,.60,.58),
                (1.10,.50,.62),(1.34,.40,.665),(1.53,.275,.70),
                (1.68,.155,.72),(1.75,.065,.73)]
    # Shape-preserving cubic loft: keep the measured envelope and support
    # stations, but remove visible straight shoulders in the top/side views.
    # Harmonic tangent slopes stop the sheer and beam overshooting the anchors.
    def tangent(index, column):
        slopes = [(b[column]-a[column])/(b[0]-a[0])
                  for a,b in zip(station_anchors,station_anchors[1:])]
        if index==0:return slopes[0]
        if index==len(station_anchors)-1:return slopes[-1]
        left,right=slopes[index-1:index+1]
        return 0 if left*right<=0 else 2*left*right/(left+right)
    stations=[]
    for index,(a,b) in enumerate(zip(station_anchors,station_anchors[1:])):
        length=b[0]-a[0]
        for step in range(3):
            t=step/3; values=[a[0]+length*t]
            for column in [1,2]:
                values.append((2*t**3-3*t*t+1)*a[column]+(-2*t**3+3*t*t)*b[column]
                    +(t**3-2*t*t+t)*length*tangent(index,column)
                    +(t**3-t*t)*length*tangent(index+1,column))
            stations.append(tuple(values))
    stations.append(station_anchors[-1])
    count = len(stations)
    def keel_height(y):
        # Construction parameter before the below-floor lift in section().
        # Keeping this inverse profile fixes floor/seat heights and inner width.
        return -.14 + .17*(abs(y)/1.75)**5

    def section(station, level, inner=False):
        y,width,rim = station
        bottom = keel_height(y)
        # A round bilge carries its beam low in the hull; the upper side turns
        # inward very slightly rather than looking like a shallow straight tray.
        bilge = 1 + .032*math.sin(level*math.pi)**2*(1-.30*(abs(y)/1.75)**2)
        width *= (.22 + .78*math.sin(level*math.pi/2)**.70)*bilge
        z = bottom + (rim-bottom)*level
        if inner:
            width = max(.006,width-.040)
            z += .030*(1-level)
        # Inferred 40 mm shallowing only below the floor: preserve the broad
        # bilge and every surface/contact at z>=.145, instead of flattening the
        # complete section. The .166 floor bottom remains 21 mm above the join.
        if z<.145:
            z += .040*(.145-z)/(.145-bottom-(.030 if inner else 0))
        # The bottom ends tuck back under the overhanging rail; a vertical
        # end-wall makes a rounded wooden skiff read as a cut-off box.
        if y>.85:
            y-=.22*((y-.85)/.90)**1.6*(1-level)**.8
        elif y< -1.10:
            y+=.10*((-y-1.10)/.60)**1.3*(1-level)
        return width,y,z

    def solid(name, vertices, faces, mat, bevel=.006, inner_mat=None, face_materials=None, smooth_faces=None):
        obj = mesh(name,vertices,faces,mat)
        if inner_mat:
            obj.data.materials.append(materials[inner_mat])
        for i,face in enumerate(obj.data.polygons):
            if face_materials:face.material_index=face_materials[i]
            if smooth_faces and smooth_faces[i]:face.use_smooth=True
        bm=bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data); bm.free()
        if bevel:
            mod=obj.modifiers.new('Timber eased edges','BEVEL')
            mod.width=bevel; mod.segments=2
            obj.modifiers.new('Timber corner normals','WEIGHTED_NORMAL')
        return obj

    # Sprung plank seams, inferred from the reference side view. Their broad
    # sweep changes board widths by <=9 mm rather than adding random waviness.
    # Each shared boundary is evaluated once for both neighbouring boards.
    strake_levels=[0,.13,.285,.465,.65,.825,1]
    def plank_level(station, boundary):
        base=strake_levels[boundary]
        if boundary in [0,6]:return base
        y=station[0];along=(y+1.70)/3.45
        sweep=math.sin(math.pi*along)
        lean=(along-.46)*1.4
        return base+sweep*(lean*[0,-.008,.010,-.014,.012,-.006,0][boundary]
                           +[0,.003,-.005,.006,-.004,.002,0][boundary])

    # Real thickness strakes, merged by physical material at export.
    for side in [-1,1]:
        for row in range(6):
            vertices=[]
            for inner,fraction in [(False,0),(False,.5),(False,1),
                                   (True,0),(True,.5),(True,1)]:
                for station in stations:
                    lo=plank_level(station,row);hi=plank_level(station,row+1)
                    level=lo+(hi-lo)*fraction
                    x,y,z=section(station,level,inner)
                    z += .0017 if fraction==0 and row else -.0017 if fraction==1 and row<5 else 0
                    vertices.append((side*x,y,z))
            faces=[];face_materials=[];smooth_faces=[]
            for i in range(count-1):
                for j,(a,b) in enumerate([(0,count),(count,2*count),
                                          (4*count,3*count),(5*count,4*count),
                                          (3*count,0),(2*count,5*count)]):
                    faces.append((a+i,a+i+1,b+i+1,b+i))
                    face_materials.append(0 if j<2 else 1)
                    smooth_faces.append(j<4)
            for i in [0,count-1]:
                faces.append(tuple(r*count+i for r in [0,1,2,5,4,3]))
                face_materials.append(1);smooth_faces.append(False)
            lining=['Boat_TimberShade','Boat_TimberShade','Boat_TimberShade',
                    'Boat_Timber','Boat_Timber','Boat_TimberHoney'][row]
            plank=solid('BOAT_LongitudinalStrake',vertices,faces,
                  ['Boat_PaintedBlueShade','Boat_PaintedBlueShade','Boat_PaintedBlue','Boat_PaintedBlueLight','Boat_PaintedBlue','Boat_PaintedBlueLight'][row],
                  .004,lining,face_materials,smooth_faces)
            plank['boat_plank_atlas']=row+(6 if side>0 else 0)
        # A substantial timber rail caps the painted sides and reads at distance.
        vertices=[]
        rail_profile=[(-.031,-.029),(.029,-.029),(.036,-.026),(.040,-.020),
                      (.041,-.010),(.041,.016),(.038,.025),(.031,.030),
                      (.014,.033),(-.015,.033),(-.033,.030),(-.040,.025),
                      (-.043,.016),(-.043,-.010),(-.041,-.020),(-.037,-.026)]
        for dx,dz in rail_profile:
            vertices.extend((side*(width+dx),y,rim+dz) for y,width,rim in stations)
        faces=[]
        for i in range(count-1):
            for ring in range(len(rail_profile)):
                a,b=ring*count+i,((ring+1)%len(rail_profile))*count+i
                faces.append((a,a+1,b+1,b))
        faces.extend([tuple(r*count for r in range(len(rail_profile))),
                      tuple(r*count+count-1 for r in range(len(rail_profile)))])
        # Actual diagonal scarf joints replace the former dark lines laid on
        # an uninterrupted tube. Shared shape, 1.6 mm joint, closed end grain.
        joints=[None]+[station_anchors[i] for i in [2,4,7,10]]+[None]
        for piece,(start,end) in enumerate(zip(joints,joints[1:])):
            rail=solid('BOAT_EasedGunwale',vertices,faces,'Boat_TimberHoney',0)
            rail.data.materials.append(materials['Boat_EndGrain'])
            bm=bmesh.new();bm.from_mesh(rail.data)
            for joint,at_start in [(start,True),(end,False)]:
                if joint is None:continue
                y,width,_=joint
                normal=Vector((-.30*side,1,0)).normalized()
                center=Vector((side*width,y,0))+normal*(.0008 if at_start else -.0008)
                if at_start:normal=-normal
                bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                    dist=.000001,plane_co=center,plane_no=normal,clear_outer=True)
                caps=bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
                for face in caps.get('faces',[]):face.material_index=1
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
            for face in bm.faces:face.smooth=face.material_index==0 and len(face.verts)==4
            # Smooth along the sheer, split across the eased timber profile.
            # This keeps the 72 mm broad upper face readable as sawn wood.
            for edge in bm.edges:
                if len(edge.link_faces)==2:
                    edge.smooth=edge.calc_face_angle()<math.radians(28)
            bm.to_mesh(rail.data);bm.free()

    vertices=[]
    for side in [-1,1]:
        vertices.extend((side*section(s,0)[0],section(s,0)[1],section(s,0)[2]) for s in stations)
    solid('BOAT_RoundedKeel',vertices,[(i,i+1,count+i+1,count+i) for i in range(count-1)],'Boat_WetKeel',0)
    prow=[]
    for side,levels in [(-1,[1,.75,.5,.25,0]),(1,[0,.25,.5,.75,1])]:
        for level in levels:
            x,y,z=section(stations[-1],level);prow.append((side*x,y,z))
    pn=len(prow)
    solid('BOAT_RoundedStem',prow+[(x,y-.034,z) for x,y,z in prow],
          [tuple(range(pn)),tuple(reversed(range(pn,pn*2)))]+[(i,(i+1)%pn,(i+1)%pn+pn,i+pn) for i in range(pn)],
          'Boat_PaintedBlue',.006)
    stern=[]
    for side,levels in [(-1,[1,.75,.5,.25,0]),(1,[0,.25,.5,.75,1])]:
        for level in levels:
            x,y,z=section(stations[0],level);stern.append((side*x,y,z))
    n=len(stern)
    vertices=stern+[(x,y+.040,z+.012) for x,y,z in stern]
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    for index,(left,right,top_offset) in enumerate([(-.346,-.117,0),(-.113,.113,.004),(.117,.346,-.003)]):
        board=solid('BOAT_SternTransom',vertices,faces,'Boat_PaintedBlue',.004,
              'Boat_Timber',[0]+[1]*(len(faces)-1))
        board['boat_plank_atlas']=9+index
        board.data.materials.append(materials['Boat_EndGrain'])
        bm=bmesh.new();bm.from_mesh(board.data)
        for boundary,normal in [(left,(-1,0,0)),(right,(1,0,0))]:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                dist=.000001,plane_co=(boundary,0,0),plane_no=normal,clear_outer=True)
        caps=bmesh.ops.holes_fill(bm,edges=[edge for edge in bm.edges if edge.is_boundary],sides=0)
        for face in caps.get('faces',[]):face.material_index=2
        for vertex in bm.verts:
            upper=max(0,min(1,(vertex.co.z-.36)/.28))
            camber=-.026*max(0,1-(vertex.co.x/.35)**2)
            vertex.co.z+=top_offset*max(0,min(1,(vertex.co.z-.06)/.58))+camber*upper
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(board.data);bm.free()
    # An eased, shallow saddle follows the transom instead of a straight block.
    stern_rail=cube('BOAT_SternRail',(0,-1.70,.646),(.764,.074,.062),'Boat_TimberHoney',.008)
    bpy.context.view_layer.objects.active=stern_rail
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bm=bmesh.new();bm.from_mesh(stern_rail.data)
    bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=10,use_grid_fill=True)
    for vertex in bm.verts:
        vertex.co.z-=.026*max(0,1-(vertex.co.x/.35)**2)
    bm.to_mesh(stern_rail.data);bm.free()
    # The timber follows the actual carved stem, from the keel to the rail.
    # Its lower end beds into the hull instead of leaving a separate prong.
    stem_profile=[]
    for level,width in [(0,.013),(.08,.016),(.20,.021),(.36,.025),(.54,.028),(.72,.031),(.89,.032),(1,.030)]:
        _,bow_y,z=section(stations[-1],level)
        stem_profile.append((bow_y-.003,z,width,.015+.005*level))
    stem_profile.extend([(1.749,.754,.027,.018),(1.747,.765,.021,.014)])
    vertices=[]
    stem_sides=12
    for y,z,width,depth in stem_profile:
        for index in range(stem_sides):
            angle=index/stem_sides*math.tau
            vertices.append((math.cos(angle)*width,y+math.sin(angle)*depth,z))
    faces=[tuple(reversed(range(stem_sides)))]
    for row in range(len(stem_profile)-1):
        for index in range(stem_sides):
            a=row*stem_sides+index;b=row*stem_sides+(index+1)%stem_sides
            faces.append((a,b,b+stem_sides,a+stem_sides))
    faces.append(tuple(range((len(stem_profile)-1)*stem_sides,len(stem_profile)*stem_sides)))
    solid('BOAT_StemTimber',vertices,faces,'Boat_TimberShade',.002,
          smooth_faces=[False]+[True]*(len(faces)-2)+[False])
    # Short, isolated end checks, inferred from the concept's worn end timbers.
    # No silhouette noise or repeating cracks across the long side planks.
    for x,points in [(-.214,[(0,.635),(.002,.622),(-.001,.607)]),
                     (.107,[(0,.647),(-.002,.634),(.001,.615)])]:
        curve('BOAT_TransomEndCheck',[(x+dx,-1.655,z) for dx,z in points],.0014,'Boat_EndGrain')
    curve('BOAT_StemEndCheck',[(.005,1.765,.755),(.007,1.767,.742),
          (.004,1.766,.723)],.0011,'Boat_EndGrain')
    # Small forged nail heads share one mesh/material. Sparse staggered fixings
    # mark construction without turning every plank into a repeated dotted grid.
    nail_vertices=[];nail_faces=[]
    for side in [-1,1]:
        for row,(level,anchors) in enumerate([(.38,[1,6,11]),(.73,[2,5,9,12]),(.92,[1,4,8,11])]):
            for anchor_index in anchors:
                station=list(station_anchors[anchor_index])
                station[0]+=(row-1)*.022
                x,y,z=section(station,level)
                x0,_,z0=section(station,level-.005)
                x1,_,z1=section(station,level+.005)
                normal=Vector((side*(z1-z0),0,-(x1-x0))).normalized()
                along=Vector((0,1,0));across=normal.cross(along).normalized()
                centre=Vector((side*x,y,z))+normal*.0008
                start=len(nail_vertices)
                for depth,radius in [(0,.0052),(.0012,.0042)]:
                    for index in range(8):
                        a=index/8*math.tau
                        nail_vertices.append(centre+normal*depth+
                            (along*math.cos(a)+across*math.sin(a))*radius)
                for index in range(8):
                    j=(index+1)%8
                    nail_faces.append((start+index,start+j,start+8+j,start+8+index))
                nail_faces.append(tuple(start+8+index for index in range(8)))
    solid('BOAT_PlankFastenings',nail_vertices,nail_faces,'Boat_LanternIron',0)

    # Clip each floorboard to the actual inner chine with Blender's BMesh.
    # Rectangular boards would pierce the narrowing bow at their outside corners.
    floor_edge=[]
    for station in stations[1:-1]:
        y,width,rim=station
        bottom=keel_height(y)
        level=max(0,min(1,(.166-bottom-.030)/(rim-bottom-.030)))
        w,yy,_=section(station,level,True)
        floor_edge.append((w-.009,yy))
    outline=[(-w,y) for w,y in floor_edge]+[(w,y) for w,y in reversed(floor_edge)]
    n=len(outline)
    for i,x in enumerate([-.50,-.357,-.214,-.071,.071,.214,.357,.50]):
        vertices=[(px,py,z) for z in [.166,.204] for px,py in outline]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces.extend((j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n))
        board=solid('BOAT_Floorboard',vertices,faces,
                    'Boat_TimberShade' if i in [0,6] else 'Boat_Timber',.0025)
        bm=bmesh.new(); bm.from_mesh(board.data)
        for boundary,normal in [(x-.0695,(-1,0,0)),(x+.0695,(1,0,0))]:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                dist=.000001,plane_co=(boundary,0,0),plane_no=normal,clear_outer=True)
        bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(board.data); bm.free()
    def inner_width(y,z):
        cut=[]
        for station in stations:
            bottom=keel_height(station[0])
            level=max(0,min(1,(z-bottom-.030)/(station[2]-bottom-.030)))
            w,yy,_=section(station,level,True);cut.append((yy,w))
        for first,second in zip(cut,cut[1:]):
            if first[0]<=y<=second[0]:
                t=(y-first[0])/(second[0]-first[0])
                return max(.005,first[1]*(1-t)+second[1]*t-.008)
        return .005

    # Seats and supporting knees follow the sloping inner hull at every corner.
    # Width at the rail is not the width at the bottom of a timber bracket.
    for y,width,depth,top in [(-1.10,1.30,.23,.40),(.23,1.46,.22,.37),(1.16,.98,.23,.44)]:
        vertices=[]
        for z in [top-.07,top]:
            for yy in [y-depth/2,y+depth/2]:
                w=min(width/2,inner_width(yy,z))
                vertices.extend([(-w,yy,z),(w,yy,z)])
        solid('BOAT_Thwart',vertices,[(0,2,3,1),(4,5,7,6),(0,1,5,4),
              (2,6,7,3),(0,4,6,2),(1,3,7,5)],'Boat_TimberHoney',.006)
        for side in [-1,1]:
            vertices=[]
            for z in [top-.16,top-.055]:
                for yy in [y-depth*.28,y+depth*.28]:
                    outside=min(width/2-.025,inner_width(yy,z)-.012)
                    vertices.extend([(side*(outside-.055),yy,z),(side*outside,yy,z)])
            solid('BOAT_SeatKnee',vertices,[(0,2,3,1),(4,5,7,6),(0,1,5,4),
                  (2,6,7,3),(0,4,6,2),(1,3,7,5)],'Boat_TimberShade',.004)
    # Sawn frames follow the inner planks and stop against the underside of
    # the rail. A broad face at each frame catches the warm light above the
    # darker footwell. Their feet land outside the passenger's foot space.
    for station_index in (2,4,7,10):
        station = station_anchors[station_index]
        for side in (-1,1):
            vertices = []
            for row in range(11):
                t = row/10
                z = .198 + (station[2]-.198-.017)*t
                y = station[0] + .026*(1-t)**2
                half_width = .035 - .011*t
                frame_depth = .031 + .016*(1-t)**2
                for edge, thickness in ((-1,0),(1,0),(1,frame_depth),(-1,frame_depth)):
                    yy = y + edge*half_width
                    x = inner_width(yy,z) + .014 - thickness
                    vertices.append((side*x,yy,z))
            faces = [(3,2,1,0)]
            for row in range(10):
                for corner in range(4):
                    start, end = row*4+corner,row*4+(corner+1)%4
                    faces.append((start,end,end+4,start+4))
            faces.append((40,41,42,43))
            solid('BOAT_InteriorFrame',vertices,faces,'Boat_TimberHoney',.003)
    solid('BOAT_BowBreastHook',[(-.205,1.48,.685),(.205,1.48,.685),(0,1.72,.722),
          (-.205,1.48,.635),(.205,1.48,.635),(0,1.72,.672)],
          [(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],'Boat_EndGrain')
    # The concept's hanging lantern and stored belongings establish scale and
    # make the skiff read as a small lived-in boat. All stay inside its envelope.
    cube('BOAT_LanternPost',(-.295,1.42,.756),(.065,.065,.35),'Boat_TimberShade',.007)
    cube('BOAT_LanternPostEnd',(-.295,1.42,.934),(.070,.070,.015),'Boat_EndGrain',.004)
    post_lashing=[]
    for index in range(91):
        t=index/90;a=t*math.tau*3
        post_lashing.append((-.295+.052*math.cos(a),1.42+.052*math.sin(a),.80+t*.060))
    rope('BOAT_BowPostLashing',post_lashing,.011)
    rope('BOAT_BowLashingTail',[(-.24,1.42,.83),(-.23,1.38,.80),(-.24,1.37,.75),
          (-.29,1.38,.74),(-.32,1.39,.78),(-.29,1.40,.80),(-.24,1.39,.77),
          (-.21,1.40,.64),(-.22,1.43,.58)],.010)
    curve('BOAT_LanternHook',[(-.295,1.42,.91),(-.34,1.42,.94),(-.43,1.42,.92),(-.44,1.42,.82)],.012,'Boat_LanternIron')
    curve('BOAT_LanternBail',[(-.495,1.42,.58),(-.50,1.42,.70),(-.44,1.42,.82),(-.38,1.42,.70),(-.385,1.42,.58)],.007,'Boat_LanternIron')
    # Six thin glass panes remain open at top and bottom; there is no opaque
    # emissive cylinder or full glass cap hiding the independent warm core.
    panes=[(-.44+.074*math.cos(index/6*math.tau),
            1.42+.074*math.sin(index/6*math.tau),z)
           for z in [.333,.530] for index in range(6)]
    solid('BOAT_LanternGlassPanes',panes,
          [(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)],'Boat_LanternGlass',0)
    rod('BOAT_LanternBurner',(-.44,1.42,.330),(-.44,1.42,.360),.023,
          'Boat_LanternIron',tip=.018,vertices=8)
    rod('BOAT_LanternWick',(-.44,1.42,.358),(-.44,1.42,.377),.0035,
          'Boat_LanternIron',vertices=6)
    fire=ball('BOAT_LanternFlame',(-.44,1.42,.403),(.020,.020,.047),
              'Boat_LanternFlame',segments=10,rings=6)
    for vertex in fire.data.vertices:
        if vertex.co.z>0:vertex.co.x+=.19*vertex.co.z**2
    rod('BOAT_LanternFoot',(-.44,1.42,.297),(-.44,1.42,.33),.094,'Boat_LanternIron',tip=.082,vertices=16)
    rod('BOAT_LanternRoofLip',(-.44,1.42,.527),(-.44,1.42,.543),.100,'Boat_LanternIron',vertices=12)
    rod('BOAT_LanternRoof',(-.44,1.42,.543),(-.44,1.42,.580),.096,'Boat_LanternIron',tip=.046,vertices=12)
    rod('BOAT_LanternChimney',(-.44,1.42,.578),(-.44,1.42,.603),.033,'Boat_LanternIron',tip=.028,vertices=12)
    for zz in [.333,.525]:
        curve('BOAT_LanternCageBand',[(-.44+.080*math.cos(i/24*math.tau),
              1.42+.080*math.sin(i/24*math.tau),zz) for i in range(24)],.0055,'Boat_LanternIron',True)
    for i in range(6):
        a=i/6*math.tau;x=-.44+math.cos(a)*.077;y=1.42+math.sin(a)*.077
        rod('BOAT_LanternFrame',(x,y,.326),(x,y,.542),.0055,'Boat_LanternIron',vertices=6)
        b=(i+1)/6*math.tau
        x1,y1=-.44+math.cos(b)*.077,1.42+math.sin(b)*.077
        if i%2==0:
            curve('BOAT_LanternCross',[(x,y,.343),((x+x1)/2,(y+y1)/2,.431),
                  (x1,y1,.517)],.0038,'Boat_LanternIron')
            curve('BOAT_LanternCross',[(x1,y1,.343),((x+x1)/2,(y+y1)/2,.431),
                  (x,y,.517)],.0038,'Boat_LanternIron')
    for i in range(3):
        z=.208+i*.047;angle=(-.08+i*.09)
        cover='Boat_BookGreen' if i==1 else 'Boat_BookCover'
        def book_at(x,y,zz):
            return (.17+x*math.cos(angle)-y*math.sin(angle),
                    -1.32+x*math.sin(angle)+y*math.cos(angle),zz)
        cube('BOAT_BookPages',book_at(.004,0,z+.022),(.20,.28,.034),'Boat_BookPages',.004,(0,0,angle))
        for zz in [z,z+.043]:
            cube('BOAT_BookCover',(.17,-1.32,zz),(.216,.296,.008),cover,.003,(0,0,angle))
        # Restrained blind tooling follows the cover construction; the upper
        # book remains readable as a handled clothbound object at top view.
        if i==2:
            for inset in [.015,.020]:
                curve('BOAT_BookCoverTooling',[book_at(xx,yy,z+.0475) for xx,yy in
                    [(-.108+inset,-.148+inset),(.108-inset,-.148+inset),
                     (.108-inset,.148-inset),(-.108+inset,.148-inset)]],
                    .0009,'Boat_TimberHoney',True)
            curve('BOAT_BookCoverSprig',[book_at(-.028,-.032,z+.049),book_at(0,.008,z+.049),
                  book_at(.028,.046,z+.049)],.0016,'Boat_Sprout')
            for xx,yy,dx,dy in [(-.010,-.006,-.023,.004),(.010,.022,.024,-.003)]:
                root=Vector(book_at(xx,yy,z+.050));tip=Vector(book_at(xx+dx,yy+dy,z+.052))
                mid=(root+tip)/2
                solid('BOAT_BookPressedLeaf',[root,mid+Vector((.004,.008,0)),tip,
                      mid-Vector((.004,.008,0))],[(0,1,2,3)],'Boat_Sprout',0)
        cube('BOAT_BookSpine',book_at(-.101,0,z+.021),(.018,.294,.043),cover,.006,(0,0,angle))
        for yy in [-.094,.094]:
            cube('BOAT_SpineRaisedBand',book_at(-.111,yy,z+.022),(.006,.015,.030),'Boat_TimberHoney',.002,(0,0,angle))
        # Three page signatures on the fore edge read as paper rather than a
        # single solid white brick; these are shallow, not loose page sheets.
        for zz in [z+.013,z+.023,z+.032]:
            curve('BOAT_PageSignature',[book_at(.105,-.128,zz),book_at(.105,.128,zz)],.0012,'Boat_TimberShade')
    # Inferred exact sprout/box dimensions from the stern detail of the concept.
    # It sits on the transom cap and remains outside the pillow support region.
    cube('BOAT_SeedBox',(.18,-1.65,.719),(.165,.14,.105),'Boat_Timber',.008)
    cube('BOAT_SeedBoxRim',(.18,-1.65,.775),(.177,.152,.019),'Boat_TimberHoney',.005)
    cube('BOAT_SeedBoxSoil',(.18,-1.65,.786),(.139,.115,.008),'Boat_EndGrain',.0015)
    curve('BOAT_SeedlingStem',[(.18,-1.65,.787),(.185,-1.65,.838),(.201,-1.65,.891)],.004,'Boat_Sprout')
    for side in [-1,1]:
        root=Vector((.187,-1.65,.844));tip=root+Vector((side*.063,.012*side,.041))
        mid=(root+tip)/2+Vector((0,0,.012));across=Vector((0,.020,0))
        leaf=solid('BOAT_SeedlingLeaf',[root,mid+across,tip,mid-across,mid+Vector((0,0,.008))],
              [(0,1,4),(1,2,4),(2,3,4),(3,0,4)],'Boat_Sprout',0)
        leaf.data.materials[0].use_backface_culling=False
    coil=[]
    for i in range(180):
        t=i/179;a=t*math.tau*4.2;r=.025+.105*t
        coil.append((.49+math.cos(a)*r,-.08+math.sin(a)*r,.225+.004*math.sin(a*2)))
    rope('BOAT_MooringCoil',coil,.012)
    rope('BOAT_MooringEnd',[(.60,-.08,.23),(.64,.02,.24),(.69,.14,.37),(.731,.20,.54),(.73,.28,.56)],.012)
    rail_lashing=[]
    for index in range(81):
        t=index/80;a=t*math.tau*3.5
        rail_lashing.append((.748+.056*math.cos(a),.18+t*.105,.534+.050*math.sin(a)))
    rope('BOAT_GunwaleLashing',rail_lashing,.0105)
    rope('BOAT_GunwaleKnot',[(.795,.27,.54),(.812,.29,.56),(.792,.31,.58),
          (.772,.29,.56),(.797,.27,.54),(.814,.30,.50),(.800,.33,.46),(.784,.34,.455)],.0105)
    # The resting oar sits in a forged cradle. Shorten the inboard handle and
    # preserve the diagonal and outer footprint that read from the pond camera.
    lift=.054
    def shaft_at(x):
        t=(x-.36)/(.695)
        return Vector((-x,-.05+.444*t,.684-.226*t+lift))
    near,far=shaft_at(.471),shaft_at(1.055)
    axis=(far-near).normalized()
    across=Vector((-axis.y,axis.x,0)).normalized()
    up=axis.cross(across).normalized()
    rod('BOAT_OarShaft',near,far,.022,'Boat_TimberHoney',tip=.018,vertices=16)
    rod('BOAT_OarGrip',shaft_at(.418),shaft_at(.514),.028,'Boat_TimberShade',tip=.025,vertices=16)
    axle=shaft_at(.747)
    cradle_radius=.0267
    fork=[]
    for i in range(15):
        angle=.19-(math.pi+.38)*i/14
        fork.append(axle+cradle_radius*(math.cos(angle)*across+math.sin(angle)*up))
    iron='Boat_LanternIron'
    curve('BOAT_OarlockFork',fork,.0072,iron)
    saddle=axle-cradle_radius*up
    a,b=next((a,b) for a,b in zip(stations,stations[1:]) if a[0]<=saddle.y<=b[0])
    rail=a[2]+(b[2]-a[2])*(saddle.y-a[0])/(b[0]-a[0])+.033
    rod('BOAT_OarlockSocket',(saddle.x,saddle.y,rail-.018),(saddle.x,saddle.y,rail+.010),.027,iron,tip=.025,vertices=10)
    rod('BOAT_OarlockPin',(saddle.x,saddle.y,rail+.005),saddle,.012,iron,tip=.010,vertices=8)
    # Leaf-shaped blade: a long tapered throat, broad working face and rounded
    # toe. Camber is thickest on its centre rib and fades towards both ends.
    centre=[(1.025,.375,.466,.020),(1.075,.407,.436,.030),(1.13,.442,.403,.059),
            (1.205,.490,.358,.090),(1.29,.544,.307,.113),
            (1.365,.592,.262,.117),(1.425,.630,.226,.102),
            (1.470,.659,.199,.065),(1.489,.671,.188,.018)]
    across=Vector((.514,.805,0)).normalized()
    normal=Vector((-.805,.514,-.262)).cross(across).normalized();vertices=[]
    for index,(x,y,z,w) in enumerate(centre):
        thickness=.007+.009*math.sin(index/(len(centre)-1)*math.pi)
        for i in range(12):
            a=i/12*math.tau
            vertices.append(Vector((-x,y,z+lift))+across*(w*math.cos(a))+normal*(thickness*math.sin(a)))
    faces=[tuple(reversed(range(12)))]
    for r in range(len(centre)-1):
        for j in range(12):
            a=r*12+j;b=r*12+(j+1)%12;faces.append((a,b,b+12,a+12))
    faces.append(tuple(range((len(centre)-1)*12,len(centre)*12)))
    paddle=solid('BOAT_OarBlade',vertices,faces,'Boat_Timber',.003)
    for face in paddle.data.polygons:face.use_smooth=True
    objects=set(bpy.data.objects)-before
    for name in ['Boat_Timber','Boat_TimberHoney','Boat_TimberShade','Boat_EndGrain',
                 'Boat_PaintedBlue','Boat_PaintedBlueLight','Boat_PaintedBlueShade']:
        painted_surface(materials[name],kind='weathered_paint' if name.startswith('Boat_Painted') else 'wood',
                        size=1024 if name.startswith('Boat_Painted') else 512)
    painted_surface(materials['Boat_Rope'],kind='rope',size=256)
    bpy.context.view_layer.update()
    for obj in objects:
        tuck_hull_ends(obj)
        obj['pond_boat_part']=True
        if not obj.get('boat_rope_uv'):
            project_surface_uv(obj,across=obj.name.startswith(('BOAT_Thwart','BOAT_SternTransom')))
    return objects


def tuck_hull_ends(obj):
    """Ease in the unloaded tips while retaining the seats and fittings amidships."""
    if obj.type != 'MESH':
        return
    world = obj.matrix_world
    local = world.inverted()
    for vertex in obj.data.vertices:
        point = world @ vertex.co
        end = (-point.y-1.22)/.48 if point.y<0 else (point.y-1.28)/.48
        if end<=0:
            continue
        taper = min(1,end)**2
        point.y -= math.copysign(.078*taper,point.y)
        point.z += .023*taper*min(1,max(0,(point.z-.40)/.25))
        vertex.co = local @ point
    obj.data.update()
