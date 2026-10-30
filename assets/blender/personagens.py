"""Os quatro personagens do Trukenza, em peças articuladas.

    blender -b --factory-startup -P assets/blender/personagens.py [-- --previa caminho.png]

Gera apps/web/public/modelos/personagens.glb com, para cada personagem (`neymt`, `presuntinho`,
`moleti`, `baiaca`), as peças `<id>_tronco`, `<id>_cabeca`, `<id>_olhos`, `<id>_braco`, `<id>_coxa`
e `<id>_canela`. Cada peça é modelada em volta do próprio ponto de giro, nas medidas do esqueleto que
o jogo já anima (`apps/web/src/scene/Character.tsx`):

- quadril: origem do corpo; coxas giram em (±0,11; 0; 0) e o tronco nasce aqui;
- coxa: do quadril até o joelho, 0,42 m para baixo; canela (com o sapato): do joelho até o chão;
- tronco: do quadril até o pescoço (0,62 m); ombros em (±0,27; 0,55; 0);
- braço (com a mão): do ombro para baixo, mão em −0,38 m; o mesmo braço serve aos dois lados;
- cabeça: centro em (0; 0,62 + R; 0), R = raio da cabeça; olhos num grupo próprio (o jogo pisca
  achatando esse grupo), centrado entre os olhos, em (0; 0,04; −R + 0,03) a partir do centro da cabeça.

O boneco olha para −z. Inspirações do briefing sem reproduzir pessoas reais, personagens ou marcas.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import P, apply_all, box, cyl, export, join, lathe, mat, paint, reset, sphere, srgb, torus  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'modelos', 'personagens.glb')

reset()


def tube(name, points, radii, material, sides=10, **kw):
    """Tubo suave por uma sequência de pontos do jogo, com raio por ponto (sobrancelha, bigode, pena, alça)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        u = t.cross(ref).normalized()
        v = t.cross(u).normalized()
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        rings.append([bm.verts.new(P(*(p + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r)))
                      for k in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    for poly in me.polygons:
        poly.use_smooth = True
    o.data.materials.append(material)
    paint(o, kw.get('tint', (1, 1, 1)))
    return o


def arc(center, radius, a0, a1, n=8, plane='xy', bulge=0.0):
    """Pontos num arco (para tubos). `plane='xy'` fica de frente para a câmera; `bulge` empurra o meio para −z."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = a0 + (a1 - a0) * t
        x = center[0] + math.cos(a) * radius
        y = center[1] + math.sin(a) * radius
        z = center[2] - bulge * math.sin(math.pi * t)
        pts.append((x, y, z) if plane == 'xy' else (x, center[1], center[2] + math.sin(a) * radius))
    return pts


def paint_fn(obj, fn):
    """Cor por canto, calculada pela posição no jogo (xadrez, listras, macacão). Aplica os modificadores antes."""
    obj = apply_all([obj])[0]
    me = obj.data
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for poly in me.polygons:
        c = sum((me.vertices[v].co for v in poly.vertices), Vector()) / len(poly.vertices)
        g = (c.x, c.z, -c.y)
        rgb = fn(*g)
        for li in poly.loop_indices:
            col.data[li].color = (*rgb, 1.0) if len(rgb) == 3 else rgb
    me.color_attributes.active_color = col
    return obj


def lin(hexcolor):
    return srgb(hexcolor)[:3]


def body_profile(scale=1.0, neck=0.065):
    """Tronco em pera, do quadril ao pescoço: (raio, altura)."""
    s = scale
    return [(0.05 * s, -0.08), (0.16 * s, -0.065), (0.2 * s, -0.01), (0.215 * s, 0.12), (0.212 * s, 0.3), (0.2 * s, 0.44),
            (0.17 * s, 0.55), (0.11 * s, 0.61), (neck, 0.64), (neck, 0.7)]


SKIN_TONES = {'neymt': '#e9b48f', 'presuntinho': '#ffb3c1', 'moleti': '#e0a376', 'baiaca': '#7a4a2c'}
HEAD_R = {'neymt': 0.22, 'presuntinho': 0.25, 'moleti': 0.22, 'baiaca': 0.22}

parts = []


def build(cid, *, shirt, shirt_fn=None, sleeve_fn=None, pants, shoe, body_scale=1.0, sleeve_skin=False, extras_torso=None,
          extras_head=None, eye_color='#5a3a22', brow='#3a2414', lips='#8a3a2c', boots=None, platform=False, teeth=False):
    R = HEAD_R[cid]
    skin = mat(f'{cid}_pele', SKIN_TONES[cid], rough=0.55)
    shirt_m = mat(f'{cid}_camisa', '#ffffff' if shirt_fn else shirt[0], rough=shirt[1], metal=shirt[2] if len(shirt) > 2 else 0.0)
    pants_m = mat(f'{cid}_calca', pants, rough=0.8)
    shoe_m = mat(f'{cid}_sapato', shoe, rough=0.4, metal=0.6 if platform else 0.0)

    # ---------- coxa e canela
    coxa = lathe(f'{cid}_coxa', (0, -0.45, 0), [(0.01, -0.02), (0.06, 0.0), (0.078, 0.04), (0.088, 0.25), (0.095, 0.43), (0.08, 0.48), (0.01, 0.5)],
                 pants_m, verts=16)
    canela_parts = [lathe('canela', (0, -0.4, 0), [(0.01, -0.01), (0.062, 0.0), (0.07, 0.2), (0.078, 0.38), (0.06, 0.42), (0.01, 0.43)],
                          pants_m, verts=16)]
    if boots:
        boot_m = mat(f'{cid}_bota', boots, rough=0.45)
        canela_parts.append(lathe('cano', (0, -0.4, 0), [(0.074, 0.0), (0.08, 0.12), (0.085, 0.24), (0.088, 0.26)], boot_m, verts=16))
        shoe_m = boot_m
    sole = 0.05 if platform else 0.02
    canela_parts.append(box('sapato', (0, -0.395 + sole, -0.055), (0.13, 0.085, 0.25), shoe_m, bevel=0.035, segments=3))
    canela_parts.append(box('sola', (0, -0.44 + sole / 2, -0.055), (0.135, sole + 0.01, 0.255), mat('sola', '#2a1c14', rough=0.8), bevel=0.01))
    if boots:
        canela_parts.append(box('salto', (0, -0.425, 0.04), (0.11, 0.05, 0.07), mat('sola', '#2a1c14'), bevel=0.008))
    parts.append(coxa)
    parts.append(join(f'{cid}_canela', canela_parts))

    # ---------- tronco
    t = []
    torso = lathe('torso', (0, 0, 0), body_profile(body_scale), shirt_m, verts=28, subdiv=1)
    if shirt_fn:
        torso = paint_fn(torso, shirt_fn)
    t.append(torso)
    for sx in (-1, 1):  # ombros
        o = sphere('ombro', (sx * 0.215 * body_scale, 0.52, 0), (0.085, 0.075, 0.08), shirt_m)
        t.append(paint_fn(o, sleeve_fn or shirt_fn) if (sleeve_fn or shirt_fn) else o)
    t.append(cyl('pescoco', (0, 0.66, 0), 0.062, 0.12, skin, verts=16, smooth=True))
    if extras_torso:
        t.extend(extras_torso(body_scale))
    parts.append(join(f'{cid}_tronco', t))

    # ---------- braço (manga, punho e mão)
    b = []
    sleeve_m = skin if sleeve_skin else shirt_m
    sleeve = lathe('manga', (0, -0.31, 0), [(0.01, -0.01), (0.058, 0.0), (0.062, 0.1), (0.07, 0.28), (0.072, 0.34), (0.01, 0.36)], sleeve_m,
                   verts=16, subdiv=1)
    if not sleeve_skin and (sleeve_fn or shirt_fn):
        sleeve = paint_fn(sleeve, sleeve_fn or shirt_fn)
    b.append(sleeve)
    if not sleeve_skin:
        b.append(cyl('punho', (0, -0.3, 0), 0.064, 0.03, sleeve_m, verts=16, smooth=True, tint=(0.85, 0.85, 0.85)))
    b.append(sphere('mao', (0, -0.38, -0.005), (0.055, 0.07, 0.046), skin))
    b.append(sphere('polegar', (0, -0.355, -0.05), (0.02, 0.034, 0.02), skin))
    parts.append(join(f'{cid}_braco', b))

    # ---------- cabeça (rosto e acessórios)
    h = [sphere('cranio', (0, 0, 0), (R, R * 1.02, R * 0.98), skin, segments=32, rings=24)]
    for sx in (-1, 1):
        h.append(sphere('orelha', (sx * R * 0.97, -0.01, 0.01), (0.035, 0.055, 0.03), skin))
    if cid != 'presuntinho':
        h.append(sphere('nariz', (0, -0.035, -R * 0.98), (0.032, 0.03, 0.036), skin, tint=(0.95, 0.9, 0.88)))
        brow_m = mat(f'{cid}_sobrancelha', brow, rough=0.9)
        for sx in (-1, 1):
            h.append(tube('sobrancelha', arc((sx * 0.085, 0.085, -R * 0.93), 0.055, math.radians(60), math.radians(120), n=6, bulge=0.004),
                          [0.009, 0.013, 0.015, 0.015, 0.013, 0.009], brow_m, sides=8))
    mouth_m = mat(f'{cid}_boca', lips, rough=0.5)
    my = -0.1 if cid != 'presuntinho' else -0.15
    h.append(tube('boca', arc((0, my + 0.05, -R * 0.9), 0.06, math.radians(-150), math.radians(-30), n=9, bulge=0.012),
                  [0.008, 0.011, 0.013, 0.014, 0.014, 0.014, 0.013, 0.011, 0.008], mouth_m, sides=8))
    if teeth:
        h.append(sphere('dentes', (0, my + 0.005, -R * 0.9), (0.04, 0.012, 0.01), mat('dentes', '#fbf6ec', rough=0.3)))
    if extras_head:
        h.extend(extras_head(R, skin))
    parts.append(join(f'{cid}_cabeca', h))

    # ---------- olhos (grupo que pisca)
    e = []
    white = mat('olho_branco', '#fbfaf6', rough=0.2)
    iris = mat(f'{cid}_iris', eye_color, rough=0.25)
    pupil = mat('pupila', '#0d0a08', rough=0.15)
    shine = mat('brilho_olho', '#ffffff', rough=0.1, emit='#ffffff', strength=0.6)
    for sx in (-1, 1):
        x = sx * 0.085
        e.append(sphere('branco', (x, 0, 0.004), (0.058, 0.066, 0.04), white))
        e.append(sphere('iris', (x, -0.006, -0.026), (0.031, 0.036, 0.014), iris))
        e.append(sphere('pupila', (x, -0.007, -0.037), (0.016, 0.019, 0.007), pupil))
        e.append(sphere('brilho', (x + 0.012, 0.011, -0.042), (0.007, 0.007, 0.004), shine, segments=8, rings=6))
    parts.append(join(f'{cid}_olhos', e))


# ======================================================================== NeyMT
FEATHERS = ['#e63946', '#f4a261', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f15bb5']
GOLD = mat('ouro', '#e8b43a', rough=0.25, metal=1.0)


def neymt_torso(s):
    out = []
    # Gola em V dourada e ombreiras teatrais.
    for sx in (-1, 1):
        out.append(tube('gola', [(sx * 0.09, 0.6, -0.1), (sx * 0.05, 0.48, -0.17), (0.0, 0.38, -0.2)], 0.014, GOLD, sides=8))
        out.append(sphere('ombreira', (sx * 0.24, 0.6, 0), (0.1, 0.04, 0.09), GOLD))
    out.append(cyl('cinto', (0, 0.03, 0), 0.208 * s, 0.05, GOLD, verts=28, smooth=True))
    return out


def neymt_head(R, skin):
    out = [sphere('cabelo', (0, 0.07, 0.03), (R * 1.03, R * 0.78, R * 1.02), mat('neymt_cabelo', '#1d1410', rough=0.8))]
    out.append(torus('tiara', (0, 0.13, 0), R * 0.98, 0.022, GOLD, rot=(0.25, 0, 0)))
    for i, c in enumerate(FEATHERS):
        a = math.radians(-66 + i * 22)
        base = Vector((math.sin(a) * R * 0.75, 0.16 + math.cos(a) * 0.05, 0.06))
        d = Vector((math.sin(a) * 0.7, math.cos(a), 0.18)).normalized()
        pts = [tuple(base + d * (k * 0.062) + Vector((0, 0, 0.004 * k * k))) for k in range(6)]
        out.append(tube('pena', pts, [0.012, 0.03, 0.038, 0.035, 0.024, 0.006], mat(f'pena{i}', c, rough=0.6), sides=8))
    shadow = mat('neymt_sombra', '#7b2fbe', rough=0.4, metal=0.3)
    for sx in (-1, 1):
        out.append(sphere('sombra_olho', (sx * 0.088, 0.075, -R * 0.86), (0.06, 0.024, 0.02), shadow))
        out.append(torus('brinco', (sx * R * 0.98, -0.1, 0.0), 0.03, 0.006, GOLD, rot=(0, math.pi / 2, 0)))
    return out


build('neymt', shirt=('#6c22b8', 0.28, 0.55), pants='#2b1640', shoe='#e8b43a', platform=True, body_scale=0.93,
      extras_torso=neymt_torso, extras_head=neymt_head, eye_color='#3b6b3a', brow='#1d1410', lips='#c0263a')

# ======================================================================== Presuntinho
PINK = '#ffb3c1'
DENIM = lin('#3a7cc9')


def pig_shirt(x, y, z):
    # Macacão: pernas e frente azuis, peito à mostra rosado.
    bib = z < -0.06 and abs(x) < 0.13 and y < 0.5
    return DENIM if (y < 0.36 or bib) else lin(PINK)


def pig_torso(s):
    denim = mat('presuntinho_macacao', '#3a7cc9', rough=0.8)
    out = []
    for sx in (-1, 1):
        out.append(tube('alca', [(sx * 0.1, 0.48, -0.2), (sx * 0.15, 0.6, -0.12), (sx * 0.16, 0.62, 0.05), (sx * 0.13, 0.45, 0.2)], 0.018, denim,
                        sides=6))
        out.append(sphere('botao', (sx * 0.1, 0.47, -0.215), (0.018, 0.018, 0.01), GOLD))
    pink = mat('presuntinho_pele', PINK)
    out.append(tube('rabinho', [(0.04 * math.cos(k * 1.4), 0.1 + 0.012 * k, 0.24 + 0.012 * k + 0.03 * math.sin(k * 1.4)) for k in range(8)], 0.014,
                    pink, sides=6))
    return out


def pig_head(R, skin):
    snout_m = mat('presuntinho_focinho', '#ff8fa8', rough=0.5)
    out = [cyl('focinho', (0, -0.05, -R + 0.01), 0.095, 0.11, snout_m, axis='z', verts=24, bevel=0.03, segments=3)]
    nostril = mat('narina', '#7a2a3c', rough=0.6)
    for sx in (-1, 1):
        out.append(sphere('narina', (sx * 0.035, -0.05, -R - 0.045), (0.016, 0.024, 0.01), nostril))
        # Orelhas caídas para a frente.
        out.append(sphere('orelha_porco', (sx * 0.15, 0.2, -0.03), (0.075, 0.1, 0.022), snout_m, rot=(0.6, sx * 0.5, sx * -0.4)))
        out.append(sphere('bochecha', (sx * 0.15, -0.07, -R * 0.78), (0.05, 0.035, 0.02), mat('rubor', '#ff8098', rough=0.6)))
    return out


build('presuntinho', shirt=('#ffffff', 0.7), shirt_fn=pig_shirt, pants='#3a7cc9', shoe='#5a2e2e', body_scale=1.15, sleeve_skin=True,
      extras_torso=pig_torso, extras_head=pig_head, eye_color='#2f5ea8', lips='#8a3a4c')

# ======================================================================== Moleti
RED = lin('#c4432b')
YEL = lin('#e8b04a')
DARK = lin('#3b1d14')


def plaid(x, y, z):
    a = math.atan2(x, -z)
    v = int((y + 1) / 0.055) % 4 == 0
    h = int((a + 4) / 0.32) % 4 == 0
    if v and h:
        return DARK
    if v or h:
        return YEL
    return RED


def moleti_torso(s):
    out = [cyl('cinto', (0, 0.03, 0), 0.21 * s, 0.055, mat('moleti_cinto', '#5a3018', rough=0.5), verts=28, smooth=True)]
    out.append(box('fivela', (0, 0.03, -0.215), (0.11, 0.07, 0.025), GOLD, bevel=0.01))
    out.append(torus('gola', (0, 0.6, 0), 0.085, 0.022, mat('moleti_camisa', '#ffffff'), tint=(0.9, 0.3, 0.2)))
    for k in range(3):
        out.append(sphere('botao', (0, 0.48 - k * 0.12, -0.215 + k * 0.0), (0.012, 0.012, 0.008), mat('botao', '#f0e6d2')))
    return out


def moleti_head(R, skin):
    hair = mat('moleti_cabelo', '#4a2c16', rough=0.85)
    out = [sphere('topete', (0, 0.1, 0.0), (R * 1.08, R * 0.7, R * 1.06), hair)]
    out.append(sphere('franja', (0.03, 0.17, -0.13), (0.14, 0.07, 0.09), hair, rot=(0, 0, -0.3)))
    # O mullet: volume atrás descendo até a nuca, com as pontas viradas.
    out.append(sphere('nuca', (0, -0.08, 0.13), (0.2, 0.22, 0.13), hair))
    for sx in (-1, 1):
        out.append(sphere('ponta', (sx * 0.12, -0.27, 0.12), (0.08, 0.06, 0.07), hair))
        out.append(box('costeleta', (sx * R * 0.93, -0.03, -0.05), (0.03, 0.1, 0.06), hair, bevel=0.012))
    out.append(tube('bigode', [(-0.085, -0.095, -R * 0.86), (-0.04, -0.07, -R * 0.97), (0, -0.068, -R * 0.99), (0.04, -0.07, -R * 0.97),
                               (0.085, -0.095, -R * 0.86)], [0.012, 0.022, 0.024, 0.022, 0.012], mat('moleti_bigode', '#3a210f'), sides=8))
    return out


build('moleti', shirt=('#ffffff', 0.85), shirt_fn=plaid, pants='#2f4b7a', shoe='#6b3b1c', boots='#7a4420', extras_torso=moleti_torso,
      extras_head=moleti_head, eye_color='#4a6b2a', brow='#3a210f')

# ======================================================================== Baiaca
STRIPES = [lin('#d62828'), lin('#f2c21b'), lin('#2a9d3f'), lin('#1d1d1d')]


def stripes(x, y, z):
    return STRIPES[int((y + 1) / 0.07) % 4]


def baiaca_torso(s):
    out = []
    beads = ['#d62828', '#f2c21b', '#2a9d3f', '#fbf6ec']
    for k in range(18):  # fio de contas no pescoço
        a = 2 * math.pi * k / 18
        out.append(sphere('conta', (math.sin(a) * 0.105, 0.6 - 0.05 * max(0, -math.cos(a)), -math.cos(a) * 0.1), (0.014, 0.014, 0.014),
                          mat(f'conta{k % 4}', beads[k % 4], rough=0.3), segments=8, rings=6))
    return out


def baiaca_head(R, skin):
    hair = mat('baiaca_cabelo', '#1a120d', rough=0.95)
    out = [sphere('cabelo', (0, 0.03, 0.02), (R * 1.03, R * 0.85, R * 1.03), hair)]
    # Boina de crochê em faixas, puxada para trás.
    cap = lathe('boina', (0, 0.07, 0.04), [(R * 1.0, 0.0), (R * 1.08, 0.04), (R * 1.25, 0.11), (R * 1.18, 0.17), (R * 0.7, 0.22), (0.02, 0.235)],
                mat('baiaca_boina', '#ffffff', rough=0.95), verts=28, subdiv=1)
    cap.rotation_euler = (math.radians(-12), 0, 0)
    bpy.context.view_layer.objects.active = cap
    cap = paint_fn(cap, lambda x, y, z: STRIPES[[2, 1, 0, 3][min(3, int((y - 0.07) / 0.06))]])
    out.append(cap)
    beard = mat('baiaca_barba', '#1a120d', rough=0.95)
    out.append(sphere('barba', (0, -0.165, -0.11), (0.115, 0.07, 0.1), beard))
    for sx in (-1, 1):
        out.append(sphere('brinco', (sx * R * 0.98, -0.06, 0.0), (0.012, 0.012, 0.012), GOLD))
    return out


build('baiaca', shirt=('#ffffff', 0.8), shirt_fn=stripes, pants='#f2ede2', shoe='#6b3b1c', extras_torso=baiaca_torso,
      extras_head=baiaca_head, eye_color='#3a2414', brow='#1a120d', lips='#5a2a22', teeth=True)

# ---------------------------------------------------------------- exportação
for o in parts:
    o.data.color_attributes.active_color = o.data.color_attributes['Col']
os.makedirs(os.path.dirname(OUT), exist_ok=True)
export(OUT, parts)
tris = sum(len(p.vertices) - 2 for o in parts for p in o.data.polygons)
print(f'PERSONAGENS: {OUT} ({os.path.getsize(OUT) / 1e6:.2f} MB, {tris} triângulos, {len(parts)} peças)')

# Prévia: os quatro lado a lado, montados como no jogo (de pé), para conferir sem abrir o navegador.
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--previa' in argv:
    path = argv[argv.index('--previa') + 1]
    sc = bpy.context.scene
    for i, cid in enumerate(HEAD_R):
        x0 = (i - 1.5) * 0.9
        R = HEAD_R[cid]

        def place(name, at):
            src = bpy.data.objects[f'{cid}_{name}']
            c = src.copy()
            c.location = src.location + P(x0 + at[0], at[1], at[2])
            sc.collection.objects.link(c)

        place('tronco', (0, 0.93, 0))
        place('cabeca', (0, 0.93 + 0.62 + R, 0))
        place('olhos', (0, 0.93 + 0.62 + R + 0.04, -R + 0.03))
        for sx in (-1, 1):
            place('braco', (sx * 0.27, 0.93 + 0.55, 0))
            place('coxa', (sx * 0.11, 0.93, 0))
            place('canela', (sx * 0.11, 0.93 - 0.42, 0))
    for o in parts:
        o.hide_render = True
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 32
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    cam.location = P(0.3, 1.35, -4.6)
    target = P(0, 1.0, 0)
    # O render do Blender só mostra a cor por vértice se o material a ler (o glTF a exporta de qualquer jeito).
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
        nt.links.new(attr.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    for name, loc, energy in [('chave', P(2, 3, -3), 700), ('recorte', P(-2.5, 2.5, 1.5), 300), ('preench', P(-2, 1, -3), 250)]:
        ld = bpy.data.lights.new(name, 'POINT')
        ld.energy = energy
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        sc.collection.objects.link(lo)
    if sc.world is None:
        sc.world = bpy.data.worlds.new('mundo')
    sc.world.color = (0.25, 0.2, 0.17)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 1100, 620
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('PREVIA:', path)
