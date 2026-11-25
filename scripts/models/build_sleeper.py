"""Independent build of the sleeper from the front and side concept panels.

Build the neutral and reclining versions from the same measured proportions.
Blender coordinates use metres and Z up. The neutral face points toward -Y.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from build_garment import tension_fold
from build_sleeper_body import (
    CORE_STATIONS, FOOT_ROW, HEAD_DROP, PIXEL, arm_sections, build_anatomy, build_exposed_skin,
    depth, leg_sections, neutral_z,
)
from surface_texture import painted_surface, project_surface_uv


# Front and side crops are on the same vertical scale. A few pixels of pose
# and perspective error remain in the illustrated sheet. Scale is set by the
# existing boat berth. The back of the skull and hidden limbs are inferred.
EYE_ROW = 151
HEAD_ROTATION = Matrix.Rotation(math.pi, 3, 'Z') @ Matrix.Rotation(-math.pi / 2, 3, 'X')
HEAD_REST = Vector((-.012, -.774, .866-HEAD_DROP))


# V14 face landmarks from the approved front. Row, half width, side front/back.
# The face stops widening near the temple. The lower stations trace the
# visible cheeks, jaw and chin instead of tapering a full ellipsoid.
HEAD_STATIONS = [
    (201, 5, 137, 128), (198, 17, 145, 102), (193, 32, 149, 79),
    (184, 43, 153, 68), (173, 49, 154, 55),
    (161, 54, 157, 47), (150, 58, 155, 40), (136, 61, 155, 34),
    (117, 65, 156, 29), (97, 66, 160, 26), (77, 61, 155, 35),
    (60, 49, 144, 46), (48, 29, 127, 66), (41, 2, 101, 96),
]

# The standing tee follows the front and profile sheets. In the boat the
# garment is laid over the posed ribcage and supported pelvis instead.
TORSO_STATIONS = [
    (404, 66, 143, 40),
    (376, 64, 139, 45),
    (344, 61, 133, 49),
    (314, 58, 129, 50),
    (280, 63, 131, 58),
    (251, 62, 129, 67),
    (230, 52, 126, 69),
    (217, 34, 120, 81),
    (215, 24, 114, 86),
]

SPRIG_SHAPES = [
    [(-.026,-.053),(-.021,-.056),(.026,.047),(.021,.048)],
    [(-.014,-.027),(-.042,-.021),(-.052,.008),(-.029,.000)],
    [(-.004,-.008),(.020,-.012),(.042,.008),(.019,.017)],
    [(.006,.012),(-.018,.030),(-.019,.053),(.005,.038)],
    [(.017,.030),(.031,.018),(.053,.032),(.034,.049)],
    [(.024,.044),(.021,.061),(.036,.075),(.043,.058)],
]


def head_z(row):
    return (EYE_ROW - row) * PIXEL


def smooth_step(value):
    t = max(0, min(1, value))
    return t * t * (3 - 2 * t)


def material(name, color, roughness):
    value = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.use_nodes = True
    shader = value.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return value


def make_materials():
    return {
        'skin': material('Sleeper_Skin', (.88, .55, .43), .64),
        'hair': material('Sleeper_Hair', (.073, .047, .038), .61),
        'hair_light': material('Sleeper_HairLight', (.092, .059, .047), .58),
        'lashes': material('Sleeper_Lashes', (.066, .029, .021), .80),
        'brows': material('Sleeper_Brows', (.088, .050, .039), .79),
        'lips': material('Sleeper_Lips', (.42, .235, .192), .83),
        'tee': material('Sleeper_Cotton', (.801, .729, .693), .85),
        'embroidery': material('Sleeper_Embroidery', (.255, .174, .121), .88),
        'shorts': material('Sleeper_Shorts', (.228, .225, .212), .89),
        'enamel': material('Sleeper_Enamel', (.76, .687, .598), .46),
        'pad': material('Sleeper_Earpad', (.345, .282, .232), .85),
    }


def interpolate(rows, steps=4):
    """Sample a Catmull–Rom spline without duplicating the section seams."""
    points = [Vector(row) for row in rows]
    result = []
    for i in range(len(points) - 1):
        a, b, c, d = [points[max(0, min(len(points) - 1, j))]
                      for j in (i - 1, i, i + 1, i + 2)]
        for step in range(steps):
            t = step / steps
            result.append((2*b + (c-a)*t + (2*a-5*b+4*c-d)*t*t
                           + (3*b-a-3*c+d)*t*t*t) * .5)
    return [*result, points[-1]]


def surface(collection, name, points, faces, color):
    data = bpy.data.meshes.new(name)
    data.from_pydata(points, [], faces)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    data.materials.append(color)
    for face in data.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj


def rings(collection, name, rows, color, closed=True, flow_uv=False):
    count = len(rows[0])
    faces = [tuple(reversed(range(count)))] if closed else []
    for row in range(len(rows) - 1):
        start = row * count
        for j in range(count):
            a, b = start + j, start + (j + 1) % count
            faces.append((a, b, b + count, a + count))
    if closed:
        faces.append(tuple(range((len(rows) - 1) * count, len(rows) * count)))
    obj = surface(collection, name, [vertex for row in rows for vertex in row], faces, color)
    if flow_uv:
        uv = obj.data.uv_layers.new(name='SurfaceUV')
        for polygon in obj.data.polygons:
            corners = [divmod(obj.data.loops[index].vertex_index,count) for index in polygon.loop_indices]
            wraps = max(column for _,column in corners)-min(column for _,column in corners)>count/2
            for index,(row,column) in zip(polygon.loop_indices,corners):
                u = column/count
                if len(corners)==count:
                    angle = u*math.tau
                    uv.data[index].uv = (.5+.47*math.cos(angle),.5+.47*math.sin(angle))
                else:
                    if wraps and u<.5:
                        u += 1
                    uv.data[index].uv = (u, row/(len(rows)-1))
    return obj


def sweep(collection, name, sections, color, *, across, sides=28, steps=4, closed=True, flow_uv=False,
          profile=None):
    """Loft flattened sections along a limb, garment or lock."""
    values = interpolate([section[:4] for section in sections], steps)
    depths = interpolate([(section[4], 0) for section in sections], steps)
    path = [Vector(value[:3]) for value in values]
    rows = []
    for i, (point, value, depth_pair) in enumerate(zip(path, values, depths)):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        u = across - tangent * across.dot(tangent)
        if u.length < .05:
            u = tangent.cross(Vector((0, 1, 0)))
        u.normalize()
        v = tangent.cross(u).normalized()
        width = max(.001, value.w)
        thickness = max(.001, depth_pair.x)
        if profile is None:
            rows.append([point + u * (width * math.cos(j / sides * math.tau))
                         + v * (thickness * math.sin(j / sides * math.tau))
                         for j in range(sides)])
        else:
            ring = []
            for j in range(sides):
                angle = j / sides * math.tau
                cu, sv = math.cos(angle), math.sin(angle)
                amount = profile(i/steps, cu, sv)
                ring.append(point + u*(width+amount)*cu + v*(thickness+amount)*sv)
            rows.append(ring)
    return rings(collection, name, rows, color, closed, flow_uv)


def profile_surface(collection, palette):
    """The head cross-sections share landmarks in the front and side panels."""
    x_sections = interpolate([(head_z(row), half_width * PIXEL, depth(front), depth(back))
                              for row, half_width, front, back in HEAD_STATIONS], 5)
    rows = []
    sides = 80
    for z, width, front, back in x_sections:
        nominal_side = .016 + .023 * smooth_step((z + .139) / .120)
        span = back-front
        # The nearly closed chin and crown are asymmetric. Their widest
        # section still has to lie between the anterior and posterior planes.
        side_depth = max(front+.27*span,min(back-.25*span,nominal_side))
        section = []
        for j in range(sides):
            angle = j / sides * math.tau
            # Increase sample density around the nose and lip without putting
            # the same number of loops into the concealed rear skin.
            if j >= sides // 2:
                angle -= .20 * math.sin(2 * (angle - 1.5 * math.pi))
            c, s = math.cos(angle), math.sin(angle)
            x = width * c
            y = side_depth + (back - side_depth) * s if s >= 0 else (
                side_depth + (front - side_depth) * (-s) ** 1.22
            )
            if s < 0:
                eyelid = math.exp(-((abs(x) - .104) / .055) ** 4)
                cheek = .012 * math.exp(-((abs(x) - .113) / .053)**2 - ((z + .046) / .041)**2)
                socket = -.007 * eyelid * math.exp(-((z - .033) / .027)**2)
                lid_rim = .0045 * eyelid * math.exp(-((z - .006) / .018)**2)
                bridge = .008 * math.exp(-(x / .029)**2 - ((z + .014) / .048)**2)
                nose = .020 * math.exp(-(x / .023)**2 - ((z + .039) / .023)**2)
                alae = .004 * math.exp(-((abs(x) - .018) / .012)**2 - ((z + .050) / .015)**2)
                upper_lip = .003 * math.exp(-(x / .034)**2 - ((z + .086) / .016)**2)
                lower_lip = .002 * math.exp(-(x / .030)**2 - ((z + .103) / .016)**2)
                y -= (-s) * (cheek + socket + lid_rim + bridge + nose + alae + upper_lip + lower_lip)
            section.append((x, y, z))
        rows.append(section)
    obj = rings(collection, 'Sleeper_Face', rows, palette['skin'])
    substrate = palette['skin'].copy()
    substrate.name = 'Sleeper_FacePigment'
    obj.data.materials[0] = substrate
    tint = obj.data.color_attributes.new(name='SkinTint', type='FLOAT_COLOR', domain='POINT')
    shader = substrate.node_tree.nodes.get('Principled BSDF')
    color = substrate.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = tint.name
    substrate.node_tree.links.new(color.outputs['Color'], shader.inputs['Base Color'])
    base = Vector(palette['skin'].diffuse_color[:3])
    warm = Vector((.934, .377, .323))
    for vertex in obj.data.vertices:
        x, y, z = vertex.co
        front = max(0, min(1, (-y - .07) / .078))
        flush = .77 * front * math.exp(-((abs(x) - .116) / .052)**2 - ((z + .043) / .045)**2)
        flush += .19 * front * math.exp(-(x / .031)**2 - ((z + .044) / .023)**2)
        flush += .19 * front * math.exp(-(x / .030)**2 - ((z + .099) / .014)**2)
        tint.data[vertex.index].color = (*base.lerp(warm, flush), 1)
    return obj


def face_marks(collection, face, palette):
    volume = BVHTree.FromPolygons([v.co for v in face.data.vertices],
                                  [tuple(p.vertices) for p in face.data.polygons])
    for side in (-1, 1):
        details = [
            ('Sleeper_Lid', 'lashes', [(side*.057,.004,.0019),(side*.073,.001,.0068),
             (side*.113,-.003,.0089),(side*.151,-.002,.0069),(side*.169,.002,.0028),
             (side*.178,.008,.0006)]),
            ('Sleeper_Brow', 'brows', [(side*.067,.085,.0010),(side*.093,.096,.0043),
             (side*.128,.093,.0039),(side*.156,.080,.0012)]),
        ]
        for name, pigment, controls in details:
            trace_face(collection, volume, name, controls, palette[pigment])
    trace_face(collection, volume, 'Sleeper_Mouth',
               [(-.025,-.082,.0005),(-.015,-.088,.0013),(-.004,-.091,.0017),
                (.008,-.0905,.0017),(.017,-.087,.0013),(.024,-.080,.0005)], palette['lips'])


def trace_face(collection, volume, name, controls, pigment):
    rows = []
    for x, z, width in interpolate(controls, 3):
        radii = max(.0004, width)
        points = []
        for j in range(10):
            a = j / 10 * math.tau
            height = z + radii * math.cos(a)
            position, _, _, _ = volume.ray_cast(Vector((x, -1, height)), Vector((0, 1, 0)), 2)
            points.append((x, position.y - .0004 - radii * .21 * (1 + math.sin(a)), height))
        rows.append(points)
    rings(collection, name, rows, pigment)


def scalp_point(phi, travel):
    c, s = math.cos(phi), math.sin(phi)
    fringe, back = max(0, -s), max(0, s)
    turn = max(0, math.sin(9 * phi + .55)) ** 3 * abs(c) ** 2
    extent = 2.48 - .98 * fringe ** 1.5 + .09 * math.sin(5 * phi + .7)
    extent += .13 * turn - .13 * fringe ** 4 * c
    theta = extent * travel
    swell = .009 * math.sin(theta) * math.sin(phi*7 + 1.2*theta + .45*math.cos(phi*3))
    lift = .032 * turn * smooth_step((travel - .64) / .36)
    # The supplementary side panel shows most new depth behind the ear.
    # The forehead, brow and front width still follow the original collage.
    depth = .232 + .041 * fringe**2 + .056 * back**1.8 + swell + .43 * lift
    point = Vector(((.297+swell+lift)*c*math.sin(theta),
                    .050 + depth*s*math.sin(theta),
                    .123 + (.282+swell)*math.cos(theta) + .47*lift))
    part = point.x-(.035+.20*(point.y-.018))
    crown = smooth_step((point.z-.295)/.087)*math.exp(-((point.y-.031)/.155)**4)
    trough = -.008*math.exp(-(part/.010)**2)
    shoulder = .0065*math.exp(-((abs(part)-.027)/.017)**2)
    point.z += crown*(trough+shoulder)
    return point


def rear_lock(collection, name, palette, phi, drift, start, end, width, shade):
    # Fit its root and underside to the same curved scalp as the hair mass.
    sections = []
    for t, shape, relief in [(0,.26,-.017),(.23,.70,-.004),(.52,1,.007),
                             (.77,.60,.014),(.91,.24,.019),(1,.035,.012)]:
        angle = phi + t*drift + .072 * math.sin(t*math.pi)
        travel = start + (end-start)*t
        point = scalp_point(angle, travel)
        normal = (scalp_point(angle, travel+.001)-scalp_point(angle, travel-.001)).cross(
            scalp_point(angle+.001, travel)-scalp_point(angle-.001, travel))
        from_scalp_centre = point - Vector((0,.050,.123))
        if normal.dot(from_scalp_centre) < 0:
            normal.negate()
        point += normal.normalized() * relief
        # The last few millimetres turn out from the nape before tapering.
        point.z += .022 * smooth_step((t-.76)/.24)
        sections.append((*point, width*shape, max(.001, width*shape*.29)))
    mid = phi + .54*drift
    sweep(collection, name, sections, palette[shade], across=Vector((-math.sin(mid),math.cos(mid),0)),
          sides=18, steps=4, flow_uv=True)


def rooted_forelock(collection, scalp, name, sections, pigment, crest=False):
    columns = 24
    obj = sweep(collection,name,sections,pigment,across=Vector((1,0,0)),sides=columns,flow_uv=True)
    vertices = obj.data.vertices
    count = len(vertices)//columns
    for row in range(count):
        travel = row/(count-1)
        influence = 1-smooth_step((travel-.20)/.38)
        ring = [vertices[index] for index in range(row*columns,(row+1)*columns)]
        if influence>0:
            centre = sum((vertex.co for vertex in ring),Vector())/columns
            hit, normal, _, _ = scalp.find_nearest(centre)
            if normal.dot(hit-Vector((0,.050,.123))) < 0:
                normal.negate()
            depth = -.016+.027*smooth_step(travel/.42)
            offset = influence*(hit+depth*normal-centre)
            for vertex in ring:
                vertex.co += offset
        if crest:
            # A raised rib follows the front sweep within the same surface.
            bend = smooth_step((travel-.16)/.22)*smooth_step((.78-travel)/.26)
            ridge = 1.22+.70*travel
            for column,vertex in enumerate(ring):
                angle = column/columns*math.tau
                vertex.co.y -= .0068*bend*math.exp(-((angle-ridge)/.49)**2)
    obj.data.update()
    return obj


def hair_shape(collection, palette):
    # The cap establishes the continuous profile. Over it the sculpt follows
    # the side sheet's upper layers and short offset nape locks.
    segments = 72
    rows = []
    for r in range(1, 24):
        band = r / 23
        rows.append([scalp_point(j/segments*math.tau,band) for j in range(segments)])
    rows.insert(0, [(x*.035, .050 + (y-.050)*.035, .405) for x, y, _ in rows[0]])
    cap = rings(collection,'Sleeper_Scalp',rows,palette['hair'],closed=False,flow_uv=True)
    scalp = BVHTree.FromPolygons([vertex.co for vertex in cap.data.vertices],
                                  [tuple(polygon.vertices) for polygon in cap.data.polygons])

    rear = [
        (.16,-.17,.49,1.020,.046),(.49,.27,.52,1.074,.056),
        (.87,.21,.45,.975,.064),(1.15,.26,.55,1.044,.063),
        (1.55,-.24,.46,1.073,.061),(1.95,.22,.50,1.014,.066),
        (2.25,.29,.43,1.058,.061),(2.62,.24,.50,1.020,.049),
        (2.93,-.16,.54,1.055,.045),
    ]
    crown = [
        (.22,.26,.21,.743,.043),(.68,.33,.15,.874,.056),
        (1.12,-.31,.13,.788,.059),(1.51,.32,.18,.861,.065),
        (1.96,.31,.12,.797,.056),(2.46,.29,.16,.872,.052),
        (2.86,-.24,.22,.774,.046),
    ]
    for label,layer in [('Nape',rear),('Crown',crown)]:
        for i, (phi, drift, start, end, width) in enumerate(layer):
            shade = 'hair_light' if i in (0, 3, 6) else 'hair'
            rear_lock(collection, f'Sleeper_{label}_{i+1}', palette, phi, drift, start, end, width, shade)

    # Trace the front turnaround's major sweep to the gap between the lids.
    # The secondary tips stop above it and leave the far brow in the opening.
    forms = [
        ([(.030,.022,.399,.013,.010),(.053,-.100,.328,.044,.018),
          (.041,-.195,.245,.058,.019),(.009,-.220,.157,.061,.020),
          (-.022,-.218,.069,.039,.013),(-.055,-.191,-.004,.002,.0018)], 'hair'),
        ([(.017,.019,.398,.011,.009),(-.001,-.104,.339,.034,.015),
          (-.040,-.199,.239,.047,.019),(-.071,-.215,.148,.042,.017),
          (-.099,-.202,.057,.026,.010),(-.146,-.162,.022,.002,.0018)], 'hair_light'),
        ([(-.006,.027,.396,.014,.011),(-.101,-.071,.341,.045,.017),
          (-.155,-.151,.254,.047,.018),(-.204,-.174,.151,.044,.020),
          (-.211,-.163,.056,.032,.013),(-.187,-.149,-.034,.024,.009),
          (-.140,-.137,-.059,.002,.002)], 'hair'),
        ([(.049,.021,.397,.015,.010),(.129,-.091,.337,.038,.015),
          (.153,-.161,.246,.045,.017),(.180,-.173,.150,.042,.017),
          (.205,-.155,.047,.040,.014),(.195,-.140,-.029,.023,.008),
          (.148,-.140,-.059,.002,.0018)], 'hair_light'),
        ([(.067,.030,.391,.013,.010),(.198,-.030,.308,.043,.017),
          (.240,-.091,.225,.051,.018),(.258,-.127,.137,.047,.018),
          (.247,-.127,.047,.028,.012),(.207,-.130,-.029,.002,.0018)], 'hair'),
        ([(-.026,.042,.393,.012,.010),(-.173,-.036,.311,.047,.016),
          (-.233,-.102,.230,.046,.018),(-.251,-.126,.142,.044,.019),
          (-.238,-.129,.039,.028,.010),(-.211,-.131,-.020,.002,.0018)], 'hair_light'),
    ]
    for i, (sections, pigment) in enumerate(forms):
        rooted_forelock(collection,scalp,f'Sleeper_Forelock_{i+1}',sections,palette[pigment],crest=i==0)

    outlines = {
        -1: [(.299,.282,-.015),(.159,.349,-.055),(.018,.339,-.071)],
         1: [(.266,.272,-.014),(.153,.335,-.055),(.031,.350,-.063)],
    }
    for side, waves in outlines.items():
        # Offset the flares as in the front sheet. The lower ears sit behind them.
        for index,(z,reach,y) in enumerate(waves):
            root_x = .129 if index==0 else .201
            wave = [(side*root_x,.021,z+.062,.015,.010),
                    (side*.71*reach,y-.024,z+.041,.034,.015),
                    (side*.83*reach,y-.030,z-.002,.031,.012),
                    (side*(reach-.016),y-.019,z+.002,.015,.007),
                    (side*reach,y,z+(.024 if index==0 else .019),.002,.0018)]
            sweep(collection,f'Sleeper_TempleCurl_{side}_{index}',wave,
                  palette['hair_light' if index==1 else 'hair'],across=Vector((0,0,1)),sides=18,flow_uv=True)
        nape = [(.235,.217,-.154),(.188,.151,-.188),(.145,.101,-.179)]
        for i, (start_x,tip_x,tip_z) in enumerate(nape):
            end = tip_z+(.010 if side>0 and i==1 else 0)
            nape_tip = [(side*start_x,.126,-.055,.019,.013),
                        (side*(start_x-.011),.125,-.108,.026,.014),
                        (side*(tip_x+.007),.112,end+.019,.017,.008),
                        (side*tip_x,.102,end,.0018,.0015)]
            sweep(collection,f'Sleeper_LowerNape_{side}_{i}',nape_tip,
                  palette['hair'],across=Vector((1,0,0)),sides=16,flow_uv=True)

    sweep(collection, 'Sleeper_Cowlick',
          [(0,.023,.381,.025,.014),(-.031,.010,.415,.022,.012),
           (-.023,-.006,.457,.019,.012),(.011,-.015,.483,.015,.010),
           (.054,-.023,.478,.009,.007),(.074,-.030,.459,.002,.002)], palette['hair_light'],
          across=Vector((1, 0, 0)), sides=20, flow_uv=True)
    for shade in ('hair','hair_light'):
        pigment = palette[shade]
        if not any(node.type=='TEX_IMAGE' for node in pigment.node_tree.nodes):
            painted_surface(pigment,kind='hair',size=256)
        for node in pigment.node_tree.nodes:
            if node.type=='NORMAL_MAP':
                node.inputs['Strength'].default_value = .56
            elif node.type=='BSDF_PRINCIPLED':
                node.inputs['Specular IOR Level'].default_value = .24


def cup_point(side, x, y, z):
    # The cushioning and housing are separate shallow volumes against the hair.
    height = z+.013
    return (side*(x+.145*height), y, -.035+.93*height)


def headphones(collection, palette):
    fittings = {}
    for side in (-1, 1):
        ear = []
        for name, profile, pigment in [
            ('Pad', [(.279,.006),(.267,.068),(.267,.089),(.279,.098),
                     (.292,.095),(.301,.083),(.304,.006)], 'pad'),
            ('Cup', [(.299,.006),(.301,.075),(.307,.093),(.314,.096),(.322,.085),
                     (.329,.065),(.326,.052),(.326,.006)], 'enamel'),
        ]:
            rows = []
            for x, r in profile:
                rows.append([cup_point(side,x,.039 + .92*r*math.cos(a),-.013+r*math.sin(a))
                             for a in (j/40*math.tau for j in range(40))])
            ear.append(rings(collection, f'Sleeper_Ear_{name}_{side}', rows, palette[pigment]))
        marks, faces = [], []
        for leaf in SPRIG_SHAPES:
            start = len(marks)
            marks.extend(cup_point(side,.3274,.039+side*.49*x,-.013+.45*z) for x,z in leaf)
            faces.append(tuple(range(start,len(marks))))
        surface(collection,f'Sleeper_CupSprig_{side}',marks,faces,palette['pad'])
        joint = [(*cup_point(side,.308,.043,.069),.019,.010),
                 (side*.318,.061,.099,.020,.011),
                 (side*.316,.080,.154,.024,.010),
                 (side*.300,.099,.199,.025,.010)]
        yoke = sweep(collection,f'Sleeper_EarYoke_{side}',joint,palette['enamel'],
                     across=Vector((0,1,0)),sides=16)
        fittings[side] = (*ear,yoke)
    band = []
    for i in range(43):
        a = .39 + (math.pi - .78) * i / 42
        arc = math.sin(a)
        band.append([(radial*math.cos(a), y, .045 + (radial+.038)*arc - .021*arc**5)
                     for radial, y in ((.327,.074),(.330,.126),(.343,.128),(.345,.072))])
    return rings(collection,'Sleeper_Headband',band,palette['enamel']),fittings


def local_bvh(parts):
    points, faces = [], []
    for part in parts:
        offset = len(points)
        points.extend(vertex.co for vertex in part.data.vertices)
        faces.extend(tuple(offset+index for index in polygon.vertices) for polygon in part.data.polygons)
    return BVHTree.FromPolygons(points,faces)


def fit_hair_to_headphones(hair, face, band, fittings):
    skull = local_bvh((face,))
    arc = local_bvh((band,))
    cups = {side:local_bvh(parts[:2]) for side,parts in fittings.items()}
    forks = {side:local_bvh(parts[2:]) for side,parts in fittings.items()}

    def pull_in(point, origin, direction, radius, target, pressure):
        skin = skull.ray_cast(origin,direction,.55)[3]
        if skin is not None:
            target = max(target,skin+.003)
        point -= pressure*max(0,radius-target)*direction

    def press_band(point):
        y = min(.124,max(.076,point.y))
        pressure = 1-smooth_step((abs(y-point.y)-.007)/.033)
        centre = Vector((0,point.y,.045))
        delta = point-centre
        if pressure>0 and delta.length>.255:
            direction = delta.normalized()
            inside = arc.ray_cast(Vector((0,y,.045)),direction,.55)[3]
            if inside is not None:
                pull_in(point,centre,direction,delta.length,inside-.0045,pressure)

    def press_ear(point, side):
        direction = Vector((side,0,0))
        origin = Vector((0,point.y,point.z))
        radius = abs(point.x)
        offset = Vector((0,point.y-.039,point.z+.035))
        distance = math.hypot(offset.y/.090,offset.z/.091)
        if distance<1.25:
            pressure = 1-smooth_step((distance-1.02)/.24)
            inside = cups[side].ray_cast(origin,direction,.50)[3]
            if inside is None and distance>.8:
                probe = Vector((0,.039,-.035)) + offset*(.96/distance)
                inside = cups[side].ray_cast(probe,direction,.50)[3]
            if inside is not None:
                pull_in(point,origin,direction,radius,inside-.0045,pressure)
        inside = forks[side].ray_cast(origin,direction,.50)[3]
        if inside is not None:
            pull_in(point,origin,direction,abs(point.x),inside-.005,1)

    def touched_vertices(part, tree, collider):
        return {index for polygon,_ in tree.overlap(collider)
                for index in part.data.polygons[polygon].vertices}

    for part in hair:
        for vertex in part.data.vertices:
            point = vertex.co
            press_band(point)
            if abs(point.x)>.19:
                press_ear(point,-1 if point.x<0 else 1)
        # Sampled vertices describe the pressure field. Any polygon still
        # crossing an edge gets a small extra clearance on its contact side.
        for _ in range(3):
            tree = local_bvh((part,))
            by_band = touched_vertices(part,tree,arc)
            by_ear = {side:touched_vertices(part,tree,cups[side]) | touched_vertices(part,tree,forks[side])
                      for side in (-1,1)}
            if not by_band and not any(by_ear.values()):
                break
            for index in by_band:
                point = part.data.vertices[index].co
                origin = Vector((0,point.y,.045))
                delta = point-origin
                pull_in(point,origin,delta.normalized(),delta.length,delta.length-.006,1)
            for side,indices in by_ear.items():
                direction = Vector((side,0,0))
                for index in indices:
                    point = part.data.vertices[index].co
                    radius = abs(point.x)
                    pull_in(point,Vector((0,point.y,point.z)),direction,radius,radius-.006,1)
        part.data.update()


def build_head(collection, palette, resting):
    before = set(collection.objects)
    face = profile_surface(collection, palette)
    face_marks(collection, face, palette)
    before_hair = set(collection.objects)
    hair_shape(collection,palette)
    hair = tuple(part for part in collection.objects if part not in before_hair)
    if resting:
        for part in hair:
            if part.name.split('.')[0] != 'Sleeper_Crown_2':
                continue
            # The left palm pushes this lock toward the scalp while reclining.
            for vertex in part.data.vertices:
                x,y,z = vertex.co
                weight = math.exp(-((x-.211)/.074)**4-((z-.262)/.090)**4)
                vertex.co.y -= .048*weight*smooth_step((y-.145)/.055)
    band,fittings = headphones(collection,palette)
    fit_hair_to_headphones(hair,face,band,fittings)
    transform = (Matrix.Translation(HEAD_REST) @ HEAD_ROTATION.to_4x4() if resting
                 else Matrix.Translation((0, 0, neutral_z(EYE_ROW))))
    for part in set(collection.objects) - before:
        part.matrix_world = transform
        part['sleeper_region'] = 'head'
    return face


def build_neck(collection, palette, resting):
    # The neck enters behind the mandible in the side panel. In the boat it
    # follows the supported shoulders while the chin keeps its own round edge.
    if resting:
        sections = [(-.012,-.551,.745,.084,.073),(-.012,-.583,.771,.073,.064),
                    (-.012,-.616,.796,.057,.053),(-.012,-.654,.828,.060,.063),
                    (-.012,-.685,.845,.066,.063)]
        sections = [(x,y,z-HEAD_DROP,width,thickness) for x,y,z,width,thickness in sections]
    else:
        sections = [(0,.022,neutral_z(229),.085,.071),(0,.030,neutral_z(216),.070,.061),
                    (0,.034,neutral_z(205),.059,.060),(0,.035,neutral_z(190),.063,.063),
                    (0,.033,neutral_z(183),.068,.065)]
    neck = sweep(collection, 'Sleeper_Neck', sections, palette['skin'],
                 across=Vector((1, 0, 0)), sides=28)
    return neck


def join_head_neck(face, neck, palette):
    # Give both meshes the same pigment before welding and fairing the
    # intersection. The overlapping shells formerly left a line at the chin.
    neck.data.materials[0] = face.data.materials[0]
    tint = neck.data.color_attributes.new(name='SkinTint', type='FLOAT_COLOR', domain='POINT')
    for color in tint.data:
        color.color = palette['skin'].diffuse_color
    bpy.context.view_layer.update()
    to_head = face.matrix_world.inverted() @ neck.matrix_world
    skull = BVHTree.FromPolygons([v.co for v in face.data.vertices],
                                 [tuple(p.vertices) for p in face.data.polygons])
    throat = BVHTree.FromPolygons([to_head @ v.co for v in neck.data.vertices],
                                  [tuple(p.vertices) for p in neck.data.polygons])
    bpy.ops.object.select_all(action='DESELECT')
    face.select_set(True)
    bpy.context.view_layer.objects.active = face
    weld = face.modifiers.new('Weld at jaw and neck', 'BOOLEAN')
    weld.operation = 'UNION'
    weld.object = neck
    bpy.ops.object.modifier_apply(modifier=weld.name)
    bpy.data.objects.remove(neck, do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(face.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00018)
    weights = {}
    for vertex in bm.verts:
        if vertex.co.z > head_z(179):
            continue
        a = skull.find_nearest(vertex.co)[3]
        b = throat.find_nearest(vertex.co)[3]
        weights[vertex] = smooth_step(1-max(a,b)/.015)
    for _ in range(4):
        changes = {}
        for vertex, weight in weights.items():
            neighbours = [edge.other_vert(vertex).co for edge in vertex.link_edges]
            if weight > .001 and neighbours:
                changes[vertex] = vertex.co.lerp(sum(neighbours,Vector())/len(neighbours),.40*weight)
        for vertex, point in changes.items():
            vertex.co = point
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(face.data)
    bm.free()
    face.data.validate()
    for polygon in face.data.polygons:
        polygon.use_smooth = True


def build_tee(collection, palette, resting, body, face, trousers):
    cloth = palette['tee']
    stations = []
    if resting:
        # Keep a little more ease in the chest and hem. The underside drops
        # onto the berth while the open sleeve follows the actual upper arm.
        stations.append((.008,.086,.589,.244,.153))
        for _, width, thickness, (x,y,z) in CORE_STATIONS[2:-2]:
            extra = .024 if y > .025 else .014
            stations.append((x,y,z+extra,width+.032,thickness+.025))
        stations.extend([(-.010,-.521,.692,.158,.114),(-.012,-.578,.765-HEAD_DROP,.072,.062)])
    else:
        for row, half_width, front, back in TORSO_STATIONS:
            depth_at_row = (depth(front)+depth(back))/2
            depth_at_row += (.018-depth_at_row)*smooth_step((254-row)/23)
            stations.append((0,depth_at_row,neutral_z(row),half_width*PIXEL,abs(front-back)*PIXEL/2))
    tee = sweep(collection, 'Sleeper_Tee', stations, cloth, across=Vector((1, 0, 0)), sides=48)
    parts = [tee]
    cuts = []
    for side in (-1, 1):
        if resting:
            arm = arm_sections(side, True)
            cuff = Vector(arm[3][:3]).lerp(Vector(arm[4][:3]), .64)
            sleeve = [(*section[:3], section[3]+.028, section[4]+.033) for section in arm[1:4]]
            sleeve.append((*cuff,.102 if side < 0 else .098,.096))
            across = Vector((0, 0, 1))
        else:
            sleeve = [(side*.106,.015,neutral_z(240),.085,.090),
                      (side*.211,.012,neutral_z(257),.098,.098),
                      (side*.286,.010,neutral_z(279),.092,.094),
                      (side*.335,.011,neutral_z(294),.088,.090)]
            across = Vector((0, 1, 0))
        parts.append(sweep(collection, f'Sleeper_Sleeve_{side}', sleeve, cloth, across=across, sides=36))
        cuts.append((sleeve[-1], sleeve[-2], lambda vertex, side=side: side * vertex.co.x > .248))
    cuts.extend([
        (stations[0], stations[1], lambda vertex: True),
        (stations[-1], stations[-2], lambda vertex: not resting or abs(vertex.co.x) < .14),
    ])
    sew_garment(tee, parts, cuts, drape_tee, resting, voxel=.009, density=.41)
    fit_garment(tee, body, collar=True, resting=resting)
    seat_collar(tee, face, stations[-1], stations[-2], resting)
    if resting:
        lay_hem_over_shorts(tee, trousers)
    paint_cotton(tee, cloth)
    add_tee_embroidery(collection, tee, palette['embroidery'], resting)


def add_tee_embroidery(collection, tee, pigment, resting):
    # A small stitched sprig is visible on the original cream tee.
    cloth = BVHTree.FromPolygons([v.co for v in tee.data.vertices],
                                 [tuple(p.vertices) for p in tee.data.polygons])
    vertices, faces = [], []
    direction = Vector((0,0,-1) if resting else (0,1,0))
    for leaf in SPRIG_SHAPES:
        first = len(vertices)
        for x,v in leaf:
            pos = Vector((x,-.347-v,1.18) if resting else (x,-.50,neutral_z(275)+v))
            hit = cloth.ray_cast(pos,direction,1.20)[0]
            if hit is None:
                break
            vertices.append(hit-.0019*direction)
        if len(vertices)-first == len(leaf):
            faces.append(tuple(range(first,len(vertices))))
        else:
            del vertices[first:]
    if faces:
        surface(collection,'Sleeper_TeeSprig',vertices,faces,pigment)


def drape_tee(point, resting):
    x,y,z = point
    width = smooth_step((.280-abs(x))/.051)
    if resting:
        face = width * smooth_step((z-(.557-.180*y)-.009)/.099)
        folds = tension_fold(x,y,-.371,.032,(-.287,.57,.34),.036,.012,.009)
        folds += tension_fold(x,y,-.226,.134,(-.178,-.49,-.44),.026,.014,.010)
        folds += tension_fold(x,y,-.293,.053,(.040,.48,-.16),.033,.012,.008)
        folds += tension_fold(x,y,-.048,.151,(.163,-.65,.24),.025,.010,.008)
        point.z += face*folds
        # The supported underside stays on the blanket. The free shoulder and
        # hem can sag and twist on the side compressed by the raised arm.
        cuff = smooth_step((abs(x)-.235)/.153)*smooth_step((-.325-y)/.104)
        sag = smooth_step((.697-z)/.088)
        point.z -= .010*cuff*sag
        hem = smooth_step((y-.014)/.080)*smooth_step((z-.525)/.123)
        point.y += hem*(.011*math.sin(14*x+.45)+.003*math.sin(31*x-.3))
        point.z += hem*.006*math.sin(17*x+.6)
    else:
        amount = width*smooth_step((-.027-y)/.060)
        below_chest = neutral_z(271)-z
        fold = tension_fold(x,below_chest,-.257,.082,(.026,.54,.24),.026,.010,.009)
        fold += tension_fold(x,below_chest,-.049,.265,(.144,-.46,.17),.026,.011,.010)
        point.y -= amount*fold
        point.z += smooth_step((neutral_z(375)-z)/.098)*.006*math.sin(15*x+.6)


def sew_garment(base, parts, cuts, drape, resting, *, voxel, density):
    """Join a garment's closed forms, then cut and thicken the real openings."""
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.join()
    union = base.modifiers.new('Connected cloth', 'REMESH')
    union.mode = 'VOXEL'
    union.voxel_size = voxel
    union.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=union.name)
    smoothing = base.modifiers.new('Cloth transitions', 'SMOOTH')
    smoothing.factor = .45
    smoothing.iterations = 3
    bpy.ops.object.modifier_apply(modifier=smoothing.name)

    bm = bmesh.new()
    bm.from_mesh(base.data)
    for end, previous, region in cuts:
        open_edge(bm, Vector(end[:3]), Vector(previous[:3]), region)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00045)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.0003)
    for vertex in list(bm.verts):
        if not vertex.link_faces:
            bm.verts.remove(vertex)
    # Soften the boundary loops after trimming the voxel shell. The interior
    # is left at full density while the cloth fields establish its shape.
    rims = {vertex: [edge.other_vert(vertex) for edge in vertex.link_edges if edge.is_boundary]
            for vertex in bm.verts if vertex.is_boundary}
    for _ in range(4):
        softened = {vertex: vertex.co.lerp((ring[0].co+ring[1].co)*.5,.46)
                    for vertex,ring in rims.items() if len(ring)==2}
        for vertex,location in softened.items():
            vertex.co = location
    for vertex in bm.verts:
        drape(vertex.co, resting)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(base.data)
    bm.free()
    simple = base.modifiers.new('Cloth silhouette density', 'DECIMATE')
    simple.ratio = density
    bpy.ops.object.modifier_apply(modifier=simple.name)
    base.data.validate()
    thickness = base.modifiers.new('Cotton cut edge', 'SOLIDIFY')
    thickness.thickness = .003
    thickness.offset = -1


def open_edge(bm, end, previous, contains):
    axis = (end - previous).normalized()
    cut = end - .015 * axis
    vertices = {v for v in bm.verts if contains(v) and (v.co-cut).dot(axis)>-.035}
    edges = [e for e in bm.edges if all(v in vertices for v in e.verts)]
    faces = [f for f in bm.faces if all(v in vertices for v in f.verts)]
    bmesh.ops.bisect_plane(bm, geom=[*vertices, *edges, *faces], dist=.0001,
                          plane_co=cut, plane_no=axis, clear_outer=True)


def build_lower_body(collection, palette, resting, body):
    if resting:
        waist = [(.005,-.014,.584,.211,.117),(.007,.044,.580,.237,.141),
                 (.007,.110,.575,.223,.134),(.006,.178,.570,.167,.110)]
    else:
        waist = [(0,.023,neutral_z(389),.213,.149),(0,.023,neutral_z(411),.223,.151),
                 (0,.033,neutral_z(433),.223,.130),(0,.047,neutral_z(456),.171,.092)]
    trousers = sweep(collection, 'Sleeper_Shorts', waist, palette['shorts'],
                     across=Vector((1, 0, 0)), sides=36)
    cloth = [trousers]
    cuts = [(waist[0], waist[1], lambda vertex: True)]
    for side in (-1, 1):
        if resting:
            leg = leg_sections(side, resting)
            thigh_start = Vector(leg[0][:3])
            thigh_mid = Vector(leg[1][:3])
            cuff_centre = thigh_mid.lerp(Vector(leg[2][:3]), .88)
            shorts = [(side*.103,-.012,.592,.118,.121),(*thigh_start,.140,.145),
                      (*thigh_mid,.126,.134),(*cuff_centre,.106,.114)]
        else:
            shorts = [(side*.115,.022,neutral_z(400),.117,.151),
                      (side*.119,.020,neutral_z(431),.129,.137),
                      (side*.127,.023,neutral_z(469),.121,.134),
                      (side*.130,.028,neutral_z(499),.118,.131)]
        cuff = sweep(collection, f'Sleeper_Shorts_{side}', shorts, palette['shorts'],
                     across=Vector((1, 0, 0)), sides=36)
        cloth.append(cuff)
        cuts.append((shorts[-1], shorts[-2], lambda vertex, side=side: side * vertex.co.x > .004))
    sew_garment(trousers, cloth, cuts, drape_shorts, resting, voxel=.010, density=.36)
    fit_garment(trousers, body, collar=False, resting=resting)
    paint_cotton(trousers, palette['shorts'])
    return trousers


def fit_garment(obj, body, *, collar, resting):
    """Keep seam allowance outside the approved body, including after decimation."""
    for vertex in obj.data.vertices:
        x,y,z = vertex.co
        # Retain the neckline contact with the original head and neck mesh.
        at_collar = y < -.525 if resting else z > neutral_z(224)
        if collar and at_collar and abs(x) < .098:
            continue
        hit, normal, _, _ = body.find_nearest(vertex.co)
        clearance = (vertex.co-hit).dot(normal)
        if clearance < .0095:
            vertex.co = hit + normal * .0095
    obj.data.update()


def seat_collar(tee, face, end, previous, resting):
    """Lay the folded opening against the measured neck, under the cut edge."""
    neck = BVHTree.FromPolygons([face.matrix_world @ v.co for v in face.data.vertices],
                               [tuple(p.vertices) for p in face.data.polygons])
    centre = Vector(end[:3])
    axis = (centre-Vector(previous[:3])).normalized()
    cut = centre - .015*axis
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    rim = {v for edge in bm.edges if edge.is_boundary for v in edge.verts}
    for vertex in bm.verts:
        x,y,z = vertex.co
        near_neck = -.68 < y < -.501 and z > .675 if resting else z > neutral_z(229)
        if not near_neck or abs(x) > .145:
            continue
        amount = 1.0 if vertex in rim else .74*smooth_step(1-abs((vertex.co-cut).dot(axis))/.058)
        hit, normal, _, _ = neck.find_nearest(vertex.co)
        vertex.co = vertex.co.lerp(hit + normal*.0012, amount)
    bm.to_mesh(tee.data)
    bm.free()
    tee.data.update()


def lay_hem_over_shorts(tee, trousers):
    lower = local_bvh((trousers,))
    for vertex in tee.data.vertices:
        x,y,z = vertex.co
        if y < -.031 or z < .600:
            continue
        top, _, _, _ = lower.ray_cast(Vector((x,y,.95)),Vector((0,0,-1)),.39)
        if top is not None:
            lift = max(0,min(.034,top.z+.011-z))
            vertex.co.z += lift*smooth_step((y+.031)/.034)
    tee.data.update()


def paint_cotton(obj, cloth):
    obj['sleeper_region'] = 'garment'
    painted_surface(cloth, kind='cloth', size=256)
    project_surface_uv(obj, cloth=True)


def drape_shorts(point, resting):
    x,y,z = point
    if resting:
        # The short seam ends and the bend above each cuff sit on different
        # levels. Keep this shallow across the load-bearing thighs.
        top = smooth_step((z-.596)/.114)
        left = tension_fold(x,y,.120,.311,(-.138,-.45,.78),.023,.010,.007)
        right = tension_fold(x,y,.126,.355,(.180,.18,-.28),.026,.009,.006)
        point.z += top*(left+right)
    else:
        row = FOOT_ROW-z/PIXEL
        front = smooth_step((-.032-y)/.071)
        middle = math.exp(-(x/.131)**4)*smooth_step((row-416)/22)*smooth_step((476-row)/23)
        target = -.115 + .027*smooth_step((row-437)/37)
        point.y += front*middle*(target-y)
        hem = smooth_step((row-480)/18)
        point.z += .0035*hem*math.sin(39*x+.3)


def build_sleeper(collection, *, resting):
    """Build one editable candidate in the supplied collection."""
    before = set(collection.objects)
    palette = make_materials()
    face = build_head(collection, palette, resting)
    neck = build_neck(collection, palette, resting)
    join_head_neck(face, neck, palette)
    limbs = build_exposed_skin(collection, palette['skin'], resting, sweep)
    anatomy = build_anatomy(collection, palette['skin'], resting, face, limbs, sweep)
    body = BVHTree.FromPolygons([v.co for v in anatomy.data.vertices],
                               [tuple(p.vertices) for p in anatomy.data.polygons])
    trousers = build_lower_body(collection, palette, resting, body)
    build_tee(collection, palette, resting, body, face, trousers)
    return tuple(obj for obj in collection.objects if obj not in before)


def fit_sleeper_pillow(pillow, parts):
    """Shape the cushion against the actual posed scalp and palms."""
    points, faces = [], []
    for part in parts:
        if part.get('sleeper_region') not in ('head','arm'):
            continue
        first = len(points)
        points.extend(part.matrix_world @ v.co for v in part.data.vertices)
        faces.extend(tuple(first + v for v in f.vertices) for f in part.data.polygons)
    support = BVHTree.FromPolygons(points, faces)
    inverse = pillow.matrix_world.inverted()
    rise = Vector((0,0,1))
    for vertex in pillow.data.vertices:
        p = pillow.matrix_world @ vertex.co
        if p.z < .452:
            continue
        pocket = math.exp(-((p.x+.012)/.160)**6 - ((p.y+.922)/.139)**6)
        if not (-.336 < p.x < .318 and -1.204 < p.y < -.755):
            continue
        hit = support.ray_cast(Vector((p.x,p.y,.39)),rise,.70)[0]
        if hit is not None:
            target = hit.z - .006
            # Lower obstructing fabric across the whole footprint. Only the
            # rise into the hollow is limited to the soft central pocket.
            if p.z > target:
                p.z = target
            elif p.z > .508:
                p.z += pocket * min(.044, target-p.z)
            vertex.co = inverse @ p
    polygons = [tuple(poly.vertices) for poly in pillow.data.polygons]
    probes = [(p.x,p.y) for p in points if .45 < p.z < .685]
    probes.extend((ix*.005,iy*.005) for ix in range(-72,67) for iy in range(-241,-145))
    # Test real hair tips against the cushion triangles. A narrow lock can
    # still enter the interpolation between four correctly lowered vertices.
    for _ in range(5):
        cushion = [pillow.matrix_world @ v.co for v in pillow.data.vertices]
        hull = BVHTree.FromPolygons(cushion, polygons)
        changes = {}
        for x,y in probes:
            if not (-.365 < x < .335 and -1.213 < y < -.728):
                continue
            lower = support.ray_cast(Vector((x,y,.39)),rise,.70)[0]
            if lower is None:
                continue
            hit,_,face,_ = hull.ray_cast(Vector((x,y,1.5)),-rise,1.10)
            if hit is None or hit.z <= lower.z-.005:
                continue
            sink = hit.z-lower.z+.005
            for index in polygons[face]:
                if cushion[index].z > .444:
                    changes[index] = max(changes.get(index,0),sink)
        for face,_ in hull.overlap(support):
            for index in polygons[face]:
                if cushion[index].z > .444:
                    changes[index] = max(changes.get(index,0),.010)
        if not changes:
            break
        for index,sink in changes.items():
            p = cushion[index]
            p.z = max(.437,p.z-sink)
            pillow.data.vertices[index].co = inverse @ p
    pillow.data.update()
