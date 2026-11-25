"""Anatomical volumes for the standing study and the same figure at rest."""

from math import exp

import bpy
from mathutils import Vector


PIXEL = 2.53 / (750 - 11)
FOOT_ROW = 750
PROFILE_CENTRE = 103
HEAD_DROP = .016


def neutral_z(row):
    return (FOOT_ROW - row) * PIXEL


def depth(column):
    return (PROFILE_CENTRE - column) * PIXEL


# Cross sections from the sacrum to the base of the neck. Each row stores
# the standing reference level, width and depth radii, then the posed centre.
# In repose the chest and pelvis bear weight; the lumbar curve clears the pad.
CORE_STATIONS = [
    (421, .128, .078, ( .000,  .162, .523)),
    (403, .179, .098, ( .004,  .109, .550)),
    (385, .209, .118, ( .009,  .034, .566)),
    (365, .190, .108, ( .006, -.026, .571)),
    (345, .166, .099, ( .001, -.089, .579)),
    (327, .170, .103, (-.003, -.153, .590)),
    (310, .178, .111, (-.005, -.213, .598)),
    (291, .192, .121, (-.006, -.280, .611)),
    (268, .202, .126, (-.008, -.364, .619)),
    (247, .187, .114, (-.008, -.449, .644)),
    (229, .129, .087, (-.010, -.514, .683)),
    (217, .073, .063, (-.012, -.559, .748-HEAD_DROP)),
    (209, .050, .046, (-.012, -.591, .776-HEAD_DROP)),
]

# The neutral lengths are shared by both poses. Each posed upper arm starts
# inside the shoulder and makes space for the forearm to turn around the head.
ARM_STATIONS = [
    (230, 28, 101, .045, .047),
    (238, 45, 101, .076, .074),
    (258, 64, 100, .090, .082),
    (281, 85,  95, .078, .071),
    (304,108,  93, .065, .060),
    (335,129,  90, .055, .054),
    (352,140,  87, .060, .056),
    (371,152,  87, .053, .051),
    (390,160,  89, .040, .041),
    (402,168,  90, .030, .036),
]

ARM_REST = [
    (.097, -.404, .657), (.154, -.430, .678), (.219, -.472, .691), (.304, -.529, .695),
    (.402, -.624, .682), (.455, -.749, .651), (.427, -.824, .621),
    (.365, -.904, .596), (.287, -.989, .570), (.219, -1.043, .548),
]


def arm_sections(side, resting):
    sections = []
    for (row, offset, column, width, radius), (x, y, z) in zip(ARM_STATIONS, ARM_REST):
        if resting:
            # The right elbow lies slightly nearer the crown; the palms do
            # not need matching angles to reach under the head.
            handward = max(0, min(1, (-y-.47)/.34))
            wristward = max(0, min(1, (-y-.945)/.098))**2
            inset = (.050 if side < 0 else .031) * wristward
            settle = (.023 if side < 0 else .015) * wristward
            centre = (side*(x-inset), y+side*.011*handward+.011*wristward,
                      z+side*.007*handward-settle)
        else:
            centre = (side * offset * PIXEL, depth(column), neutral_z(row))
        sections.append((*centre, width, radius))
    return sections


# Hip, quadriceps, patella, shin, gastrocnemius, Achilles and ankle in order.
# The flexed foot is planted in the lower footwell. The other heel is
# supported by the forward thwart, giving the two legs different load paths.
LEG_STATIONS = [
    (397, 30, 100, .113, .121),
    (448, 36,  93, .107, .113),
    (498, 39,  87, .087, .090),
    (544, 41,  83, .073, .071),
    (579, 42,  82, .068, .061),
    (614, 45,  78, .076, .075),
    (657, 48,  78, .063, .066),
    (699, 50,  79, .046, .048),
    (725, 52,  82, .035, .037),
]

LEG_REST = {
    -1: [
        (.127,.038,.570), (.174,.170,.650), (.215,.290,.721),
        (.241,.397,.780), (.250,.491,.739), (.246,.584,.622),
        (.236,.656,.476), (.222,.719,.330), (.218,.756,.272),
    ],
     1: [
        (.127,.040,.568), (.145,.202,.553), (.164,.371,.571),
        (.179,.525,.586), (.183,.627,.578), (.188,.749,.561),
        (.182,.890,.529), (.172,1.014,.502), (.169,1.086,.490),
    ],
}


def leg_sections(side, resting):
    sections = []
    for (row, offset, column, width, radius), (x, y, z) in zip(LEG_STATIONS, LEG_REST[side]):
        centre = (side*x, y, z) if resting else (side*offset*PIXEL, depth(column), neutral_z(row))
        sections.append((*centre, width, radius))
    return sections


def arm_profile(station, top, cross, side, resting):
    # The deltoid caps the joint. Upper-arm and forearm masses taper toward
    # opposite ends of the elbow so the crease has an actual change of plane.
    if not resting:
        top, cross = -top, -cross
    inside = side * cross
    biceps = .017*exp(-((station-2.95)/1.06)**2)*max(0,top*.77+inside*.62)**3
    triceps = .011*exp(-((station-2.48)/1.08)**2)*max(0,-top*.68-inside*.70)**3
    olecranon = .011*exp(-((station-5.03)/.57)**2)*max(0,-inside)**4
    fold = .008*exp(-((station-5.04)/.60)**2)*max(0,inside)**3
    flexors = .014*exp(-((station-6.30)/.96)**2)*max(0,inside*.77+top*.61)**3
    wrist_bone = .004*exp(-((station-8.72)/.51)**2)*max(0,-inside)**3
    return biceps+triceps+olecranon+flexors+wrist_bone-fold


def leg_profile(station, across, depth, side, resting):
    # The kneecap lies on the front of the joint, the calf belly sits behind
    # the tibial plane, and the medial calf drops lower than the lateral one.
    along = station-1
    front = -depth if resting else depth
    medial = -side*across
    quad = .014*exp(-((along-1.5)/.99)**2)*max(0,front*.93-medial*.27)**3
    inner_quad = .009*exp(-((along-2.39)/.57)**2)*max(0,front*.67+medial*.73)**3
    patella = .010*exp(-((along-3.02)/.47)**2)*max(0,front)**4
    knee_hollow = .012*exp(-((along-3.37)/.62)**2)*max(0,-front)**3
    inner_calf = .016*exp(-((along-5.42)/1.04)**2)*max(0,-front*.72+medial*.69)**3
    outer_calf = .012*exp(-((along-4.93)/.84)**2)*max(0,-front*.77-medial*.63)**3
    tibia = .006*exp(-((along-5.67)/1.11)**2)*max(0,front*.95+medial*.31)**5
    return quad+inner_quad+patella+inner_calf+outer_calf+tibia-knee_hollow


def weld_skin(main, parts, voxel, density):
    """Join intersecting sculpt volumes and soften only at sculpt resolution."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (main, *parts):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = main
    bpy.ops.object.join()
    remesh = main.modifiers.new('Continuous skin', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = voxel
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    fair = main.modifiers.new('Soften volume transitions', 'SMOOTH')
    fair.factor = .55
    fair.iterations = 3
    bpy.ops.object.modifier_apply(modifier=fair.name)
    decimate = main.modifiers.new('Preserve silhouette', 'DECIMATE')
    decimate.ratio = density
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    return main


def smooth_joint(obj, centre, reach, ground=None):
    weights = obj.vertex_groups.new(name='Joint transition')
    for vertex in obj.data.vertices:
        amount = max(0, 1-(vertex.co-centre).length/reach)
        if ground is not None:
            amount *= min(1,max(0,(vertex.co.z-ground-.009)/.035))
        if amount > 0:
            weights.add([vertex.index], amount**.8, 'REPLACE')
    fair = obj.modifiers.new('Blend joint surface', 'SMOOTH')
    fair.vertex_group = weights.name
    fair.factor = .76
    fair.iterations = 9
    name = weights.name
    bpy.ops.object.modifier_apply(modifier=fair.name)
    if group := obj.vertex_groups.get(name):
        obj.vertex_groups.remove(group)


def hand(collection, arm, wrist, side, skin, resting, sweep):
    forward = Vector((-side*.765,-.638,.091) if resting else (side*.54,-.08,-.84)).normalized()
    # The head rests on the palmar side. Carry the thumb and every finger
    # through the same rotation around the wrist, with the dorsum on the pillow.
    back = Vector((-side*.16,.022,-1) if resting else (0,-1,0))
    back = (back - forward*back.dot(forward)).normalized()
    inside = side * forward.cross(back).normalized()
    if not resting:
        inside.negate()

    def sculpt(name, sections, sides):
        rings = [(*(wrist + forward*l + inside*u + back*h), width, thick)
                 for l,u,h,width,thick in sections]
        return sweep(collection, name, rings, skin, across=inside, sides=sides, steps=3)

    palm = sculpt('Palm', [
        (-.030,0,0,.032,.027), (.001,0,0,.034,.025),
        (.025,-.002,.002,.039,.023), (.047,-.003,.003,.043,.021),
        (.058,-.004,.001,.041,.016), (.066,-.001,.001,.027,.013),
    ], 24)
    for vertex in palm.data.vertices:
        delta = vertex.co-wrist
        length, width = delta.dot(forward),delta.dot(inside)
        palmar = min(1,max(0,(-delta.dot(back)-.003)/.014))
        thumb_pad = .006*exp(-((length-.028)/.026)**2-((width-.027)/.014)**2)
        outer_pad = .004*exp(-((length-.036)/.030)**2-((width+.029)/.013)**2)
        hollow = .003*exp(-((length-.041)/.020)**2-(width/.017)**2)
        vertex.co -= back*palmar*(thumb_pad+outer_pad-hollow)
    fingers = []
    # Metacarpal heads form a staggered arc. The two visible joints and pads
    # on each finger have their own depth and curl, including the little one.
    for u, root, length, radius, curl in [
        (.028,.054,.076,.0125,.019), (.005,.061,.082,.012,.023),
        (-.020,.056,.075,.0115,.025), (-.041,.049,.058,.0095,.025),
    ]:
        if resting:
            curl *= .77
        fingers.append(sculpt('Finger', [
            (root-.016,u*.92,.001,radius*1.21,radius*1.11),
            (root+.002,u,.003,radius*1.06,radius*.98),
            (root+length*.24,u*1.03,.003,radius*.91,radius*.83),
            (root+length*.43,u*1.07,.001,radius*.95,radius*.91),
            (root+length*.60,u*1.10,-curl*.29,radius*.83,radius*.77),
            (root+length*.73,u*1.11,-curl*.53,radius*.87,radius*.81),
            (root+length*.87,u*1.12,-curl*.74,radius*.78,radius*.72),
            (root+length*.96,u*1.12,-curl*.91,radius*.57,radius*.55),
            (root+length,u*1.12,-curl,.004,.004),
        ], 16))
    thumb = sculpt('Thumb', [
        (.015,.017,-.005,.023,.021), (.035,.035,-.006,.020,.017),
        (.049,.050,-.009,.016,.014), (.066,.059,-.013,.012,.011),
        (.075,.056,-.016,.013,.011), (.085,.050,-.023,.010,.009),
        (.092,.047,-.026,.004,.004),
    ], 16)
    weld_skin(arm, [palm, *fingers, thumb], .0039, .44)
    smooth_joint(arm, wrist, .078)


def foot(collection, leg, ankle, side, skin, resting, sweep):
    support = (.204 if side < 0 else .44) if resting else 0
    forward = Vector((side*(.13 if side < 0 else .18), 1 if resting else -1, 0)).normalized()
    inside = side * forward.cross(Vector((0,0,-1 if resting else 1))).normalized()
    origin = Vector((ankle.x, ankle.y, support))

    def sculpt(name, sections, sides):
        rings = []
        for l,u,h,width,thick in sections:
            # The free toes relax upward while the heel remains on the seat.
            rise = .17*max(0,l-.019) if resting and side > 0 else 0
            rings.append((*(origin+forward*l+inside*u+Vector((0,0,h+rise))),width,thick))
        return sweep(collection, name, rings, skin, across=inside, sides=sides, steps=3)

    heel = sculpt('Heel and arch', [
        (-.066,-.006,.035,.018,.022), (-.045,-.007,.036,.038,.035),
        (-.013,-.006,.043,.043,.042), (.023,-.007,.042,.038,.034),
        (.055,-.006,.039,.039,.030), (.084,-.001,.032,.049,.028),
        (.104,.003,.028,.059,.024), (.114,.005,.025,.052,.020),
        (.122,.008,.024,.035,.014),
    ], 28)
    for vertex in heel.data.vertices:
        relative = vertex.co-origin
        l,u = relative.dot(forward),relative.dot(inside)
        # The inside arch clears the floor between the padded heel and ball.
        underside = max(0,1-relative.z/.036)
        medial = max(0,min(1,(u+.005)/.038))
        vertex.co.z += .010*underside*medial*exp(-((l-.051)/.037)**2)

    toes = []
    for offset, root, length, radius in [(.045,.112,.076,.019),(.011,.118,.062,.014),
                                          (-.016,.115,.055,.0125),(-.039,.108,.047,.0105),
                                          (-.056,.100,.036,.0095)]:
        toes.append(sculpt('Toe', [
            (root-.024,offset*.92,.026,radius*1.13,radius*.89),
            (root+.002,offset,.026,radius,radius*.83),
            (root+length*.30,offset*1.02,.025,radius*.89,radius*.77),
            (root+length*.51,offset*1.05,.024,radius*.92,radius*.80),
            (root+length*.73,offset*1.05,.021,radius*.86,radius*.71),
            (root+length*.88,offset*1.06,.019,radius*.75,radius*.64),
            (root+length*.96,offset*1.07,.018,radius*.52,radius*.49),
            (root+length,offset*1.07,.018,.004,.004),
        ], 16))
    weld_skin(leg, [heel, *toes], .0042, .47)
    smooth_joint(leg, ankle, .114, ground=support)
    # A little compression at the foot's bearing surface, without flattening
    # the arch or changing the end of the visible shin.
    for vertex in leg.data.vertices:
        incoming = vertex.co.z - support
        if incoming < .008:
            vertex.co.z = support + .0015 + .81*max(0, incoming)


def build_exposed_skin(collection, skin, resting, sweep):
    limbs = []
    for side in (-1, 1):
        arm_path = arm_sections(side, resting)
        arm = sweep(collection, f'Sleeper_Arm_{side}', arm_path, skin, sides=28,
                    across=Vector((0, 0, 1) if resting else (0, 1, 0)),
                    profile=lambda t,u,v:arm_profile(t,u,v,side,resting))
        hand(collection, arm, Vector(arm_path[-1][:3]), side, skin, resting, sweep)
        arm['sleeper_region'] = 'arm'
        leg_path = leg_sections(side, resting)
        hip = (side*.075,-.015,.571) if resting else (side*.075,.011,neutral_z(381))
        rooted_leg = [(*hip,.049,.055), *leg_path]
        leg = sweep(collection, f'Sleeper_Leg_{side}', rooted_leg, skin, sides=32,
                    across=Vector((1,0,0)),
                    profile=lambda t,u,v:leg_profile(t,u,v,side,resting))
        foot(collection, leg, Vector(leg_path[-1][:3]), side, skin, resting, sweep)
        leg['sleeper_region'] = 'leg'
        limbs.extend((arm, leg))
    return limbs


def build_anatomy(collection, skin, resting, face, limbs, sweep):
    """Keep a single closed body study in the Blender master, under the costume."""
    core = []
    for row, width, thickness, posed in CORE_STATIONS:
        centre = posed if resting else (0, .019, neutral_z(row))
        core.append((*centre, width, thickness))
    body = sweep(collection, 'Sleeper_Anatomy', core, skin, across=Vector((1,0,0)), sides=44)
    for vertex in body.data.vertices:
        x,y,z = vertex.co
        if resting:
            # Leave a shallow sternum valley between the large chest planes
            # and carry them back into the deltoids near the arms.
            upper = max(0, min(1, (z-.610)/.085))
            vertex.co.z += .018*upper*exp(-((abs(x)-.087)/.075)**2-((y+.365)/.142)**2)
        else:
            upper = max(0, min(1, (.012-y)/.083))
            vertex.co.y -= .018*upper*exp(-((abs(x)-.087)/.075)**2-((z-neutral_z(269))/.142)**2)
    skin_copies = []
    for part in limbs:
        copy = part.copy()
        copy.data = part.data.copy()
        collection.objects.link(copy)
        skin_copies.append(copy)
    weld_skin(body, skin_copies, .0055, .67)
    # Preview the neck junction as one surface. The exported face is the
    # original, with its exact topology, pigment and expression preserved.
    bpy.context.view_layer.objects.active = body
    neck = body.modifiers.new('Anatomy neck junction', 'BOOLEAN')
    neck.operation = 'UNION'
    neck.object = face
    bpy.ops.object.modifier_apply(modifier=neck.name)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    body['authoring_only'] = True
    body.hide_render = True
    body.hide_set(True)
    return body
