"""A posed cotton garment with a connected shoulder/sleeve volume.

Blender's voxel union only resolves the intersections. Openings, drape and thin
cloth edges are authored afterwards, so it is not a pile of rounded primitives.
"""
import bpy
import bmesh
import math


def smooth01(value):
    value=max(0,min(1,value))
    return value*value*(3-2*value)


def tension_fold(x,y,start,end,curve,width,depth,roll):
    """A finite, curved valley with a wider lip on its slack side."""
    t=(x-start)/(end-start)
    if not 0<t<1:return 0
    # C1 run-in/out keeps the fold ends from becoming small knots.
    envelope=smooth01(t/.28)*smooth01((1-t)/.28)
    line=curve[0]+curve[1]*x+curve[2]*x*x
    distance=y-line
    valley=-depth*math.exp(-(distance/width)**2)
    lip=roll*math.exp(-((distance-width*1.65)/(width*1.55))**2)
    return envelope*(valley+lip)


def build_garment(loft, tube):
    torso = loft('CH_ConnectedCottonTee', [
        (-.68,.12,.671,.078),(-.59,.205,.658,.130),
        # Inferred from the front sheet: narrower body under the same loose
        # sleeves. Chest -11%, waist -13%, hem -12%; no uniform object scale.
        # Keep the same underside on the bedding while lowering the excessive
        # front inflation by 6--10 mm. The hip still carries loose cotton.
        (-.43,.237,.641,.152),(-.28,.234,.632,.152),
        (-.09,.218,.618,.145),(.07,.226,.616,.145),
        (.20,.252,.612,.139),(.31,.258,.603,.125),
    ], 'CH_Cloth', sides=32, samples=4)
    parts=[torso]
    for side in [-1,1]:
        parts.append(tube('CH_CottonSleeve',[
            (side*.215,-.425,.662,.131),(side*.30,-.466,.675,.119),
            (side*.386,-.509,.681,.103),(side*.439,-.539,.683,.102),
        ],'CH_Cloth',sides=24,samples=4))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.context.view_layer.objects.active=torso
    bpy.ops.object.join()
    union=torso.modifiers.new('Connected garment topology','REMESH')
    union.mode='VOXEL'; union.voxel_size=.010; union.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=union.name)
    relax=torso.modifiers.new('Shoulder transitions','SMOOTH')
    relax.factor=.4; relax.iterations=3
    bpy.ops.object.modifier_apply(modifier=relax.name)
    bm=bmesh.new(); bm.from_mesh(torso.data)
    # The intersecting lofts leave a small voxel stair-step only at the
    # shoulder/sleeve saddle. Fair that unsculpted join locally, before adding
    # any authored cotton folds; the chest, collar and cuffs remain outside.
    join_weights={v:math.exp(-((abs(v.co.x)-.250)/.062)**4)
                    *smooth01((v.co.y+.575)/.055)
                    *smooth01((-.305-v.co.y)/.055)
                    *smooth01((v.co.z-.600)/.050)
                  for v in bm.verts}
    for _ in range(5):
        fair={}
        for v,weight in join_weights.items():
            if weight<.005 or not v.link_edges:continue
            average=sum((e.other_vert(v).co for e in v.link_edges),v.co*0)/len(v.link_edges)
            fair[v]=v.co.lerp(average,.42*weight)
        for v,point in fair.items():v.co=point
    # Cut across the posed sleeve axes; global-X cuts made the turned sleeve
    # openings read as thick upright walls. Dimensions inferred from the tee.
    for co,no in [((.418,-.527,.682),(.90,-.44,.02)),
                  ((-.418,-.527,.682),(-.90,-.44,.02)),((0,.277,0),(0,1,0))]:
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=.00001,plane_co=co,plane_no=no,clear_outer=True)
    neck=[]
    for face in bm.faces:
        p=face.calc_center_median()
        if (p.x/.085)**2+((p.y+.587)/.067)**2<1: neck.append(face)
    bmesh.ops.delete(bm,geom=neck,context='FACES')
    # A round opening and actual sleeves, rather than a hole painted on a board.
    for v in bm.verts:
        x,y,z=v.co
        near=(x/.085)**2+((y+.587)/.067)**2
        if v.is_boundary and .65<near<1.50 and y<-.42:
            r=math.sqrt(near);v.co.x=x/r;v.co.y=-.587+(y+.587)/r
        # Shape the upper drape across ribs, waist and hip without lifting
        # its underside from the existing support. Collar and sleeves stay out
        # of this field. Width changes above provide the matching side contour.
        if -.43<y<.22 and abs(x)<.255:
            top=max(0,min(1,(z-.625)/.125));top=top*top*(3-2*top)
            edge=max(0,min(1,(.255-abs(x))/.075));edge=edge*edge*(3-2*edge)
            chest=.006*math.exp(-((y+.265)/.135)**2)
            waist=.008*math.exp(-((y-.012)/.120)**2)
            shoulder_fade=smooth01((y+.43)/.045)
            v.co.z+=(chest-waist)*top*edge*shoulder_fade
        # Raised arms pull diagonally across the front; the cloth collects at
        # the turned waist. These four unequal, finite folds leave the centre
        # chest quiet instead of making parallel ripples across the whole tee.
        # 13--21 mm valleys / 8--12 mm lips are inferred large-scale drape, and
        # intentionally survive the 280 x 200 concept-camera review.
        if z>.65 and -.46<y<.28 and abs(x)<.29:
            front=smooth01((z-.65)/.095)
            side_fade=smooth01((.285-abs(x))/.045)
            folds=tension_fold(x,y,-.25,.060,(-.275,.66,.30),.021,.021,.010)
            folds+=tension_fold(x,y,.035,.260,(-.168,-.88,.30),.019,.020,.011)
            folds+=tension_fold(x,y,-.255,.115,(.108,.43,-.18),.024,.019,.012)
            folds+=tension_fold(x,y,.025,.255,(.200,-.79,.14),.021,.016,.009)
            # A shorter compression tuck beside the left side seam terminates
            # before the embroidery and varies the distance between creases.
            folds+=tension_fold(x,y,-.258,-.080,(-.040,.52,.10),.016,.013,.008)
            v.co.z+=folds*front*side_fade
            # The unstrained centre settles toward the body, not into a pillow.
            v.co.z-=.005*math.exp(-(x/.15)**4)*front
        if abs(x)>.230 and y<-.320:
            side=1 if x>0 else -1
            along=(abs(x)-.245)/.18
            cuff=max(0,min(1,along))
            # Every sleeve displacement, including the shoulder depression,
            # enters continuously across the torso rather than switching on
            # by 5 mm at a voxel-dependent X/Y threshold.
            sleeve_fade=smooth01((abs(x)-.230)/.055)*smooth01((-.320-y)/.055)
            slack=cuff*cuff*(3-2*cuff)
            # The raised upper arm holds the top of the cotton; the lower half
            # hangs away from it. A 15--21 mm broad sag changes the sleeve volume
            # and its open rim, rather than drawing wrinkles on a rigid tube.
            # Its amount/asymmetry is inferred from the relaxed reference pose.
            axis_z=.668+.014*cuff
            lower=max(0,min(1,(axis_z+.025-z)/.105))
            lower=lower*lower*(3-2*lower)
            v.co.z-=(.018+side*.003)*slack*lower*sleeve_fade
            v.co.y+=(.010-side*.002)*slack*lower*sleeve_fade
            # Two broad oblique compressions interrupt the tubular highlight.
            # Their unequal paths/dimensions follow the arm direction rather
            # than forming evenly spaced rings or a thick stuffed cuff.
            upper=smooth01((z-.66)/.075)
            side_shift=.008*side
            crease=math.exp(-((y+.437+along*.086+side_shift)/.020)**2)
            roll=math.exp(-((y+.407+along*.086+side_shift)/.032)**2)
            shoulder=math.sin(cuff*math.pi)**.75*sleeve_fade
            v.co.z+=(.011*roll-.017*crease)*upper*shoulder
            second=math.exp(-((y+.518-along*.021-side_shift)/.018)**2)
            v.co.z-=.008*second*upper*shoulder
            v.co.z-=.005*math.exp(-((abs(x)-.265)/.075)**2)*upper*sleeve_fade
            # Unequal radial slack gives the open rim a cloth outline. The
            # displacement is at most 6 mm against the original >21 mm arm gap.
            rim=smooth01((cuff-.42)/.58)*sleeve_fade
            angle=math.atan2(z-axis_z,(y+.510+along*.035))
            radial=.0045*math.sin(angle*3+side*.8)+.0015*math.sin(angle*2-.4)
            cuff_depth=(abs(x)-.418)*.90-(y+.527)*.44+(z-.682)*.02
            radial+=.0035*math.exp(-((cuff_depth+.010)/.010)**2)
            v.co.y+=radial*math.cos(angle)*rim
            v.co.z+=radial*math.sin(angle)*rim
            if v.is_boundary:
                # Only a broad, uneven turned edge; the arm still exits the
                # original bisected opening and SOLIDIFY retains its 3 mm rim.
                v.co.x+=side*.004*math.sin((y+.52)*24+.5)
                v.co.z+=.003*math.cos((y+.52)*24+side*.7)
        if y>.17:
            hem=smooth01((y-.17)/.107)
            # The hem falls slightly farther on the left and turns upward at
            # the compressed right hip. This is a 10--18 mm outline variation,
            # not a straight cut with a displacement texture on top.
            v.co.z+=(.011*math.sin(x*15+.6)+.004*math.sin(x*30-.4))*hem
            v.co.y+=(.018*math.sin(x*12-.5)+.006*math.sin(x*27+.9))*hem
            # The turned cotton edge is a narrow geometry roll, retaining the
            # existing 3 mm rim. Its underside remains on the same support.
            if z>.65:
                lip=.0045*math.exp(-((y-.266)/.010)**2)
                tuck=.0020*math.exp(-((y-.246)/.014)**2)
                v.co.z+=(lip-tuck)*smooth01((z-.65)/.07)
        # Loose cloth rests across a slightly turned ribcage, then spreads over
        # the hips. This changes the large silhouette, not only its surface.
        v.co.x+=.017*math.sin((y+.64)*2.6)
        v.co.z+=x*.045*math.sin((y+.64)*3.1)
    # The lower sleeve/torso saddle has a small convex voxel cusp, visible at
    # cloth-camera pixel (550,345), world (.278,-.330,.622) after settling.
    # Fair just that underside in the unturned frame. It is below the chest
    # folds and far inside the cuffs; boundary/support vertices stay authored.
    saddle_weights={}
    for v in bm.verts:
        if v.is_boundary:continue
        x,y,z=v.co
        unturned_x=x-.017*math.sin((y+.64)*2.6)
        unturned_z=z-unturned_x*.045*math.sin((y+.64)*3.1)
        radius=((abs(unturned_x)-.266)/.037)**2+((y+.331)/.040)**2+((unturned_z-.632)/.045)**2
        if radius<2.5:saddle_weights[v]=math.exp(-radius*2)
    for _ in range(6):
        fair={}
        for v,weight in saddle_weights.items():
            average=sum((e.other_vert(v).co for e in v.link_edges),v.co*0)/len(v.link_edges)
            fair[v]=v.co.lerp(average,.40*weight)
        for v,point in fair.items():v.co=point
    # Voxel/bisect intersections have uneven edge spacing. Relax only the two
    # sleeve boundary loops so the thin turned edge is soft, not saw-toothed;
    # collar and hem coordinates stay authored by their own fields above.
    for _ in range(3):
        softened={}
        for v in bm.verts:
            if not v.is_boundary or abs(v.co.x)<.30 or v.co.y>-.38:continue
            neighbours=[e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(neighbours)==2:
                average=(neighbours[0].co+neighbours[1].co)*.5
                softened[v]=v.co.lerp(average,.40)
        for v,point in softened.items():v.co=point
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(torso.data);bm.free()
    thickness=torso.modifiers.new('Cotton is a thin shell','SOLIDIFY')
    thickness.thickness=.003;thickness.offset=-1
    thickness.use_rim_only=True
    for p in torso.data.polygons:p.use_smooth=True
    return torso
