"""Os personagens do Trukenza, em peças articuladas.

    blender -b --factory-startup -P assets/blender/personagens.py [-- --previa caminho.png]

Gera apps/web/public/modelos/personagens.glb com, para cada personagem (`neymt`, `presuntinho`,
`moleti`, `baiaca`, `luistesoura`, `sardinha`, `gordodofusca`, `tiba`, `negon`), corpo articulado e peças
faciais separadas: olho_esq, olho_dir, sobrancelhas, boca, nariz e abertura. Cada peça é modelada nas medidas do esqueleto que
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


SKIN_TONES = {'neymt': '#e9b48f', 'presuntinho': '#ffb3c1', 'moleti': '#e0a376', 'baiaca': '#7a4a2c',
              'luistesoura': '#d8a077', 'sardinha': '#84929d', 'gordodofusca': '#ad734d', 'tiba': '#c78c64', 'negon': '#633d2a'}
HEAD_R = {'neymt': 0.22, 'presuntinho': 0.25, 'moleti': 0.22, 'baiaca': 0.22, 'luistesoura': 0.23, 'sardinha': 0.235, 'gordodofusca': 0.25, 'tiba': 0.23, 'negon': 0.30}

parts = []


def build(cid, *, shirt, shirt_fn=None, sleeve_fn=None, pants, shoe, body_scale=1.0, sleeve_skin=False, extras_torso=None,
          extras_head=None, eye_color='#5a3a22', brow='#3a2414', lips='#8a3a2c', boots=None, platform=False, teeth=False,
          feline=False, short_sleeves=False):
    R = HEAD_R[cid]
    skin = mat(f'{cid}_pele', SKIN_TONES[cid], rough=0.72)
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
    if cid == 'gordodofusca':
        coxa.scale.x *= 1.25
        coxa.scale.y *= 1.25  # profundidade no Blender; altura fica igual para preservar os joelhos
    canela = join(f'{cid}_canela', canela_parts)
    if cid == 'negon':
        for leg in [coxa, canela]:
            leg.scale.x *= 0.8
            leg.scale.y *= 0.8
    parts.append(coxa)
    parts.append(canela)

    # ---------- tronco
    t = []
    torso = lathe('torso', (0, 0, 0), body_profile(body_scale), shirt_m, verts=28, subdiv=1)
    if shirt_fn:
        torso = paint_fn(torso, shirt_fn)
    t.append(torso)
    for sx in (-1, 1):  # ombros
        o = sphere('ombro', (sx * 0.198 * body_scale, 0.50, 0), (0.082, 0.105, 0.078), shirt_m)
        t.append(paint_fn(o, sleeve_fn or shirt_fn) if (sleeve_fn or shirt_fn) else o)
    t.append(cyl('pescoco', (0, 0.66, 0), 0.062, 0.12, skin, verts=16, smooth=True))
    if extras_torso:
        t.extend(extras_torso(body_scale))
    parts.append(join(f'{cid}_tronco', t))

    # ---------- braço (manga, punho e mão)
    b = []
    sleeve_m = skin if sleeve_skin else shirt_m
    if short_sleeves:
        sleeve = lathe('manga_curta', (0, -0.15, 0), [(0.01, -0.01), (0.072, 0), (0.075, 0.06), (0.074, 0.16), (0.01, 0.20)],
                       sleeve_m, verts=16, subdiv=1)
        b.append(lathe('antebraco', (0, -0.32, 0), [(0.01, -0.015), (0.052, 0), (0.057, 0.12), (0.06, 0.19), (0.01, 0.20)], skin, verts=16, subdiv=1))
        b.append(cyl('barra_manga', (0, -0.145, 0), 0.072, 0.025, mat('tiba_barra', '#202126'), verts=16, smooth=True))
    else:
        sleeve = lathe('manga', (0, -0.31, 0), [(0.01, -0.01), (0.058, 0.0), (0.062, 0.1), (0.07, 0.28), (0.072, 0.34), (0.01, 0.36)], sleeve_m,
                       verts=16, subdiv=1)
    if not sleeve_skin and (sleeve_fn or shirt_fn):
        sleeve = paint_fn(sleeve, sleeve_fn or shirt_fn)
    b.append(sleeve)
    if not sleeve_skin and not short_sleeves:
        b.append(cyl('punho', (0, -0.3, 0), 0.064, 0.03, sleeve_m, verts=16, smooth=True, tint=(0.85, 0.85, 0.85)))
    b.append(sphere('mao', (0, -0.38, -0.005), (0.055, 0.07, 0.046), skin))
    b.append(sphere('polegar', (0, -0.355, -0.05), (0.02, 0.034, 0.02), skin))
    arm = join(f'{cid}_braco', b)
    if cid == 'negon':
        arm.scale.x *= 0.82
        arm.scale.y *= 0.82
    parts.append(arm)

    # ---------- cabeça (rosto e acessórios)
    h = [sphere('cranio', (0, 0, 0), (R, R * 1.02, R * 0.98), skin, segments=40, rings=28)]
    if not feline:
        for sx in (-1, 1):
            h.append(sphere('orelha', (sx * R * 0.97, -0.01, 0.01), (0.035, 0.055, 0.03), skin))
            h.append(sphere('orelha_interna', (sx * R * 1.025, -0.01, -0.012), (0.016, 0.029, 0.008), skin,
                            tint=(0.87, 0.73, 0.68), segments=16, rings=12))
    if cid not in ('presuntinho', 'sardinha'):
        for sx in (-1, 1):
            # Volume discreto nas maçãs do rosto; mesma pele, sem bolinhas coladas.
            h.append(sphere('maca_rosto', (sx * 0.10, -0.075, -R * 0.64), (0.086, 0.060, 0.052), skin,
                            tint=(1.0, 0.94, 0.91), segments=20, rings=16))
        # União volumétrica da pele: bochechas e orelhas fazem parte do rosto, sem costuras de esferas.
        face = join('rosto_unido', h)
        remesh = face.modifiers.new('pele_continua', 'REMESH')
        remesh.mode = 'VOXEL'
        remesh.voxel_size = 0.011
        remesh.use_smooth_shade = True
        smooth = face.modifiers.new('suavizar_pele', 'SMOOTH')
        smooth.factor, smooth.iterations = 0.8, 4
        face = apply_all([face])[0]
        paint(face, (1, 1, 1))
        h = [face]
    for sx in (-1, 1):
        # Pálpebra superior prende os olhos ao rosto; os olhos continuam no grupo separado que pisca.
        h.append(tube('palpebra', arc((sx * 0.085, 0.04, -R + 0.016), 0.060,
                      math.radians(18), math.radians(162), n=12, bulge=0.006),
                      [0.004, 0.005, 0.007, 0.008, 0.009, 0.009, 0.009, 0.009, 0.008, 0.007, 0.005, 0.004], skin, sides=8))
    if cid != 'presuntinho' and not feline:
        h.append(sphere('nariz', (0, -0.035, -R * 0.98), (0.032, 0.03, 0.036), skin, tint=(0.95, 0.9, 0.88)))
    brow_m = mat(f'{cid}_sobrancelha', brow, rough=0.9)
    for sx in (-1, 1):
        h.append(tube('sobrancelha', arc((sx * 0.085, 0.085, -R * 0.93), 0.055, math.radians(60), math.radians(120), n=6, bulge=0.004),
                      [0.009, 0.013, 0.015, 0.015, 0.013, 0.009], brow_m, sides=8))
    mouth_m = mat(f'{cid}_boca', lips, rough=0.5)
    my = -0.1 if cid != 'presuntinho' else -0.15
    if not feline and cid != 'negon':
        h.append(tube('boca', arc((0, my + 0.05, -R * 0.9), 0.06, math.radians(-150), math.radians(-30), n=9, bulge=0.012),
                      [0.008, 0.011, 0.013, 0.014, 0.014, 0.014, 0.013, 0.011, 0.008], mouth_m, sides=8))
    if teeth:
        h.append(sphere('dentes', (0, my + 0.005, -R * 0.9), (0.04, 0.012, 0.01), mat('dentes', '#fbf6ec', rough=0.3)))
    if extras_head:
        h.extend(extras_head(R, skin))
    # Expressões separadas da pele. O cliente anima os clones, sem deformar cabelo, aparelho ou olhos do gato.
    facial = {
        'sobrancelhas': ('sobrancelha',),
        'boca': ('boca', 'dentes', 'sorriso', 'fio_aparelho', 'elastico_aparelho', 'braquete'),
        'nariz': ('nariz', 'narina') + (('focinho',) if cid == 'presuntinho' else ()),
    }
    for part, prefixes in facial.items():
        selected = [o for o in h if o.name.startswith(prefixes)]
        h = [o for o in h if o not in selected]
        parts.append(join(f'{cid}_{part}', selected))
    opening = sphere(f'{cid}_abertura', (0, my, -R * (1.14 if feline else 0.96)),
                     (0.047, 0.032, 0.018), mat('interior_boca', '#301c20', rough=0.95))
    parts.append(opening)
    parts.append(join(f'{cid}_cabeca', h))

    # ---------- olhos (grupo que pisca)
    white = mat('olho_branco', '#fbfaf6', rough=0.2)
    iris = mat(f'{cid}_iris', eye_color, rough=0.25)
    pupil = mat('pupila', '#0d0a08', rough=0.15)
    shine = mat('brilho_olho', '#ffffff', rough=0.1, emit='#ffffff', strength=0.6)
    for sx in (-1, 1):
        e = []
        x = sx * 0.085
        e.append(sphere('branco', (x, 0, 0.002), (0.055, 0.062, 0.032), white))
        # Sardinha: um olho normal; o outro permanentemente baixo e voltado para o peixe no peito.
        down = feline and sx == 1
        ix, iy, iz = (x - 0.01, -0.037, -0.018) if down else (x, -0.006, -0.026)
        e.append(sphere('iris', (ix, iy, iz), (0.031, 0.025 if down else 0.036, 0.014), iris))
        e.append(sphere('pupila', (ix, iy - 0.001, iz - 0.011), (0.009 if feline else 0.016, 0.019, 0.007), pupil))
        highlight = (ix + 0.009, iy + 0.01, iz - 0.016) if feline else (x + 0.012, 0.011, -0.042)
        e.append(sphere('brilho', highlight, (0.007, 0.007, 0.004), shine, segments=8, rings=6))
        parts.append(join(f'{cid}_olho_{"esq" if sx == -1 else "dir"}', e))


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


build('neymt', shirt=('#6c22b8', 0.7, 0.08), pants='#2b1640', shoe='#e8b43a', platform=True, body_scale=0.93,
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

# ======================================================================== Luis Tesoura e Sardinha
def applique(name, outline, material, radius=0.218):
    """Aplique fino que acompanha a curva da camisa; não fica suspenso diante do peito."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0)) for x, y in outline]
    bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=7, use_grid_fill=True)
    for v in bm.verts:
        x, y = v.co.x, v.co.y
        v.co = P(x, y, -math.sqrt(max(0.001, radius * radius - x * x)) - 0.007)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    paint(o, (1, 1, 1))
    return o


APRON = lin('#263e50')
LINEN = lin('#f0e7d7')


def luis_shirt(x, y, z):
    # Avental sobre camisa de linho; as mangas usam só a cor do tecido.
    front = z < -0.02 and (y < 0.34 or (abs(x) < 0.14 and y < 0.55))
    return APRON if front else LINEN


def luis_torso(s):
    leather = mat('luis_couro', '#d99a52', rough=0.7)
    steel = mat('luis_aco', '#dce5eb', rough=0.25, metal=0.8)
    pocket = mat('luis_bolso', '#38576a', rough=0.85)
    out = []
    for sx in (-1, 1):
        out.append(tube('avental_alca', [(sx * 0.115, 0.48, -0.18), (sx * 0.16, 0.59, -0.10),
                        (sx * 0.16, 0.61, 0.045), (sx * 0.13, 0.4, 0.18)], 0.015, leather, sides=8))
        out.append(sphere('avental_rebite', (sx * 0.115, 0.48, -0.19), (0.012, 0.012, 0.006), GOLD, segments=10, rings=8))
    out.append(applique('bolso_avental', [(-0.13, 0.16), (0.13, 0.16), (0.13, 0.32), (-0.13, 0.32)], pocket))
    # Tesoura presa no peito: duas argolas, lâminas cruzadas e parafuso no eixo.
    for x in (-0.082, -0.012):
        out.append(torus('tesoura_argola', (x, 0.357, -0.231), 0.023, 0.005, leather, rot=(math.pi / 2, 0, 0)))
    out.append(tube('tesoura_lamina', [(-0.082, 0.38, -0.232), (-0.047, 0.409, -0.235), (0.005, 0.495, -0.23)],
                    [0.007, 0.009, 0.001], steel, sides=6))
    out.append(tube('tesoura_lamina', [(-0.012, 0.38, -0.235), (-0.047, 0.409, -0.238), (-0.099, 0.495, -0.21)],
                    [0.007, 0.009, 0.001], steel, sides=6))
    out.append(sphere('tesoura_eixo', (-0.047, 0.409, -0.245), (0.011, 0.011, 0.005), GOLD, segments=12, rings=8))
    comb = mat('luis_pente', '#b84c45', rough=0.55)
    out.append(box('pente_dorso', (0.073, 0.365, -0.22), (0.012, 0.16, 0.012), comb, bevel=0.004))
    for k in range(9):
        out.append(box('pente_dente', (0.095, 0.30 + k * 0.016, -0.22), (0.04, 0.005, 0.01), comb, bevel=0.002))
    # Uma toalha pequena sobre um ombro.
    towel = mat('luis_toalha', '#e8dfc9', rough=1.0)
    out.append(box('toalha_ombro', (0.215, 0.53, 0), (0.09, 0.025, 0.20), towel, bevel=0.012, segments=3))
    out.append(box('toalha_ponta', (0.215, 0.44, -0.10), (0.09, 0.19, 0.022), towel, bevel=0.01, segments=3))
    return out


def luis_head(R, skin):
    # Cabeça inteiramente careca: só sobrancelhas e um bigode curto bem aparado.
    whisker = mat('luis_bigode', '#4d3025', rough=0.9)
    return [tube('bigode_aparado', [(-0.07, -0.082, -R * 0.92), (-0.035, -0.066, -R * 1.01),
                 (0, -0.072, -R * 1.025), (0.035, -0.066, -R * 1.01), (0.07, -0.082, -R * 0.92)],
                 [0.006, 0.012, 0.01, 0.012, 0.006], whisker, sides=8)]


build('luistesoura', shirt=('#ffffff', 0.85), shirt_fn=luis_shirt, sleeve_fn=lambda x, y, z: LINEN,
      pants='#253441', shoe='#51372a', extras_torso=luis_torso, extras_head=luis_head,
      eye_color='#5b794b', brow='#4d3025', lips='#834d39')


def cat_ear(name, sx, material, inset=False):
    # Cunha triangular com volume; o triângulo rosado fica na face da frente.
    points = [(sx * 0.105, 0.155, -0.08), (sx * 0.215, 0.145, -0.015), (sx * 0.205, 0.325, -0.015),
              (sx * 0.105, 0.155, 0.045), (sx * 0.215, 0.145, 0.08), (sx * 0.205, 0.325, 0.04)]
    faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    if inset:
        points = [(sx * 0.14, 0.18, -0.069), (sx * 0.196, 0.176, -0.038), (sx * 0.197, 0.282, -0.031)]
        faces = [(0, 1, 2)]
    me = bpy.data.meshes.new(name)
    me.from_pydata([P(*p) for p in points], [], faces)
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    paint(o, (1, 1, 1))
    return o


def sardinha_head(R, skin):
    cream = mat('sardinha_focinho', '#eee6d4', rough=0.85)
    pink = mat('sardinha_rosa', '#cc8c96', rough=0.65)
    ink = mat('sardinha_bigode', '#3a4650', rough=0.85)
    out = []
    for sx in (-1, 1):
        out.extend([cat_ear('orelha_gato', sx, skin), cat_ear('orelha_interna', sx, pink, inset=True)])
        out.append(sphere('focinho_gato', (sx * 0.047, -0.078, -R * 0.96), (0.067, 0.048, 0.045), cream))
        for k in range(3):
            out.append(tube('bigode_gato', [(sx * 0.095, -0.075 - k * 0.015, -R * 1.04),
                            (sx * 0.18, -0.065 - k * 0.021, -R * 1.01), (sx * 0.285, -0.045 - k * 0.03, -R * 0.92)],
                            [0.0035, 0.003, 0.001], ink, sides=6))
        out.append(tube('sorriso_gato', [(0, -0.085, -R * 1.16), (sx * 0.024, -0.112, -R * 1.12),
                        (sx * 0.052, -0.105, -R * 1.09)], 0.004, ink, sides=6))
    out.append(sphere('nariz_gato', (0, -0.049, -R * 1.13), (0.028, 0.019, 0.017), pink))
    # Três marcas curtas no topo, sem cobrir os olhos.
    for x in (-0.06, 0, 0.06):
        out.append(tube('marca_pelo', [(x, 0.11, -0.205), (x * 0.8, 0.145, -0.181), (x * 0.7, 0.17, -0.15)],
                        [0.007, 0.011, 0.003], ink, sides=6))
    return out


def sardinha_torso(s):
    fish = mat('sardinha_peixe', '#ffb44a', rough=0.85)
    fin = mat('sardinha_barbatana', '#e98732', rough=0.85)
    ink = mat('sardinha_estampa_tinta', '#263e50', rough=0.9)
    out = [applique('peixe_corpo', [(0.025 + 0.095 * math.cos(k * math.pi / 12), 0.41 + 0.049 * math.sin(k * math.pi / 12))
                                 for k in range(24)], fish),
           applique('peixe_cauda', [(-0.065, 0.41), (-0.135, 0.459), (-0.135, 0.361)], fish),
           applique('peixe_barbatana', [(-0.015, 0.449), (0.025, 0.493), (0.065, 0.449)], fin)]
    out.append(sphere('peixe_olho', (0.082, 0.423, -0.214), (0.009, 0.009, 0.005), ink, segments=12, rings=8))
    out.append(tube('peixe_guelra', [(0.055, 0.435, -0.224), (0.045, 0.411, -0.227), (0.055, 0.388, -0.224)], 0.003, ink, sides=6))
    fur = mat('sardinha_pele', SKIN_TONES['sardinha'])
    tail = [Vector(p) for p in [(0, 0.08, 0.20), (0.18, 0.13, 0.31), (0.34, 0.29, 0.27),
                              (0.40, 0.49, 0.22), (0.37, 0.64, 0.17), (0.29, 0.67, 0.14)]]
    smooth_tail = []
    for i in range(len(tail) - 1):
        a, b, c, d = tail[max(0, i - 1)], tail[i], tail[i + 1], tail[min(len(tail) - 1, i + 2)]
        for k in range(6):
            t = k / 6
            smooth_tail.append(tuple(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                                          + (-a + 3 * b - 3 * c + d) * t * t * t)))
    smooth_tail.append(tuple(tail[-1]))
    out.append(tube('cauda_gato', smooth_tail, [0.037 - 0.019 * (i / (len(smooth_tail) - 1)) ** 2
                                             for i in range(len(smooth_tail))], fur, sides=12))
    out.append(sphere('cauda_ponta', tuple(tail[-1]), (0.018, 0.018, 0.018), fur, segments=12, rings=8))
    return out


build('sardinha', shirt=('#197d83', 0.9), pants='#344b61', shoe='#84929d', extras_torso=sardinha_torso,
      extras_head=sardinha_head, eye_color='#b6c953', feline=True, lips='#3a4650')

# ======================================================================== Gordo do Fusca
def fusca_head(R, skin):
    hair = mat('fusca_cabelo', '#241a16', rough=0.95)
    curl = mat('fusca_cachos', '#33241c', rough=1.0)
    out = [sphere('black_power_volume', (0, 0.205, 0.065), (0.325, 0.29, 0.27), hair, segments=28, rings=20)]
    # Cachos distribuídos deterministicamente pela superfície, sem cobrir o rosto.
    for k in range(180):
        y = 1 - 2 * (k + 0.5) / 180
        a = k * math.pi * (3 - math.sqrt(5))
        r = math.sqrt(1 - y * y)
        x, z = r * math.cos(a), r * math.sin(a)
        if y < -0.15 and z < -0.25:
            continue
        size = 0.033 + 0.004 * math.sin(k * 2.3)
        out.append(sphere('cacho', (x * 0.322, 0.205 + y * 0.285, 0.065 + z * 0.267),
                          (size, size * 0.9, size), curl if k % 4 == 0 else hair, segments=10, rings=8))
    return out


def fusca_torso(s):
    yellow = mat('fusca_estampa', '#f2c45b', rough=0.9)
    window = mat('fusca_janelas', '#344f57', rough=0.9)
    tire = mat('fusca_pneus', '#302c29', rough=1.0)
    cream = mat('fusca_detalhes', '#f7ead0', rough=0.9)
    radius = 0.214 * s
    # Silhueta original de um carro antigo arredondado, sem emblemas ou logotipos.
    out = [applique('fusca_carro', [(-0.21, 0.29), (-0.21, 0.32), (-0.19, 0.346), (-0.15, 0.36),
                    (-0.128, 0.388), (-0.105, 0.415), (-0.075, 0.437), (-0.04, 0.449), (0, 0.451),
                    (0.035, 0.443), (0.066, 0.426), (0.092, 0.40), (0.116, 0.365), (0.16, 0.355),
                    (0.192, 0.339), (0.207, 0.318), (0.21, 0.30), (0.20, 0.28), (-0.19, 0.28)], yellow, radius)]
    for outline in [[(-0.112, 0.365), (-0.092, 0.403), (-0.068, 0.425), (-0.04, 0.433), (-0.023, 0.433), (-0.023, 0.365)],
                    [(-0.006, 0.365), (-0.006, 0.434), (0.028, 0.425), (0.053, 0.407), (0.082, 0.365)]]:
        out.append(applique('fusca_janela', outline, window, radius + 0.003))
    for x in (-0.13, 0.135):
        out.append(applique('fusca_paralama', [(x + 0.059 * math.cos(k * math.pi / 16), 0.291 + 0.06 * math.sin(k * math.pi / 16))
                                             for k in range(17)], cream, radius + 0.002))
        for name, rad, m, offset in [('pneu', 0.042, tire, 0.004), ('calota', 0.023, cream, 0.006)]:
            out.append(applique('fusca_' + name, [(x + rad * math.cos(k * math.pi / 12), 0.287 + rad * math.sin(k * math.pi / 12))
                                                 for k in range(24)], m, radius + offset))
    out.append(applique('fusca_farol', [(0.183, 0.317), (0.202, 0.313), (0.197, 0.332), (0.18, 0.339)], cream, radius + 0.004))
    out.append(torus('gola_camiseta', (0, 0.625, 0), 0.077, 0.014, cream))
    return out


build('gordodofusca', shirt=('#b9502e', 0.95), pants='#304b63', shoe='#eee3cb', body_scale=1.45,
      extras_torso=fusca_torso, extras_head=fusca_head, eye_color='#69452e', brow='#241a16', lips='#79452f', teeth=True)

# ======================================================================== Tiba
def shirt_text(name, text, y, size, material, radius=0.218):
    """Letras em malha apoiadas na curvatura da camisa, usando a fonte interna do Blender."""
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body, curve.size, curve.align_x = text, size, 'CENTER'
    curve.offset = 0.0007
    curve.resolution_u = 4
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    for v in obj.data.vertices:
        # A frente do personagem olha para -z: inverte x para a leitura não ficar espelhada.
        x, h = -v.co.x, v.co.y + y
        v.co = P(x, h, -math.sqrt(max(0.001, radius * radius - x * x)) - 0.009)
    obj.data.materials.append(material)
    paint(obj, (1, 1, 1))
    return obj


def tiba_torso(s):
    black = mat('tiba_preto', '#202126', rough=0.9)
    white = mat('tiba_branco', '#f5f2e9', rough=0.9)
    red = mat('tiba_escudo_vermelho', '#c63434', rough=0.85)
    out = [torus('gola_alvinegra', (0, 0.625, 0), 0.077, 0.017, black),
           shirt_text('nome_time', 'CORINTHIANS', 0.29, 0.045, black),
           shirt_text('nome_torcedor', 'TIBA', 0.21, 0.033, black)]
    # Escudo estilizado modelado aqui: âncora, remos, anel e bandeira em preto/branco/vermelho.
    # Pedido explícito de camisa do Corinthians; não usa imagens, patrocínios ou uniformes baixados.
    cx, cy = -0.087, 0.43
    for sx in (-1, 1):
        out.append(applique('remo', [(cx + sx * 0.040, cy + 0.060), (cx + sx * 0.049, cy + 0.054),
                        (cx - sx * 0.041, cy - 0.059), (cx - sx * 0.049, cy - 0.053)], red, 0.219))
    out.append(applique('ancora_haste', [(cx - 0.004, cy - 0.066), (cx + 0.004, cy - 0.066),
                                       (cx + 0.004, cy + 0.067), (cx - 0.004, cy + 0.067)], red, 0.220))
    for sx in (-1, 1):
        out.append(applique('ancora_braco', [(cx, cy - 0.061), (cx + sx * 0.043, cy - 0.038),
                            (cx + sx * 0.045, cy - 0.024), (cx + sx * 0.035, cy - 0.036), (cx, cy - 0.052)], red, 0.221))
    for name, r, m, depth in [('anel', 0.045, black, 0.223), ('centro', 0.034, white, 0.225)]:
        out.append(applique('escudo_' + name, [(cx + r * math.cos(k * math.pi / 16), cy + r * math.sin(k * math.pi / 16))
                                             for k in range(32)], m, depth))
    for j in range(3):
        y = cy - 0.021 + j * 0.015
        out.append(applique('bandeira_faixa', [(cx - 0.024, y), (cx + 0.024, y), (cx + 0.024, y + 0.006), (cx - 0.024, y + 0.006)], black, 0.227))
    out.append(applique('bandeira_canto', [(cx - 0.024, cy), (cx - 0.004, cy), (cx - 0.004, cy + 0.021), (cx - 0.024, cy + 0.021)], red, 0.229))
    return out


def tiba_head(R, skin):
    hair = mat('tiba_cabelo', '#29221e', rough=0.9)
    out = [sphere('cabelo_curto', (0, 0.12, 0.04), (R * 1.025, R * 0.65, R * 0.95), hair)]
    for k in range(5):
        out.append(sphere('topete', (-0.11 + k * 0.048, 0.205 + k * 0.005, -0.085), (0.054, 0.066, 0.075), hair,
                          rot=(0, 0, -0.25), segments=16, rings=12))
    for sx in (-1, 1):
        for k, color in enumerate(['#202126', '#f5f2e9']):
            out.append(tube('pintura_torcida', [(sx * 0.115, -0.065 - k * 0.021, -0.210),
                            (sx * 0.15, -0.06 - k * 0.021, -0.188), (sx * 0.171, -0.054 - k * 0.021, -0.166)],
                            0.008, mat('tiba_pintura_' + str(k), color), sides=6))
    return out


build('tiba', shirt=('#f5f2e9', 0.9), pants='#282b30', shoe='#f5f2e9', short_sleeves=True,
      extras_torso=tiba_torso, extras_head=tiba_head, eye_color='#80552e', brow='#29221e', lips='#8f4d37', teeth=True)

# ======================================================================== Negon
def negon_head(R, skin):
    hair = mat('negon_cabelo', '#211a17', rough=0.96)
    out = [sphere('cabelo_rente', (0, 0.165, 0.025), (R * 1.01, R * 0.52, R * 0.94), hair, segments=32, rings=20)]
    for k in range(65):
        y = (k + 0.5) / 65
        a = k * math.pi * (3 - math.sqrt(5))
        r = math.sqrt(1 - y * y)
        out.append(sphere('cacho_curto', (r * math.cos(a) * R, 0.165 + y * R * 0.51, 0.025 + r * math.sin(a) * R * 0.94),
                          (0.021, 0.017, 0.021), hair, segments=8, rings=6))
    mouth = mat('negon_sorriso', '#301b16', rough=0.8)
    teeth = mat('negon_dentes', '#fff8e8', rough=0.45)
    steel = mat('negon_aparelho', '#667e8e', rough=0.45, metal=0.35)
    elastic = mat('negon_elastico', '#447fc7', rough=0.65)
    out.append(sphere('sorriso_aberto', (0, -0.106, -R * 0.94), (0.097, 0.045, 0.024), mouth))
    out.append(sphere('dentes_sorriso', (0, -0.098, -R * 0.98), (0.079, 0.027, 0.015), teeth))
    # Aparelho com fio contínuo e cinco bráquetes metálicos, legível no retrato e de perto.
    wire = []
    for k in range(9):
        x = -0.072 + k * 0.018
        wire.append((x, -0.109 + 0.014 * (x / 0.072) ** 2, -R * 0.98 - 0.017 + 0.009 * (x / 0.072) ** 2))
    out.append(tube('fio_aparelho', wire, 0.0028, steel, sides=8))
    for x in (-0.054, -0.027, 0, 0.027, 0.054):
        y = -0.109 + 0.014 * (x / 0.072) ** 2
        z = -R * 0.98 - 0.02 + 0.009 * (x / 0.072) ** 2
        out.append(box('elastico_aparelho', (x, y, z), (0.019, 0.020, 0.007), elastic, bevel=0.003, segments=2))
        out.append(box('braquete', (x, y, z - 0.005), (0.011, 0.013, 0.006), steel, bevel=0.002, segments=2))
    return out


def negon_torso(s):
    trim = mat('negon_gola', '#f2c14e', rough=0.85)
    return [torus('gola_dourada', (0, 0.625, 0), 0.071, 0.013, trim)]


build('negon', shirt=('#396bbb', 0.85), pants='#273c57', shoe='#eee5ce', body_scale=0.76,
      extras_torso=negon_torso, extras_head=negon_head, eye_color='#8b5c31', brow='#211a17', lips='#43291f')

# ---------------------------------------------------------------- exportação
for o in parts:
    o.data.color_attributes.active_color = o.data.color_attributes['Col']
os.makedirs(os.path.dirname(OUT), exist_ok=True)
export(OUT, parts)
tris = sum(len(p.vertices) - 2 for o in parts for p in o.data.polygons)
print(f'PERSONAGENS: {OUT} ({os.path.getsize(OUT) / 1e6:.2f} MB, {tris} triângulos, {len(parts)} peças)')

# Prévia lado a lado. `--personagens luistesoura,sardinha` seleciona o elenco mostrado no render.
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--previa' in argv:
    path = argv[argv.index('--previa') + 1]
    sc = bpy.context.scene
    preview_ids = argv[argv.index('--personagens') + 1].split(',') if '--personagens' in argv else list(HEAD_R)
    for i, cid in enumerate(preview_ids):
        x0 = (i - (len(preview_ids) - 1) / 2) * 0.95
        R = HEAD_R[cid]

        def place(name, at):
            src = bpy.data.objects[f'{cid}_{name}']
            c = src.copy()
            c.location = src.location + P(x0 + at[0], at[1], at[2])
            sc.collection.objects.link(c)

        place('tronco', (0, 0.93, 0))
        place('cabeca', (0, 0.93 + 0.62 + R, 0))
        for facial in ('sobrancelhas', 'boca', 'nariz'):
            place(facial, (0, 0.93 + 0.62 + R, 0))
        for eye in ('olho_esq', 'olho_dir'):
            place(eye, (0, 0.93 + 0.62 + R + 0.04, -R + 0.03))
        for sx in (-1, 1):
            shoulder = 0.35 if cid == 'gordodofusca' else 0.23 if cid == 'negon' else 0.27
            hip = 0.14 if cid == 'gordodofusca' else 0.09 if cid == 'negon' else 0.11
            place('braco', (sx * shoulder, 0.93 + 0.55, 0))
            place('coxa', (sx * hip, 0.93, 0))
            place('canela', (sx * hip, 0.93 - 0.42, 0))
    for o in parts:
        o.hide_render = True
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(3.6, len(preview_ids) * 1.0)
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    cam.location = P(0.15, 1.5, -5.5)
    target = P(0, 1.1, 0)
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
    sc.render.resolution_x, sc.render.resolution_y = 1200, 860
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('PREVIA:', path)
