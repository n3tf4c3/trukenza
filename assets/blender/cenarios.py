"""Nove destinos externos: cenários cartoon originais, nas coordenadas do jogo.

blender -b --factory-startup -P assets/blender/cenarios.py
Exporta um GLB compacto por destino em `public/modelos/cenarios/<id>.glb`, com o cenário, a água
separada e a mesa comum.
O círculo de 4,5 m fica livre para cadeiras, caminhada e câmera; o chão é plano até 13 m do centro e
só depois ganha relevo. Cada cenário leva a oclusão de ambiente assada na cor dos vértices.
"""
import math
import os
import random
import sys
import bmesh
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from lib import P, S, _finish, apply_all, bake_ao, box, box_uv, cyl, export, join, mat, paint, reset, sphere, tint, torus

reset()
random.seed(73)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'apps/web/public/modelos/cenarios')
wood = mat('madeira', '#805238')
top = mat('tampo', '#ad875a')
dark = mat('metal_parque', '#254348', metal=0.45)
cream = mat('creme', '#f8e8c4')
sand = mat('areia', '#e9cd94')
wet = mat('areia_molhada', '#bfa979')
sea = mat('mar', '#22a9bc', rough=0.28, metal=0.15)
foam = mat('espuma', '#d7f9ed', emit='#93c8c0', strength=0.15)
fall = mat('queda_agua', '#d7f9ed', rough=0.32)
leaf = mat('folha', '#407c45')
leaf2 = mat('folha_clara', '#72a34d')
grass = mat('grama', '#679450')
tuft_m = mat('capim', '#5f9647', rough=0.9)
pine_m = mat('pinheiro', '#2f6a4a', rough=0.9)
path = mat('pedra_clara', '#d4bfa1')
pink = mat('coral', '#ed7c88')
gold = mat('amarelo', '#f5be55')
blue = mat('azul', '#427fb2')
white = mat('branco', '#fbf7ee')
neon_pink = mat('neon_rosa', '#ed5cb1', emit='#ff3399', strength=3)
neon_blue = mat('neon_azul', '#5bdae8', emit='#2bd9ff', strength=3)
neon_gold = mat('neon_dourado', '#ffe3a0', emit='#ffd06b', strength=2.5)
night = mat('asfalto', '#242942')
hotel = mat('hotel', '#3d405e')
hotel2 = mat('hotel_claro', '#6f6072')
stone = mat('pedra_muralha', '#aaa08a')
red = mat('vermelhao', '#ac4139')
roof = mat('telhado_jade', '#355c5e')
rock = mat('rocha', '#687969')
snow = mat('neve', '#f4f2ee')
lake = mat('lago', '#6ab1bd', rough=0.25, metal=0.12)
sakura = mat('cerejeira', '#f3b0cb')
hill = mat('montanha', '#709b86')
wall = mat('muro', '#e9e2d2', rough=0.9)

exports = []


# ---------------------------------------------------------------- apoio: relevo, malhas soltas, espalhar
def noise(x, z):
    """Ondulação suave e determinística, de -1 a 1."""
    return (math.sin(x * 0.31 + 1.7) * math.cos(z * 0.27 - 0.6) + 0.5 * math.sin(x * 0.73 + z * 0.51 + 2.1)
            + 0.25 * math.cos(x * 1.37 - z * 1.13)) / 1.75


def smooth(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def flat(x, z):
    return 0.0


def hills(x, z, start=13, far=32, amp=2.6):
    """Plano até `start` metros do centro; depois sobe em colinas, para o horizonte não ser uma régua."""
    return smooth(start, far, math.hypot(x, z)) * amp * (0.55 + 0.45 * noise(x, z))


def raw_mesh(name, vertices, faces, materials, smooth_faces=False):
    """Malha feita à mão (folhas, velas, toldos), já com a cor de vértice branca que as outras peças têm."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(vertices, [], faces)
    for m in materials:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = smooth_faces
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    paint(ob, (1.0, 1.0, 1.0))
    return ob


def ground(name, material, bounds=(-45, 45, -45, 45), cell=1.5, height=hills, y=-0.02, shade=0.07):
    """Chão em grade: relevo por `height(x, z)` e manchas de tom na cor dos vértices."""
    x0, x1, z0, z1 = bounds
    nx, nz = int((x1 - x0) / cell), int((z1 - z0) / cell)
    verts, faces = [], []
    for i in range(nx + 1):
        for j in range(nz + 1):
            x, z = x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * j / nz
            verts.append(P(x, y + height(x, z), z))
    for i in range(nx):
        for j in range(nz):
            a = i * (nz + 1) + j
            faces.append((a, a + 1, a + nz + 2, a + nz + 1))
    ob = raw_mesh(name, verts, faces, [material], smooth_faces=True)
    col = ob.data.color_attributes['Col']
    for loop in ob.data.loops:
        co = ob.data.vertices[loop.vertex_index].co
        gx, gz = co.x, -co.y
        v = 0.92 + shade * noise(gx * 2.3 + 5, gz * 2.3 - 3) + 0.03 * noise(gx * 7.1, gz * 6.3)
        col.data[loop.index].color = (min(1, v), min(1, v), min(1, v * 0.97), 1.0)
    return ob


def raised(fn, x, z, *args, height=hills, **kw):
    """Chama `fn(x, z, ...)` e pousa o que ela criou na altura do relevo naquele ponto."""
    before = set(bpy.data.objects)
    fn(x, z, *args, **kw)
    dy = height(x, z)
    for o in bpy.data.objects:
        if o not in before:
            o.location.z += dy


def scatter(n, fn, rmin=5.4, rmax=17, ok=None, height=hills):
    """Espalha `n` peças num anel em volta da mesa, fora da roda de caminhada."""
    placed = 0
    for _ in range(n * 6):
        if placed >= n:
            break
        a, r = random.uniform(0, math.tau), random.uniform(rmin, rmax)
        x, z = math.cos(a) * r, math.sin(a) * r
        if ok and not ok(x, z):
            continue
        raised(fn, x, z, height=height)
        placed += 1


def away(*spots):
    """Predicado para `scatter`: fora das peças grandes (x, z, raio)."""
    return lambda x, z: all(math.hypot(x - sx, z - sz) > sr for sx, sz, sr in spots)


PLAIN = ('roda_da_mesa', 'pracinha', 'terraco', 'areia_zen', 'plataforma', 'alameda', 'beira_agua')


def collect(name, before, ao=True):
    objects = apply_all([o for o in bpy.data.objects if o not in before and o.type in ('MESH', 'FONT')])
    for o in objects:  # letreiros viram malha sem cor de vértice: sem isto sairiam pretos na junção
        if 'Col' not in o.data.color_attributes:
            paint(o, (1.0, 1.0, 1.0))
    # Pisos lisos (rodas, terraços) ficam fora da sombra assada: têm vértices só na borda, e a sombra do
    # meio-fio escureceria o disco inteiro.
    plain = [o for o in objects if o.name.startswith(PLAIN) or o.name == 'mirante']
    rest = [o for o in objects if o not in plain]
    obj = join(name, rest)
    if ao:
        bake_ao(obj, samples=32, distance=1.4, floor=0.6)
    if plain:
        obj = join(name, [obj, *plain])
    box_uv(obj)
    obj.data.color_attributes.active_color = obj.data.color_attributes['Col']
    print(f'  {name}: {sum(len(p.vertices) - 2 for p in obj.data.polygons)} triângulos')
    return obj


def rod(name, a, b, radius, material):
    mid = tuple((a[i] + b[i]) / 2 for i in range(3))
    d = P(*b) - P(*a)
    obj = cyl(name, mid, radius, d.length, material, verts=8)
    obj.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return obj


def text(label, pos, size, material):
    curve = bpy.data.curves.new('letras', 'FONT')
    curve.body = label
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.extrude = 0.009
    curve.bevel_depth = 0.003
    obj = bpy.data.objects.new('letreiro', curve)
    bpy.context.collection.objects.link(obj)
    obj.location = P(*pos)
    obj.rotation_euler = (math.pi / 2, 0, 0)  # frente para +Z do jogo
    obj.data.materials.append(material)
    return obj


# ---------------------------------------------------------------- natureza
def rock_at(x, z, s=None, material=None):
    """Pedra facetada, meio enterrada."""
    s = s or random.uniform(0.25, 0.6)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2 if s > 0.5 else 1, radius=1, location=P(x, s * 0.22, z))
    o = bpy.context.object
    o.name = 'pedra'
    for v in o.data.vertices:
        v.co *= 1 + random.uniform(-0.14, 0.14)
    o.scale = S(s * random.uniform(0.8, 1.35), s * random.uniform(0.5, 0.8), s * random.uniform(0.8, 1.2))
    o.rotation_euler = (0, 0, random.uniform(0, math.tau))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(o, material or rock, tint=tint(0.9, 0.08))


def bush(x, z, r=None, material=None):
    r = r or random.uniform(0.4, 0.75)
    for k in range(4):
        a = k * 1.9 + random.uniform(0, 1)
        d = r * 0.5 if k else 0
        rr = r * (1.0 if k == 0 else random.uniform(0.55, 0.8))
        sphere('arbusto', (x + math.cos(a) * d, rr * 0.62, z + math.sin(a) * d), (rr, rr * 0.78, rr),
               material or (leaf if k % 2 else leaf2), segments=10, rings=6, tint=tint(0.9, 0.09))


def tuft(x, z):
    """Tufo de capim: lâminas finas abertas em leque."""
    for k in range(5):
        a = k * math.tau / 5 + random.uniform(-0.3, 0.3)
        h = random.uniform(0.22, 0.42)
        cyl('capim', (x + math.cos(a) * 0.06, h / 2, z + math.sin(a) * 0.06), 0.035, h, tuft_m, verts=4, radius2=0,
            rot=(math.sin(a) * 0.35, math.cos(a) * 0.35, 0), tint=tint(0.88, 0.1))


def flower(x, z, color=None):
    color = color or random.choice([pink, gold, white, sakura])
    h = random.uniform(0.2, 0.34)
    cyl('flor_haste', (x, h / 2, z), 0.012, h, tuft_m, verts=5)
    for k in range(5):
        a = k * math.tau / 5
        sphere('flor_petala', (x + math.cos(a) * 0.045, h, z + math.sin(a) * 0.045), (0.04, 0.02, 0.04), color, segments=6, rings=4)
    sphere('flor_miolo', (x, h + 0.012, z), (0.028, 0.022, 0.028), gold if color is not gold else wood, segments=6, rings=4)


def meadow(tufts=50, flowers=24, bushes=7, rocks=7, ok=None, height=hills, rmax=17):
    scatter(tufts, tuft, ok=ok, height=height, rmax=rmax)
    scatter(flowers, flower, ok=ok, height=height, rmax=min(rmax, 12))
    scatter(bushes, bush, ok=ok, height=height, rmin=6.2, rmax=rmax)
    scatter(rocks, rock_at, ok=ok, height=height, rmin=6, rmax=rmax)


def palm(x, z, height=4.2):
    for k in range(10):
        t = k / 10
        cyl('tronco_coqueiro', (x + t*t*0.55, height*(t+0.05), z), 0.18-t*0.075, height/10+0.03,
            wood, verts=10, radius2=0.17-t*0.075, tint=tint(0.9 if k % 2 else 0.8, 0.03))
    crown = (x+0.55, height, z)
    for k in range(11):
        a = k*math.tau/11
        droop = 0.5 + 0.3 * (k % 3)
        vertices = [P(*crown)]
        for t, w, y in [(0.3, 0.3, 0.38), (0.62, 0.3, 0.2), (0.85, 0.2, -0.15 * droop), (1, 0.03, -0.75 * droop)]:
            for side in (-1, 1):
                vertices.append(P(crown[0]+math.cos(a)*t*2.1+math.sin(a)*w*side,
                                  height+y, z+math.sin(a)*t*2.1-math.cos(a)*w*side))
        raw_mesh('folha_coqueiro', vertices, [(0, 1, 2), (1, 3, 4, 2), (3, 5, 6, 4), (5, 7, 8, 6)], [leaf if k % 2 else leaf2])
    for a in (0, 2, 4):
        sphere('coco', (crown[0]+math.cos(a)*0.22, height-0.12, z+math.sin(a)*0.22), (0.16, 0.2, 0.16), wood, segments=12, rings=8, tint=(0.7, 0.7, 0.7))


def umbrella(x, z, material):
    cyl('haste_sombrinha', (x, 1.25, z), 0.035, 2.5, cream, verts=12)
    verts = [P(x, 2.7, z)] + [P(x+math.cos(k*math.tau/12)*1.5, 2.15, z+math.sin(k*math.tau/12)*1.5) for k in range(12)]
    ob = raw_mesh('sombrinha', verts, [(0, k+1, (k+1) % 12+1) for k in range(12)], [material, cream])
    for p in ob.data.polygons:
        p.material_index = p.index % 2
    sphere('ponteira', (x, 2.7, z), (0.07, 0.1, 0.07), cream, segments=12, rings=8)
    for dx in (-0.65, 0.65):
        box('espreguicadeira', (x+dx, 0.36, z+0.4), (0.5, 0.08, 1.5), cream, bevel=0.03)
        box('toalha', (x+dx, 0.41, z+0.4), (0.4, 0.02, 1.2), material, bevel=0.01)
        for dz in (-0.15, 0.95):
            box('pe_espreguicadeira', (x+dx, 0.18, z+dz), (0.4, 0.36, 0.04), wood)


def tree(x, z, height, autumn=False):
    """Árvore de copa cheia: tronco com raízes, galhos e um cacho de bolas em tons diferentes."""
    cyl('tronco', (x, height/2, z), 0.22, height, wood, verts=10, radius2=0.10, tint=tint(0.85, 0.05))
    for a in (0.4, 2.5, 4.6):
        rod('raiz', (x, 0.3, z), (x+math.cos(a)*0.42, 0, z+math.sin(a)*0.42), 0.07, wood)
    for a in (0, 2.1, 4.2):
        rod('galho', (x, height*0.6, z), (x+math.cos(a)*0.8, height, z+math.sin(a)*0.8), 0.08, wood)
    blobs = [(0, 0.75, 0, 1.2), (-0.85, 0.15, 0.1, 0.95), (0.8, 0.25, 0.25, 1.0), (0.05, 0.15, -0.8, 0.95), (0.1, 0.1, 0.85, 0.9),
             (-0.5, 0.95, -0.4, 0.75), (0.55, 1.0, -0.3, 0.7), (-0.2, -0.25, 0.2, 0.9)]
    for k, (dx, dy, dz, r) in enumerate(blobs):
        m = (gold if k % 3 else pink) if autumn else (leaf2 if k % 2 else leaf)
        shade = 0.72 if k == len(blobs) - 1 else random.uniform(0.84, 1.0)  # a bola de baixo fica na sombra
        sphere('copa', (x+dx, height+dy, z+dz), (r, r*0.86, r), m, segments=12, rings=7, tint=(shade, shade, shade))


def pine(x, z, height=None):
    height = height or random.uniform(3.2, 5.2)
    cyl('pinheiro_tronco', (x, height*0.15, z), 0.14, height*0.3, wood, verts=8)
    for k in range(4):
        t = k / 4
        v = 0.8 + t * 0.16 + random.uniform(-0.04, 0.04)
        cyl('pinheiro_saia', (x, height*(0.3+t*0.62), z), height*0.3*(1-t*0.62), height*0.36, pine_m, verts=10, radius2=0,
            tint=(v, v, v))


def bench(x, z):
    for k in range(4):
        box('banco_assento', (x, 0.5, z+k*0.11), (1.7, 0.07, 0.09), wood, bevel=0.018)
    for k in range(3):
        box('banco_encosto', (x, 0.72+k*0.15, z+0.4), (1.7, 0.11, 0.06), wood, bevel=0.018)
    for dx in (-0.65, 0.65):
        box('banco_pe', (x+dx, 0.25, z+0.15), (0.06, 0.5, 0.45), dark, bevel=0.02)
        box('banco_haste', (x+dx, 0.8, z+0.42), (0.05, 0.7, 0.05), dark)


def lamppost(x, z):
    cyl('poste_base', (x, 0.14, z), 0.17, 0.28, dark, verts=12)
    cyl('poste', (x, 1.5, z), 0.055, 3, dark, verts=12)
    torus('poste_anel', (x, 2.7, z), 0.08, 0.02, dark)
    sphere('luz_poste', (x, 3.05, z), (0.22, 0.28, 0.22), neon_gold, segments=16, rings=10)
    cyl('chapeu_poste', (x, 3.33, z), 0.3, 0.15, dark, radius2=0.03, verts=16)


def stone_ring(r=4.5, material=None, n=36):
    """Meio-fio de pedras em volta da roda da mesa."""
    for k in range(n):
        a = k * math.tau / n
        box('meio_fio', (math.cos(a) * r, 0.02, math.sin(a) * r), (math.tau * r / n * 0.9, 0.1, 0.26), material or stone,
            rot_y=-a + math.pi / 2, bevel=0.03, segments=1, tint=tint(0.88, 0.08))


def stepping(points, material=None):
    for x, z in points:
        cyl('pedra_passo', (x, 0.012, z), random.uniform(0.3, 0.42), 0.05, material or stone, verts=9, bevel=0.012, tint=tint(0.88, 0.07))


def plane(material=grass, height=hills, ring=None):
    ground('chao', material, height=height)
    cyl('roda_da_mesa', (0, -0.018, 0), 4.5, 0.04, path, verts=96)
    stone_ring(material=ring)


def mountain(x, z, r, h, material=hill, cap=None):
    """Morro orgânico: anéis com o raio ondulado, mais escuro na base; `cap` pinta o alto (neve)."""
    levels, n = 8, 22
    seed = random.uniform(0, 10)
    bm = bmesh.new()
    rings = []
    for k in range(levels):
        t = k / levels
        ring = []
        for i in range(n):
            a = i * math.tau / n
            rad = r * (1 - t) ** 0.85 * (1 + 0.12 * math.sin(a * 3 + seed + t * 2) + 0.07 * math.sin(a * 7 + seed * 2)) + 0.2
            ring.append(bm.verts.new(P(x + math.cos(a) * rad, h * t ** 0.9 - 0.3, z + math.sin(a) * rad)))
        rings.append(ring)
    apex = bm.verts.new(P(x, h - 0.2, z))
    for k in range(levels - 1):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            f.material_index = 1 if cap and k >= levels - 3 else 0
    for i in range(n):
        f = bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], apex))
        f.material_index = 1 if cap else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('montanha')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    if cap:
        me.materials.append(cap)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('montanha', me)
    bpy.context.collection.objects.link(ob)
    col = paint(ob, (1.0, 1.0, 1.0))
    for loop in me.loops:
        t = max(0.0, min(1.0, (me.vertices[loop.vertex_index].co.z + 0.3) / h))
        v = 0.74 + 0.26 * t
        col.data[loop.index].color = (v, v, v, 1.0)
    return ob


def blossom(x, z, h=3.1):
    cyl('cerejeira_tronco', (x, h/2, z), 0.16, h, wood, verts=12, radius2=0.07, tint=(0.75, 0.75, 0.75))
    for k in range(5):
        a = k*math.tau/5
        dx, dz = math.cos(a)*0.75, math.sin(a)*0.75
        rod('cerejeira_galho', (x, h*0.65, z), (x+dx, h, z+dz), 0.07, wood)
        sphere('flores_cerejeira', (x+dx, h+0.25, z+dz), (0.9, 0.7, 0.9), sakura, segments=12, rings=7, tint=tint(0.93, 0.06))
        sphere('flores_cerejeira', (x+dx*0.5, h+0.7, z+dz*0.5), (0.6, 0.5, 0.6), sakura, segments=10, rings=6, tint=tint(0.95, 0.05))
    sphere('flores_cerejeira', (x, h+0.1, z), (0.85, 0.5, 0.85), sakura, segments=14, rings=8, tint=(0.8, 0.78, 0.8))
    for k in range(14):
        a = k*2.4
        sphere('petala_caida', (x+math.cos(a)*1.6, 0.01, z+math.sin(a)*1.5), (0.06, 0.012, 0.035), sakura, segments=8, rings=6)


def pavilion(x, z, levels=1):
    box('pavilhao_base', (x, 0.15, z), (4.2, 0.3, 4.2), stone, bevel=0.08)
    box('pavilhao_degrau', (x, 0.07, z+2.3), (1.6, 0.14, 0.5), stone, bevel=0.04)
    for level in range(levels):
        w = 3.6-level*0.55
        y = 0.3+level*2.3
        for dx in (-w/2+0.2, w/2-0.2):
            for dz in (-w/2+0.2, w/2-0.2):
                cyl('coluna_vermelha', (x+dx, y+1, z+dz), 0.09, 2, red, verts=12)
                cyl('coluna_base', (x+dx, y+0.08, z+dz), 0.13, 0.16, stone, verts=12)
        box('viga_pavilhao', (x, y+1.9, z), (w, 0.18, w), red, bevel=0.03)
        for side in (-1, 1):
            box('grade_pavilhao', (x+side*(w/2-0.2), y+0.45, z), (0.05, 0.06, w-0.5), red)
        box('grade_pavilhao', (x, y+0.45, z-(w/2-0.2)), (w-0.5, 0.06, 0.05), red)
        # Duas saias sobrepostas de telhado, pontas ascendentes.
        cyl('telhado_pavilhao', (x, y+2.25, z), w*0.88, 0.7, roof, verts=4, radius2=w*0.34, rot=(0, 0, math.pi/4))
        cyl('beiral_pavilhao', (x, y+1.98, z), w*0.92, 0.07, gold, verts=4, radius2=w*0.9, rot=(0, 0, math.pi/4))
        for dx in (-1, 1):
            for dz in (-1, 1):
                rod('ponta_telhado', (x+dx*w*0.59, y+1.98, z+dz*w*0.59), (x+dx*w*0.72, y+2.2, z+dz*w*0.72), 0.06, gold)
    sphere('remate_pavilhao', (x, levels*2.3+0.6, z), (0.11, 0.25, 0.11), gold, segments=12, rings=8)


def lantern(x, y, z):
    cyl('fio_lanterna', (x, y+0.4, z), 0.009, 0.5, dark, verts=6)
    sphere('lanterna', (x, y, z), (0.22, 0.29, 0.22), red, segments=16, rings=10)
    for dy in (-0.25, 0.25):
        cyl('aro_lanterna', (x, y+dy, z), 0.12, 0.05, gold, verts=12)
    cyl('franja_lanterna', (x, y-0.4, z), 0.025, 0.22, gold, verts=8)


def torii(x, z):
    for dx in (-1.5, 1.5):
        cyl('torii_pilar', (x+dx, 1.8, z), 0.14, 3.6, red, verts=16, radius2=0.1)
        cyl('torii_base', (x+dx, 0.25, z), 0.17, 0.5, dark, verts=16)
    box('torii_travessa', (x, 2.6, z), (4, 0.18, 0.23), red, bevel=0.025)
    box('torii_topo', (x, 3.45, z), (4.6, 0.22, 0.38), red, bevel=0.05)
    box('torii_capa', (x, 3.62, z), (4.9, 0.14, 0.46), dark, bevel=0.05)
    box('torii_centro', (x, 3.0, z), (0.18, 0.7, 0.18), red)


def lotus(x, z, y=0.04):
    r = random.uniform(0.22, 0.34)
    cyl('vitoria_regia', (x, y, z), r, 0.02, leaf2, verts=10, tint=tint(0.9, 0.08))
    if random.random() < 0.45:
        for k in range(5):
            a = k * math.tau / 5
            sphere('lotus_petala', (x + math.cos(a) * 0.05, y + 0.05, z + math.sin(a) * 0.05), (0.05, 0.045, 0.05), sakura, segments=6, rings=4)
        sphere('lotus_miolo', (x, y + 0.07, z), (0.03, 0.03, 0.03), gold, segments=6, rings=4)


def lotuses(n, x, z, rx, rz):
    for _ in range(n):
        a, r = random.uniform(0, math.tau), random.uniform(0.2, 0.85)
        lotus(x + math.cos(a) * rx * r, z + math.sin(a) * rz * r)


def shore_rocks(n, x, z, rx, rz):
    for k in range(n):
        a = k * math.tau / n + random.uniform(-0.2, 0.2)
        rock_at(x + math.cos(a) * rx, z + math.sin(a) * rz, random.uniform(0.3, 0.6))


def sailboat(x, z, color):
    box('barco_casco', (x, 0.18, z), (1.9, 0.36, 0.7), wood, bevel=0.14, segments=3)
    cyl('barco_mastro', (x, 1.5, z), 0.035, 2.6, cream, verts=8)
    raw_mesh('barco_vela', [P(x + 0.06, 0.55, z), P(x + 0.06, 2.7, z), P(x + 1.15, 0.6, z)], [(0, 1, 2)], [white])
    raw_mesh('barco_vela', [P(x - 0.06, 0.6, z), P(x - 0.06, 2.3, z), P(x - 0.85, 0.65, z)], [(0, 1, 2)], [color])


def flag(x, y, z, color=None):
    cyl('mastro', (x, y + 0.9, z), 0.03, 1.8, dark, verts=8)
    raw_mesh('bandeira', [P(x, y + 1.75, z), P(x + 0.95, y + 1.6, z + 0.05), P(x + 0.9, y + 1.15, z), P(x, y + 1.2, z)],
             [(0, 1, 2, 3)], [color or red])


def water_node(name, x, z, rx, rz):
    before = set(bpy.data.objects)
    sphere('lago', (x, -0.04, z), (rx, 0.07, rz), lake, segments=64, rings=10)
    for k in range(12):
        sphere('reflexo', (x+random.uniform(-rx*0.8, rx*0.8), 0.032, z+random.uniform(-rz*0.7, rz*0.7)), (0.5, 0.005, 0.025), foam, segments=10, rings=6)
    exports.append(collect(name+'_agua', before, ao=False))


# ---------------------------------------------------------------- mesa comum
before = set(bpy.data.objects)
cyl('mesa_tampo', (0, 0.735, 0), 1.5, 0.09, top, verts=96, bevel=0.018, segments=3)
cyl('mesa_borda', (0, 0.675, 0), 1.47, 0.04, wood, verts=96, bevel=0.01)
cyl('mesa_pedestal', (0, 0.34, 0), 0.16, 0.64, wood, verts=16, radius2=0.22)
for a in (0, math.pi/2):
    box('mesa_base', (0, 0.06, 0), (1.3, 0.12, 0.18), wood, rot_y=a, bevel=0.04)
exports.append(collect('mesa_externa', before))


# ---------------------------------------------------------------- praia
def dunes(x, z):
    back = smooth(10, 21, z) * 1.7 * (0.6 + 0.4 * noise(x, z))
    side = smooth(17, 34, abs(x)) * smooth(-5, 5, z) * 1.5 * (0.6 + 0.4 * noise(z, x))
    return back + side


def shell(x, z):
    sphere('concha', (x, 0.02, z), (0.07, 0.03, 0.055), random.choice([cream, pink, white]), segments=8, rings=5)


before = set(bpy.data.objects)
ground('areal', sand, bounds=(-45, 45, -9, 23), height=dunes, shade=0.05)
box('beira_agua', (0, -0.045, -9), (90, 0.04, 3), wet)
for x, z, h in [(-6, -3, 4.5), (6, -5, 5), (-8, 5, 4.2), (7, 5, 4.6), (12, -2, 4.3), (-14, 12, 4.4), (15, 13, 4.8)]:
    raised(palm, x, z, h, height=dunes)
for x, z, c in [(-5, -6, pink), (5, 3, blue), (-6, 6, gold)]:
    umbrella(x, z, c)
# Caminho de tábuas do acesso à praia, fora da área de caminhada.
for k in range(26):
    box('passarela', (-9, 0.015, 8-k*0.44), (2, 0.08, 0.4), wood, bevel=0.018, tint=tint(0.9, 0.07))
scatter(28, shell, ok=lambda x, z: -8 < z < 9, height=dunes, rmax=14)
for x, z in [(-11, -7.6), (-12.2, -8.3), (10.5, -8), (12, -7.4), (15, -8.5)]:
    rock_at(x, z, random.uniform(0.5, 0.9))
# Castelo de areia, bola e pranchas.
cx, cz = 3.6, -6.6
box('castelo_base', (cx, 0.15, cz), (1.3, 0.3, 1.3), wet, bevel=0.05)
for dx, dz, hh in [(-0.55, -0.55, 0.7), (0.55, -0.55, 0.7), (-0.55, 0.55, 0.7), (0.55, 0.55, 0.7), (0, 0, 1.0)]:
    cyl('castelo_torre', (cx+dx, hh/2, cz+dz), 0.2, hh, wet, verts=12)
    cyl('castelo_ponta', (cx+dx, hh+0.14, cz+dz), 0.23, 0.28, sand, verts=12, radius2=0)
flag(cx, 0.8, cz, pink)
sphere('bola_praia', (-3.2, 0.27, 6.4), (0.27, 0.27, 0.27), white, segments=16, rings=10)
torus('bola_faixa', (-3.2, 0.27, 6.4), 0.262, 0.022, pink)
torus('bola_faixa', (-3.2, 0.27, 6.4), 0.262, 0.022, blue, rot=(math.pi/2, 0, 0.6))
for x, z, c, lean in [(8.6, -1.5, blue, 0.22), (9.4, -1.2, gold, -0.16)]:
    sphere('prancha', (x, 1.0, z), (0.27, 1.08, 0.05), c, segments=16, rings=10, rot=(0.2, lean, 0.5))
scatter(46, tuft, ok=lambda x, z: z > 10 or abs(x) > 19, height=dunes, rmin=11, rmax=27)
for x, z in [(-12, -23), (13, -27)]:
    sphere('ilha', (x, 0.1, z), (4, 1.0, 2.5), sand, segments=20, rings=10)
    palm(x, z, 3.4)
    rock_at(x + 2.6, z + 0.8, 0.8)
sailboat(17, -22, pink)
sailboat(-24, -31, blue)
exports.append(collect('praia', before))
before = set(bpy.data.objects)
box('oceano', (0, -0.08, -44), (110, 0.08, 68), sea)
for k in range(28):
    x, z = random.uniform(-35, 35), random.uniform(-30, -10)
    sphere('onda', (x, -0.025, z), (random.uniform(0.7, 2), 0.022, 0.05), foam, segments=12, rings=6)
exports.append(collect('praia_agua', before, ao=False))

# ---------------------------------------------------------------- parque
before = set(bpy.data.objects)
ground('gramado', grass)
cyl('pracinha', (0, -0.018, 0), 4.5, 0.04, path, verts=96)
box('alameda', (0, -0.025, 0), (2.5, 0.04, 30), path)
box('alameda', (0, -0.026, 0), (30, 0.04, 2.5), path)
stone_ring()
for k in range(16):
    a = k*math.tau/16
    r = 8+(k % 3)*2.8
    raised(tree, math.cos(a)*r, math.sin(a)*r, 3.2+(k % 3)*0.4, k % 5 == 0)
for k in range(24):
    a = k*math.tau/24+0.14
    r = 19+(k % 4)*3.2
    raised(pine, math.cos(a)*r, math.sin(a)*r)
for x, z in [(-5, -3), (5, -3), (-5, 4), (5, 4)]:
    bench(x, z)
for x, z in [(-4.5, -4.5), (4.5, -4.5), (-4.5, 4.5), (4.5, 4.5)]:
    lamppost(x, z)
for x, z in [(-5.5, 0), (5.5, 0), (-4, -6), (4, -6)]:
    cyl('canteiro', (x, 0.12, z), 0.8, 0.24, cream, verts=24, bevel=0.05)
    sphere('arbusto', (x, 0.36, z), (0.75, 0.35, 0.65), leaf, segments=16, rings=10)
    for k in range(9):
        a = k*2.4
        sphere('flor', (x+math.cos(a)*0.5, 0.65+0.08*math.sin(k), z+math.sin(a)*0.45), (0.09, 0.055, 0.09), pink if k % 2 else gold, segments=8, rings=6)
# Coreto ao fundo, com degraus, guarda-corpo e remate.
cyl('coreto_base', (0, 0.12, -10), 2.2, 0.24, cream, verts=8)
cyl('coreto_degrau', (0, 0.05, -10), 2.6, 0.1, path, verts=8)
for k in range(8):
    a = k*math.tau/8
    cyl('coreto_pilar', (math.cos(a)*1.9, 1.5, -10+math.sin(a)*1.9), 0.07, 2.8, cream, verts=8)
    if k != 2:  # a entrada fica virada para a mesa
        b = (k+1)*math.tau/8
        rod('coreto_grade', (math.cos(a)*1.9, 0.9, -10+math.sin(a)*1.9), (math.cos(b)*1.9, 0.9, -10+math.sin(b)*1.9), 0.035, cream)
cyl('coreto_beiral', (0, 2.92, -10), 2.75, 0.1, cream, verts=8)
cyl('coreto_telhado', (0, 3.35, -10), 2.7, 0.85, blue, verts=8, radius2=0)
sphere('coreto_remate', (0, 3.85, -10), (0.12, 0.2, 0.12), gold, segments=10, rings=6)
meadow(tufts=70, flowers=40, bushes=10, rocks=6, ok=lambda x, z: abs(x) > 1.9 and abs(z) > 1.9 and math.hypot(x, z + 10) > 3.2)
exports.append(collect('parque', before))

# ---------------------------------------------------------------- Las Vegas
before = set(bpy.data.objects)
box('praca_noturna', (0, -0.12, 0), (80, 0.2, 80), night)
cyl('terraco', (0, -0.025, 0), 4.6, 0.06, mat('piso_vegas', '#716579'), verts=96)
torus('contorno_terraco', (0, 0.012, 0), 4.6, 0.025, neon_gold)
# Boulevard e hotéis fictícios, sem copiar marcas ou fachadas.
for x in (-12, 12):
    box('avenida', (x, -0.013, 0), (5, 0.03, 70), mat('rua', '#1b2034'))
    for z in range(-30, 31, 4):
        box('faixa', (x, 0.01, z), (0.1, 0.012, 1.6), gold)
for k, (x, z) in enumerate([(-8, -11), (-3.8, -14), (2, -15), (7, -12), (-18, -4), (18, -4), (-16, 10), (17, 10), (-6, 17), (5, 17)]):
    h = 5+(k % 4)*1.5
    w = 3.4
    box('hotel', (x, h/2, z), (w, h, 3), hotel if k % 2 else hotel2, bevel=0.16, segments=2)
    box('hotel_marquise', (x, 0.55, z+1.75), (w*0.7, 0.1, 0.6), hotel2 if k % 2 else hotel, bevel=0.03)
    neon = [neon_pink, neon_blue, neon_gold][k % 3]
    for dx in (-w/2, w/2):
        box('neon_vertical', (x+dx, h/2, z+1.53), (0.045, h, 0.035), neon)
    for y in (0.7, h-0.2):
        box('neon_horizontal', (x, y, z+1.53), (w, 0.06, 0.035), neon)
    for row in range(int(h/0.65)-1):
        for col in range(5):
            if (row+col+k) % 4 == 0:
                continue
            box('janela_hotel', (x-1.25+col*0.62, 1+row*0.65, z+1.515), (0.28, 0.3, 0.025), neon_gold)
    box('cobertura', (x, h+0.2, z), (w+0.3, 0.25, 3.3), neon)
    if k < 4:
        text(['LUA', 'OASIS', 'AURORA', 'NOVA'][k], (x, h-0.8, z+1.56), 0.42, neon)
# Torres ao longe, para a cidade não acabar na primeira fila.
for k, (x, z, h) in enumerate([(-26, -24, 13), (-15, -30, 17), (-4, -34, 12), (9, -32, 19), (21, -27, 14), (31, -18, 11), (-33, -12, 10)]):
    box('torre_distante', (x, h/2, z), (4.4, h, 4.4), hotel, bevel=0.2, segments=2, tint=(0.7, 0.7, 0.8))
    neon = [neon_blue, neon_pink, neon_gold][k % 3]
    box('torre_topo', (x, h+0.15, z), (4.7, 0.3, 4.7), neon)
    for y in range(2, int(h), 2):
        box('torre_faixa', (x, y, z+2.22), (3.6, 0.5, 0.03), neon_gold)
# Letreiro principal em forma de losango arredondado.
for x in (-1.3, 1.3):
    cyl('poste_letreiro', (x, 1.8, -7.2), 0.08, 3.6, dark, verts=12)
box('letreiro_moldura', (0, 3.7, -7.2), (5, 2, 0.2), neon_pink, bevel=0.32, segments=5)
box('letreiro_fundo', (0, 3.7, -7.06), (4.8, 1.8, 0.08), mat('fundo_letreiro', '#242b4d'), bevel=0.28, segments=5)
text('LAS VEGAS', (0, 3.9, -6.99), 0.62, neon_gold)
text('TRUKENZA', (0, 3.3, -6.99), 0.31, neon_blue)
for x in (-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1):
    sphere('lampada', (x, 4.55, -6.98), (0.055, 0.055, 0.035), neon_gold, segments=8, rings=6)
# Roda panorâmica e palmeiras junto ao boulevard.
torus('roda_gigante', (9, 5, -10), 3, 0.055, neon_blue, rot=(math.pi/2, 0, 0))
for k in range(12):
    a = k*math.tau/12
    rod('raio_roda', (9, 5, -10), (9+math.cos(a)*3, 5+math.sin(a)*3, -10), 0.018, neon_gold)
    sphere('cabine', (9+math.cos(a)*3, 4.85+math.sin(a)*3, -10), (0.18, 0.25, 0.18), neon_pink, segments=12, rings=8)
for dx in (-1.5, 1.5):
    rod('suporte_roda', (9+dx, 0, -9.8), (9, 5, -10), 0.09, cream)
for x, z in [(-6, -3), (6, 3), (-6, 5), (7, -6)]:
    palm(x, z, 3.6)
for x, z in [(-7, 0), (7, 0)]:
    cyl('fonte_bacia', (x, 0.2, z), 1.15, 0.4, cream, verts=40, bevel=0.07)
    cyl('fonte_agua', (x, 0.41, z), 1.02, 0.03, sea, verts=40)
    cyl('fonte_centro', (x, 0.6, z), 0.16, 0.5, cream, verts=16, radius2=0.26)
    for k in range(7):
        a = k*math.tau/7
        cyl('jato_fonte', (x+math.cos(a)*0.45, 0.8, z+math.sin(a)*0.45), 0.025, 0.8, neon_blue, verts=8)
# Vasos em volta do terraço.
for k in range(8):
    a = k*math.tau/8+0.39
    x, z = math.cos(a)*5.7, math.sin(a)*5.7
    cyl('vaso', (x, 0.22, z), 0.36, 0.44, cream, verts=16, radius2=0.46, bevel=0.03)
    raised(bush, x, z, 0.42, height=lambda x, z: 0.36)
exports.append(collect('vegas', before))

# ---------------------------------------------------------------- Paris
before = set(bpy.data.objects)
plane(material=path, height=flat, ring=cream)
# Torre Eiffel estilizada: quatro apoios abertos e treliça, vista de um café.
tx, tz = 0, -15
for sx in (-1, 1):
    for sz in (-1, 1):
        pts = [(tx+sx*2.8, 0, tz+sz*2.8), (tx+sx*1.55, 4, tz+sz*1.55), (tx+sx*0.7, 7, tz+sz*0.7), (tx+sx*0.12, 12, tz+sz*0.12)]
        for i in range(3):
            rod('torre_pilar', pts[i], pts[i+1], 0.15 if i == 0 else 0.09, wood)
for y, r in [(3.9, 1.6), (6.9, 0.75), (9, 0.45), (10.6, 0.25)]:
    for side in (-1, 1):
        box('torre_plataforma', (tx, y, tz+side*r), (r*2+0.35, 0.18, 0.25), wood)
        box('torre_plataforma', (tx+side*r, y, tz), (0.25, 0.18, r*2+0.35), wood)
for y0, y1, r0, r1 in [(0, 2, 2.8, 2.2), (2, 4, 2.2, 1.55), (4, 5.5, 1.55, 1.12), (5.5, 7, 1.12, 0.7), (7, 9, 0.7, 0.45), (9, 10.6, 0.45, 0.25)]:
    for side in (-1, 1):
        for flip in (-1, 1):
            rod('trelica', (tx+flip*r0, y0, tz+side*r0), (tx-flip*r1, y1, tz+side*r1), 0.036, wood)
            rod('trelica', (tx+side*r0, y0, tz+flip*r0), (tx+side*r1, y1, tz-flip*r1), 0.036, wood)
rod('antena', (0, 12, -15), (0, 13, -15), 0.045, wood)
slate = mat('ardosia', '#566171')
for k in range(8):
    x = (-1 if k % 2 else 1)*(8+k % 3)
    z = -9+(k//2)*7
    box('fachada_paris', (x, 3, z), (3, 6, 4), cream, bevel=0.08, tint=tint(0.93, 0.06))
    box('cornija_paris', (x, 5.95, z), (3.2, 0.14, 4.2), wall, bevel=0.03)
    cyl('telhado_paris', (x, 6.5, z), 2.7, 1.2, slate, verts=4, radius2=1.4, rot=(0, 0, math.pi/4))
    box('chamine_paris', (x+0.8, 7.2, z-0.6), (0.4, 0.8, 0.4), red, bevel=0.03)
    for y in (1.5, 3, 4.5):
        for dx in (-0.8, 0.8):
            box('janela_paris', (x+dx, y, z+2.02), (0.65, 0.95, 0.06), blue, bevel=0.1)
            box('sacada', (x+dx, y-0.45, z+2.2), (0.85, 0.12, 0.4), dark, bevel=0.03)
            if y > 2:  # floreiras nas sacadas de cima
                box('floreira', (x+dx, y-0.32, z+2.36), (0.7, 0.12, 0.12), wood)
                for f in (-0.22, 0, 0.22):
                    sphere('flor_sacada', (x+dx+f, y-0.22, z+2.36), (0.09, 0.08, 0.08), pink if (k+int(f*10)) % 2 else leaf2, segments=8, rings=5)
    # Porta e toldo listrado do térreo.
    box('porta_paris', (x, 0.95, z+2.03), (0.7, 1.9, 0.06), wood, bevel=0.05)
    awning = red if k % 2 else blue
    for s in range(6):
        x0, x1 = x-1.45+s*0.483, x-1.45+(s+1)*0.483
        raw_mesh('toldo', [P(x0, 2.5, z+2.02), P(x1, 2.5, z+2.02), P(x1, 2.12, z+2.95), P(x0, 2.12, z+2.95)],
                 [(0, 1, 2, 3)], [awning if s % 2 else white])
    box('toldo_barra', (x, 2.08, z+2.95), (2.9, 0.1, 0.03), awning)


def bistro(x, z):
    cyl('bistro_tampo', (x, 0.72, z), 0.38, 0.04, white, verts=20, bevel=0.01)
    cyl('bistro_pe', (x, 0.36, z), 0.035, 0.72, dark, verts=8)
    cyl('bistro_base', (x, 0.02, z), 0.22, 0.04, dark, verts=14)
    sphere('bistro_xicara', (x+0.12, 0.77, z+0.05), (0.05, 0.035, 0.05), cream, segments=8, rings=5)
    for side in (-1, 1):
        cx_ = x+side*0.62
        box('bistro_assento', (cx_, 0.45, z), (0.36, 0.04, 0.36), dark, bevel=0.01)
        box('bistro_encosto', (cx_+side*0.17, 0.75, z), (0.03, 0.42, 0.34), dark, bevel=0.01)
        for dx in (-0.14, 0.14):
            for dz in (-0.14, 0.14):
                cyl('bistro_perna', (cx_+dx, 0.22, z+dz), 0.014, 0.44, dark, verts=6)


for x, z in [(-6.6, 1.2), (6.9, -2.6), (-7.2, -3.4), (6.4, 6.6)]:
    bistro(x, z)
for x in (-5, 5):
    tree(x, -6, 3.2)
    cyl('canteiro_paris', (x, 0.08, -6), 0.7, 0.16, cream, verts=20, bevel=0.03)
    lamppost(x, 2)
    bench(x, 4)
umbrella(-5, 6, red)
for x in (-6.8, 6.8):  # sebes aparadas
    box('sebe', (x, 0.38, 8.4), (3.2, 0.76, 0.7), leaf, bevel=0.12, segments=3, tint=tint(0.9, 0.05))
    for dx in (-1.2, 0, 1.2):
        sphere('sebe_bola', (x+dx, 0.95, 8.4), (0.34, 0.34, 0.34), leaf2, segments=12, rings=8)
# O marco cabe acima dos personagens no enquadramento da mesa; escala de diorama.
for o in bpy.data.objects:
    if o not in before and o.type == 'MESH' and o.name.startswith(('torre_', 'trelica', 'antena')):
        o.location = P(-3, 0, -25) + (o.location-P(0, 0, -15))*0.65
        o.scale *= 0.65
exports.append(collect('paris', before))

# ---------------------------------------------------------------- jardim chinês
before = set(bpy.data.objects)
plane()
pavilion(-5, -8, 2)
for x, z in [(-6, 4), (6, 5), (11.5, -7), (-10, -2), (-13, 8), (12, 10)]:
    raised(tree, x, z, 3.4)
for x in (-3, -1.5, 0, 1.5, 3):
    lantern(x, 3.1, -6)
rod('cordao_lanternas', (-4, 3.6, -6), (4, 3.6, -6), 0.012, dark)
for x in (-4, 4):
    cyl('poste_lanternas', (x, 1.8, -6), 0.05, 3.6, red, verts=10)
# Morros de pedra, altos e estreitos, perto e ao longe.
for x, z, r, h in [(5, -9, 2, 5), (9, -13, 2, 5), (-14, -18, 2.4, 6), (-22, -26, 4, 10), (15, -27, 5, 12), (27, -15, 4, 9), (2, -34, 5, 9)]:
    mountain(x, z, r, h, rock)
for bx, bz in [(5, 3), (-8.5, 6.5)]:
    for k in range(9):
        x, z = bx+math.cos(k*1.3)*1.2, bz+math.sin(k*1.3)*0.8
        hh = random.uniform(3.2, 4.2)
        cyl('bambu', (x, hh/2, z), 0.045, hh, leaf, verts=8, tint=tint(0.92, 0.07))
        for y in (1, 2, 3):
            cyl('bambu_no', (x, y, z), 0.052, 0.025, gold, verts=8)
            sphere('bambu_folha', (x+0.25, y+0.2, z), (0.45, 0.06, 0.09), leaf2, segments=10, rings=6)
# Portal da lua: muro caiado com passagem redonda.
gx, gz = 9, -3.5
for side in (-1, 1):
    box('muro_lua', (gx+side*2.2, 1.5, gz), (1.8, 3, 0.35), wall, bevel=0.03)
box('muro_lua', (gx, 2.75, gz), (2.6, 0.5, 0.35), wall)
box('muro_lua', (gx, 0.12, gz), (2.6, 0.24, 0.35), wall)
torus('portal_lua', (gx, 1.37, gz), 1.3, 0.45, stone, rot=(math.pi/2, 0, 0))
box('muro_telha', (gx, 3.1, gz), (6.6, 0.16, 0.75), roof, bevel=0.05)
box('muro_cumeeira', (gx, 3.24, gz), (6.2, 0.14, 0.3), roof, bevel=0.05)
stepping([(-2.9, -4.4), (-3.5, -5.1), (-4.2, -5.6)])
shore_rocks(9, 3, -11, 5.0, 4.2)
lotuses(16, 3, -11, 4.4, 3.6)
meadow(ok=away((3, -11, 5.6), (-5, -8, 3.4), (gx, gz, 3.7), (5, 3, 1.8), (-8.5, 6.5, 1.8)))
exports.append(collect('china', before))
water_node('china', 3, -11, 4.8, 4)

# ---------------------------------------------------------------- jardim japonês
before = set(bpy.data.objects)
plane()
torii(0, -7)
pavilion(5, -12)
for x, z in [(-5, -4), (5, -4), (-6, 4), (6, 5), (-8, -10), (8, -9), (-12, 2), (12, -1)]:
    raised(blossom, x, z)
for x in (-3.7, 3.7):
    for z in (-5, 5):
        cyl('lanterna_pedra', (x, 0.5, z), 0.15, 1, stone, verts=8)
        cyl('lanterna_pe', (x, 0.06, z), 0.26, 0.12, stone, verts=8)
        box('luz_lanterna', (x, 1.03, z), (0.35, 0.3, 0.35), neon_gold, bevel=0.02)
        cyl('teto_lanterna', (x, 1.3, z), 0.4, 0.22, roof, verts=4, radius2=0.03, rot=(0, 0, math.pi/4))
# Ponte curva acima de um pequeno lago lateral.
for k in range(16):
    t = k/15
    box('ponte_tabua', (-7+4*t, 0.18+0.45*math.sin(t*math.pi), -7), (0.26, 0.1, 1.3), wood, bevel=0.02)
    for dz in (-0.68, 0.68):
        cyl('ponte_balaustre', (-7+4*t, 0.58+0.45*math.sin(t*math.pi), -7+dz), 0.025, 0.8, red, verts=8)
# Jardim de pedras: areia penteada e três rochas.
cyl('areia_zen', (7.6, 0.0, 0.6), 2.0, 0.03, sand, verts=32)
for r in (0.75, 1.15, 1.55):
    torus('areia_sulco', (7.6, 0.012, 0.6), r, 0.02, wet)
for dx, dz, s in [(0, 0, 0.75), (0.7, 0.45, 0.45), (-0.55, 0.5, 0.35)]:
    rock_at(7.6+dx, 0.6+dz, s)
stepping([(0.1, -5.1), (-0.2, -5.8), (0.15, -6.5)])
for x, z in [(-7.5, 1.5), (-9, -1), (9.5, 4.5), (-3.5, 7.5), (3.2, 8)]:
    bush(x, z, 0.55, sakura if x < 0 else None)
for x, z, r, h in [(-21, -28, 9, 6), (19, -30, 10, 7), (1, -39, 12, 8)]:
    mountain(x, z, r, h)
shore_rocks(7, -5, -7, 3.2, 2.2)
lotuses(10, -5, -7, 2.6, 1.6)
meadow(tufts=50, flowers=26, ok=away((-5, -7, 4), (5, -12, 3.4), (7.6, 0.6, 2.5), (0, -7, 2.7)))
exports.append(collect('japao', before))
water_node('japao', -5, -7, 3, 2)


# ---------------------------------------------------------------- Muralha da China
def ridge(x, z):
    return hills(x, z, start=11, far=28, amp=4.2)


before = set(bpy.data.objects)
ground('chao', grass, height=ridge)
box('plataforma', (0, -0.012, 1), (12.4, 0.05, 14), stone, bevel=0.01)
cyl('roda_da_mesa', (0, 0.0, 0), 4.5, 0.04, path, verts=96)
# Plataforma larga com parapeitos fora da câmera; muralha serpenteia ao fundo.
for x in (-5.8, 5.8):
    box('parapeito', (x, 0.45, 1), (0.45, 0.9, 13), stone, bevel=0.03)
    for z in range(-5, 8):
        box('ameia', (x, 1.08, z), (0.5, 0.4, 0.5), stone, bevel=0.02, tint=tint(0.9, 0.06))
for k in range(10):
    z = -8-k*3.4
    x = math.sin(k*0.8)*4
    y = max(0.3+k*0.35, ridge(x, z)-0.5)
    box('muralha_corpo', (x, y+0.3, z), (3.6, 2.6, 3.8), stone, bevel=0.04, tint=tint(0.9, 0.06))
    for dx in (-1.65, 1.65):
        box('muralha_lateral', (x+dx, y+1.9, z), (0.32, 0.6, 3.8), stone)
        for dz in (-1.3, 0, 1.3):
            box('muralha_ameia', (x+dx, y+2.38, z+dz), (0.4, 0.4, 0.6), stone)
    if k % 3 == 0:
        box('torre_muralha', (x, y+1.5, z), (4, 5, 4), stone, bevel=0.05)
        for dx in (-1.7, 0, 1.7):
            for dz in (-1.7, 1.7):
                box('torre_ameia', (x+dx, y+4.3, z+dz), (0.7, 0.6, 0.6), stone)
        box('janela_torre', (x, y+2.4, z+2.02), (0.55, 0.9, 0.04), dark, bevel=0.1)
        cyl('torre_telhado', (x, y+4.75, z), 2.3, 0.7, roof, verts=4, radius2=0.7, rot=(0, 0, math.pi/4))
        flag(x, y+5.0, z)
for k in range(12):
    mountain((-1 if k % 2 else 1)*(12+k % 4*3), -12-k*3, 5+k % 3, 5+k % 4, hill)
scatter(30, pine, rmin=13, rmax=30, ok=lambda x, z: abs(x) > 7 or z > 6, height=ridge)
meadow(tufts=46, flowers=16, bushes=9, rocks=12, ok=lambda x, z: abs(x) > 7.2, height=ridge)
exports.append(collect('muralha', before))


# ---------------------------------------------------------------- Monte Fuji
def shore(x, z):
    return hills(x, z) * smooth(1, 11, z)


before = set(bpy.data.objects)
# Margem elevada, lago aberto e Fuji bem acima do horizonte.
ground('margem_fuji', grass, bounds=(-45, 45, -7, 27), height=shore)
box('margem_borda', (0, -0.12, -6.96), (90, 0.2, 0.08), rock)
cyl('pracinha_fuji', (0, -0.018, 0), 4.5, 0.04, path, verts=96)
stone_ring()
mountain(0, -44, 14, 7.6, mat('fuji_azul', '#68859d'), cap=snow)
for x, z in [(-6, -3), (6, -3), (-7, 6), (7, 6), (-12, 3), (12, 2)]:
    raised(blossom, x, z, height=shore)
torii(-9, -6)
for x, r, h in [(-17, 8, 5), (18, 8, 5.5), (-32, 9, 4), (33, 10, 4.5)]:
    mountain(x, -30, r, h, hill)
for x, z in [(-5, 2), (5, 3)]:
    bench(x, z)
sailboat(-9, -17, red)
sailboat(12, -25, gold)
for x in (-13, -7.5, 6, 11, 16):
    rock_at(x, -6.8, random.uniform(0.45, 0.7))
lotuses(12, 3, -9.5, 6, 1.6)
scatter(20, pine, rmin=14, rmax=28, ok=lambda x, z: z > -4, height=shore)
meadow(ok=lambda x, z: z > -6, height=shore)
exports.append(collect('fuji', before))
water_node('fuji', 0, -22, 46, 15)


# ---------------------------------------------------------------- Cataratas
def lookout(x, z):
    return hills(x, z) * smooth(2, 12, z)


before = set(bpy.data.objects)
box('leito_cataratas', (0, -0.4, -25), (100, 0.4, 90), rock)
ground('mirante_chao', grass, bounds=(-30, 30, -6.5, 22.5), height=lookout)
box('mirante_borda', (0, -0.12, -6.46), (60, 0.2, 0.08), rock)
cyl('mirante', (0, -0.018, 0), 4.6, 0.04, path, verts=96)
stone_ring(r=4.6)
# Guarda-corpo do mirante, largo para os jogadores e a câmera.
for x in range(-9, 10):
    cyl('mirante_poste', (x, 0.5, -6), 0.045, 1, wood, verts=10)
for y in (0.55, 1):
    rod('mirante_barra', (-10, y, -6), (10, y, -6), 0.045, wood)
for k in range(13):
    a = math.pi*(0.12+0.76*k/12)
    x, z = math.cos(a)*18, -10-math.sin(a)*12
    h = 5+0.7*math.sin(k*1.7)
    box('paredao', (x, h/2-0.9, z), (4.4, h+1.8, 4.6), rock, bevel=0.5, segments=3, tint=tint(0.9, 0.07))
    for dx, dz, r in [(0, 0, 2.3), (-1.3, 0.6, 1.3), (1.2, -0.5, 1.4), (0.3, 1.2, 1.1)]:
        sphere('mata_paredao', (x+dx, h+0.35, z+dz), (r, r*0.42, r), leaf if dx else leaf2, segments=14, rings=8, tint=tint(0.9, 0.08))
    for dx in (-0.7, 0, 0.7):
        box('queda_agua', (x+dx, h/2-0.7, z+2.34), (0.68, h+1, 0.13), fall, bevel=0.15, segments=3)
    sphere('espuma_base', (x, -0.1, z+2.6), (1.7, 0.28, 0.7), foam, segments=16, rings=10)
for k in range(11):  # pedras no rio, com espuma em volta
    x, z = random.uniform(-14, 14), random.uniform(-15.5, -8.5)
    s = random.uniform(0.5, 1.1)
    rock_at(x, z, s)
    torus('espuma_pedra', (x, 0.035, z), s*1.05, 0.05, foam)
for x, z in [(-6, 1), (6, 2), (-8, 7), (8, 8), (-12, -4), (12, -4)]:
    raised(tree, x, z, 3.6, height=lookout)
    raised(palm, x+1, z+2, 4, height=lookout)
meadow(tufts=80, flowers=26, bushes=18, rocks=6, ok=lambda x, z: z > -5.4, height=lookout)
exports.append(collect('cataratas', before))
water_node('cataratas', 0, -20, 25, 14)

# Um arquivo por destino (cenário, água e a mesa comum): o jogo só baixa o que foi escolhido.
os.makedirs(OUT, exist_ok=True)
table = exports[0]
total = 0
for scenery in exports[1:]:
    if scenery.name.endswith('_agua'):
        continue
    group = [table, scenery] + [o for o in exports if o.name == scenery.name + '_agua']
    target = os.path.join(OUT, scenery.name + '.glb')
    export(target, group, export_draco_color_quantization=6, export_draco_normal_quantization=8)
    total += os.path.getsize(target)
    print(f'CENARIO: {scenery.name}.glb ({os.path.getsize(target)/1e6:.2f} MB)')
print(f'CENARIOS: {OUT} ({total/1e6:.2f} MB ao todo)')
