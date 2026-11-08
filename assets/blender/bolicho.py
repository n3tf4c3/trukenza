"""Bolicho gaúcho do Trukenza: cenário, mesa e cadeira de palha.

    blender -b --factory-startup -P assets/blender/bolicho.py [-- --previa caminho.png]

Gera apps/web/public/modelos/bolicho.glb com quatro nós:
- `cenario`: sala, balcão, prateleiras, mesa e decoração, numa malha só, com sombra de contato assada.
- `brilhos`: o que emite luz (vidro dos lampiões, fogo, céu da porta e da janela), sem sombra assada.
- `cadeira`: uma cadeira de palha na origem, assento olhando para -z; o jogo a repete em cada lugar.
- `copo`: um copo de cerveja com o fundo na origem; o jogo põe um na frente de cada jogador sentado.

Medidas do jogo (`apps/web/src/scene/layout.ts`): mesa na origem com tampo a 0,78 m e raio 1,5 m;
cadeiras a 2,1 m do centro; quem espera de pé fica num arco a 3,6 m do lado da porta (x negativo),
e esse caminho fica livre. Sala de 12 × 12 m e 3,4 m de pé-direito.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from lib import P, srgb, apply_all, bake_ao, box, box_uv, cyl, export, grid, join, lathe, mat, paint, reset, sphere, tint, torus  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'modelos', 'bolicho.glb')

HALF = 6.0
H = 3.4
TABLE_TOP = 0.78
TABLE_R = 1.5

reset()

# Materiais: os nomes são o contrato com o jogo (apps/web/src/scene/bolicho.ts põe as texturas).
M = {
    'piso': mat('piso', '#88745e', rough=0.85),
    'parede': mat('parede', '#e5ddca', rough=0.95),
    'tijolo': mat('tijolo', '#91715b', rough=0.9),
    'forro': mat('forro', '#7a5434', rough=0.85),
    'madeira': mat('madeira', '#84634a', rough=0.72),
    'madeira_escura': mat('madeira_escura', '#514336', rough=0.75),
    'tampo': mat('tampo', '#98764f', rough=0.7),  # mel suave: preserva o contraste das cartas
    'ferro': mat('ferro', '#2b2b2e', rough=0.45, metal=0.8),
    'latao': mat('latao', '#c9973f', rough=0.3, metal=0.9),
    'vidro_verde': mat('vidro_verde', '#2f5d2a', rough=0.08),
    'vidro_ambar': mat('vidro_ambar', '#8a4b12', rough=0.08),
    'vidro_claro': mat('vidro_claro', '#c9d6cf', rough=0.05),
    'rotulo': mat('rotulo', '#efe2c0', rough=0.8),
    'saco': mat('saco', '#c9b28a', rough=1.0),
    'erva': mat('erva', '#4f7a2c', rough=0.9),
    'couro': mat('couro', '#6b3a1e', rough=0.55),
    'poncho': mat('poncho', '#ffffff', rough=1.0),  # cores das listras vêm por face
    'linguica': mat('linguica', '#8a3b24', rough=0.5),
    'cuia': mat('cuia', '#6e4a22', rough=0.6),
    'feijao': mat('feijao', '#3b1f14', rough=0.4),
    'lenha': mat('lenha', '#6b4a2e', rough=0.95),
    'brasa': mat('brasa', '#2a1a12', rough=1.0),
    'quadro': mat('quadro', '#7d9a5c', rough=0.9),
    'palha': mat('palha', '#d8b46a', rough=0.95),
    # Mesa de truco com os amigos: cerveja gelada e churrasco.
    'cerveja': mat('cerveja', '#d99a1e', rough=0.12),
    'espuma': mat('espuma', '#fbf5e6', rough=0.9),
    'carne': mat('carne', '#7a3a22', rough=0.6),
    'carne_rosada': mat('carne_rosada', '#c96a5a', rough=0.65),
    'pao': mat('pao', '#d8a35a', rough=0.85),
    'farofa': mat('farofa', '#e2c27c', rough=1.0),
    'louca': mat('louca', '#f1ebdc', rough=0.4),
}
GLOW = {
    'chama': mat('chama', '#ffb347', emit='#ff9a2e', strength=6.0),
    'lampiao_vidro': mat('lampiao_vidro', '#fff1c9', emit='#ffd27a', strength=5.0),
    'ceu': mat('ceu', '#cfe6ff', emit='#e8f1ff', strength=1.6),
}

scene_parts = []
glow_parts = []


def add(o):
    scene_parts.append(o)
    return o


def glow(o):
    glow_parts.append(o)
    return o


# ---------------------------------------------------------------- sala
GRID = 0.2
N = int(2 * HALF / GRID)
NH = int(H / GRID)

add(grid('piso', (-HALF, 0, HALF), (2 * HALF, 0, 0), (0, 0, -2 * HALF), N, N, M['piso']))
add(grid('teto', (-HALF, H, -HALF), (2 * HALF, 0, 0), (0, 0, 2 * HALF), N // 2, N // 2, M['forro']))

# Paredes caiadas, com um rodapé de tijolo aparente. Porta na esquerda, janela na direita.
DOOR = (-4.0, -2.4, 2.3)  # z0, z1, altura (porta na parede x = -HALF)
WIN = (-1.0, 1.0, 1.0, 2.2)  # z0, z1, y0, y1 (janela na parede x = +HALF)


def frac(a, lo, hi):
    return (a - lo) / (hi - lo)


# Fundo (z = -HALF) e frente (z = +HALF), inteiras.
add(grid('parede_fundo', (-HALF, 0, -HALF + 0.01), (2 * HALF, 0, 0), (0, H, 0), N, NH, M['parede']))
add(grid('parede_frente', (HALF, 0, HALF - 0.01), (-2 * HALF, 0, 0), (0, H, 0), N, NH, M['parede']))
# Esquerda (x = -HALF), de z = +HALF até -HALF, com a porta.
add(grid('parede_esq', (-HALF + 0.01, 0, HALF), (0, 0, -2 * HALF), (0, H, 0), N, NH, M['parede'],
         holes=[(frac(-DOOR[1], -HALF, HALF), frac(-DOOR[0], -HALF, HALF), 0, DOOR[2] / H)]))
# Direita (x = +HALF), de z = -HALF até +HALF, com a janela.
add(grid('parede_dir', (HALF - 0.01, 0, -HALF), (0, 0, 2 * HALF), (0, H, 0), N, NH, M['parede'],
         holes=[(frac(WIN[0], -HALF, HALF), frac(WIN[1], -HALF, HALF), WIN[2] / H, WIN[3] / H)]))

# Rodapé de tijolo (0,9 m), um pouco à frente da parede.
WAIN = 0.9
add(grid('tijolo_fundo', (-HALF, 0, -HALF + 0.04), (2 * HALF, 0, 0), (0, WAIN, 0), N, 5, M['tijolo']))
add(grid('tijolo_frente', (HALF, 0, HALF - 0.04), (-2 * HALF, 0, 0), (0, WAIN, 0), N, 5, M['tijolo']))
add(grid('tijolo_esq', (-HALF + 0.04, 0, HALF), (0, 0, -2 * HALF), (0, WAIN, 0), N, 5, M['tijolo'],
         holes=[(frac(-DOOR[1], -HALF, HALF), frac(-DOOR[0], -HALF, HALF), 0, 1)]))
add(grid('tijolo_dir', (HALF - 0.04, 0, -HALF), (0, 0, 2 * HALF), (0, WAIN, 0), N, 5, M['tijolo']))
for name, c, s in [
    ('friso_fundo', (0, WAIN, -HALF + 0.06), (2 * HALF, 0.06, 0.06)),
    ('friso_frente', (0, WAIN, HALF - 0.06), (2 * HALF, 0.06, 0.06)),
    ('friso_dir', (HALF - 0.06, WAIN, 0), (0.06, 0.06, 2 * HALF)),
]:
    add(box(name, c, s, M['madeira_escura'], bevel=0.01))
for z0, z1 in [(-HALF, DOOR[0]), (DOOR[1], HALF)]:
    add(box('friso_esq', (-HALF + 0.06, WAIN, (z0 + z1) / 2), (0.06, 0.06, z1 - z0), M['madeira_escura'], bevel=0.01))

# Esteios nos cantos e vigas do telhado (a do meio segura o lampião).
for x in (-HALF + 0.15, HALF - 0.15):
    for z in (-HALF + 0.15, HALF - 0.15):
        add(box('esteio', (x, H / 2, z), (0.26, H, 0.26), M['madeira_escura'], bevel=0.03, tint=tint(1, 0.06)))
for x in (-4.0, -2.0, 0.0, 2.0, 4.0):
    add(box('viga', (x, H - 0.12, 0), (0.2, 0.24, 2 * HALF), M['madeira_escura'], bevel=0.02, tint=tint(1, 0.08)))
add(box('viga_mestra', (0, H - 0.3, 0), (2 * HALF, 0.26, 0.24), M['madeira_escura'], bevel=0.02))

# ---------------------------------------------------------------- porta (parede da esquerda)
z0, z1, dh = DOOR
zc = (z0 + z1) / 2
glow(box('ceu_porta', (-HALF - 0.35, dh / 2, zc), (0.02, dh + 0.2, z1 - z0 + 0.2), GLOW['ceu']))
add(box('soleira', (-HALF + 0.05, 0.02, zc), (0.3, 0.04, z1 - z0 + 0.2), M['madeira_escura']))
add(box('verga', (-HALF + 0.05, dh + 0.08, zc), (0.3, 0.16, z1 - z0 + 0.3), M['madeira_escura'], bevel=0.02))
for z in (z0 - 0.07, z1 + 0.07):
    add(box('batente', (-HALF + 0.05, dh / 2, z), (0.3, dh, 0.14), M['madeira_escura'], bevel=0.02))
# Duas folhas abertas para dentro, de tábuas.
leaf = (z1 - z0) / 2
for side, hinge in ((-1, z0), (1, z1)):
    a = math.radians(70) * side
    for k in range(4):
        off = (k + 0.5) * leaf / 4
        x = -HALF + 0.12 + math.sin(abs(a)) * off
        z = hinge - side * math.cos(a) * off
        add(box('folha_porta', (x, dh / 2 - 0.05, z), (0.05, dh - 0.12, leaf / 4 - 0.01), M['madeira'],
                rot_y=-a, bevel=0.008, tint=tint(1, 0.1)))

# ---------------------------------------------------------------- janela (parede da direita)
wz0, wz1, wy0, wy1 = WIN
glow(box('ceu_janela', (HALF + 0.3, (wy0 + wy1) / 2, 0), (0.02, wy1 - wy0 + 0.3, wz1 - wz0 + 0.3), GLOW['ceu']))
# Coxilha ao longe, recortada no céu.
add(box('coxilha', (HALF + 0.25, wy0 + 0.12, 0), (0.02, 0.3, wz1 - wz0 + 0.4), M['erva']))
add(box('peitoril', (HALF - 0.08, wy0 - 0.04, 0), (0.34, 0.08, wz1 - wz0 + 0.3), M['madeira_escura'], bevel=0.015))
add(box('verga_janela', (HALF - 0.05, wy1 + 0.06, 0), (0.28, 0.12, wz1 - wz0 + 0.3), M['madeira_escura'], bevel=0.015))
for z in (wz0 - 0.06, wz1 + 0.06):
    add(box('batente_janela', (HALF - 0.05, (wy0 + wy1) / 2, z), (0.28, wy1 - wy0, 0.12), M['madeira_escura'], bevel=0.015))
add(box('mainel', (HALF - 0.05, (wy0 + wy1) / 2, 0), (0.06, wy1 - wy0, 0.05), M['madeira_escura']))
# Postigos abertos contra a parede.
for side in (-1, 1):
    zc2 = side * ((wz1 - wz0) / 2 + 0.5)
    for k in range(3):
        add(box('postigo', (HALF - 0.12, (wy0 + wy1) / 2, zc2 + (k - 1) * 0.32), (0.04, wy1 - wy0, 0.3), M['madeira'],
                bevel=0.008, tint=tint(0.95, 0.08)))

# ---------------------------------------------------------------- balcão com grade (fundo)
BZ = -4.55  # centro do balcão em z
BW = 6.4
add(box('balcao_corpo', (0, 0.52, BZ), (BW, 1.04, 0.6), M['madeira'], bevel=0.02))
add(box('balcao_tampo', (0, 1.07, BZ + 0.03), (BW + 0.12, 0.06, 0.76), M['tampo'], bevel=0.015))
for i in range(32):  # tábuas da frente
    x = -BW / 2 + (i + 0.5) * BW / 32
    add(box('balcao_tabua', (x, 0.52, BZ + 0.31), (BW / 32 - 0.012, 0.98, 0.03), M['madeira'], bevel=0.006,
            tint=tint(1, 0.1)))
add(box('balcao_rodape', (0, 0.05, BZ + 0.33), (BW, 0.1, 0.06), M['madeira_escura']))
# A grade do bolicho: barras do tampo até a travessa, com o vão do atendimento no meio.
GY0, GY1 = 1.1, 2.55
add(box('grade_travessa', (0, GY1, BZ + 0.05), (BW, 0.1, 0.1), M['madeira_escura'], bevel=0.015))
add(box('grade_travessa2', (0, GY0 + 0.05, BZ + 0.05), (BW, 0.06, 0.08), M['madeira_escura'], bevel=0.01))
for i in range(41):
    x = -BW / 2 + i * BW / 40
    if abs(x) < 0.55:
        continue
    add(cyl('grade_barra', (x, (GY0 + GY1) / 2, BZ + 0.05), 0.018, GY1 - GY0, M['madeira_escura'], verts=8))
for x in (-0.6, 0.6):
    add(box('grade_moldura', (x, (GY0 + GY1) / 2, BZ + 0.05), (0.08, GY1 - GY0, 0.08), M['madeira_escura'], bevel=0.01))
add(cyl('grade_ao_teto', (0, (GY1 + H) / 2, BZ + 0.05), 0.04, H - GY1, M['madeira_escura'], verts=10))

# Prateleiras na parede do fundo com garrafas, vidros e pacotes de erva.
SZ = -5.78
for y in (1.25, 1.65, 2.05, 2.45):
    add(box('prateleira', (0, y, SZ), (BW, 0.04, 0.34), M['madeira'], bevel=0.008, tint=tint(1, 0.05)))
for x in (-BW / 2, 0, BW / 2):
    add(box('prateleira_lado', (x, 1.85, SZ), (0.05, 1.3, 0.34), M['madeira_escura']))


def bottle(x, y, z, kind):
    glass = M[kind]
    h = random.uniform(0.26, 0.33)
    r = random.uniform(0.035, 0.045)
    prof = [(r * 0.95, 0), (r, 0.02), (r, h * 0.62), (r * 0.45, h * 0.78), (r * 0.3, h * 0.86), (r * 0.3, h), (r * 0.36, h + 0.01)]
    add(lathe('garrafa', (x, y, z), prof, glass, verts=12))
    if random.random() < 0.75:
        add(cyl('rotulo', (x, y + h * 0.33, z), r + 0.002, h * 0.25, M['rotulo'], verts=12, tint=tint(1, 0.12)))


def jar(x, y, z):
    add(lathe('vidro', (x, y, z), [(0.05, 0), (0.06, 0.02), (0.06, 0.16), (0.045, 0.18), (0.045, 0.2)], M['vidro_claro'], verts=12))
    add(cyl('tampa', (x, y + 0.205, z), 0.047, 0.02, M['latao'], verts=12))
    add(cyl('doce', (x, y + 0.07, z), 0.055, 0.12, M['linguica'] if random.random() < 0.5 else M['erva'], verts=12))


for y in (1.27, 1.67, 2.07, 2.47):
    x = -BW / 2 + 0.12
    while x < BW / 2 - 0.12:
        r = random.random()
        z = SZ + random.uniform(-0.05, 0.05)
        if r < 0.55:
            bottle(x, y, z, random.choice(['vidro_verde', 'vidro_verde', 'vidro_ambar', 'vidro_claro']))
            x += random.uniform(0.1, 0.14)
        elif r < 0.75:
            jar(x + 0.03, y, z)
            x += 0.16
        elif r < 0.92:
            for k in range(random.randint(1, 3)):  # pacotes de erva-mate em pé
                add(box('erva_pacote', (x + 0.04, y + 0.13, z), (0.1, 0.26, 0.07), M['erva'], bevel=0.008, tint=tint(1, 0.12)))
                x += 0.11
            x += 0.04
        else:
            x += random.uniform(0.15, 0.3)

# Linguiças penduradas numa vara sobre o balcão.
add(cyl('vara', (2.0, 2.65, BZ + 0.35), 0.018, 1.6, M['madeira_escura'], axis='x', verts=8))
for x0 in (1.4, 1.75, 2.1, 2.45):
    y = 2.6
    for k in range(4):
        add(sphere('linguica', (x0 + math.sin(k * 1.7) * 0.02, y - 0.07, BZ + 0.35), (0.026, 0.075, 0.026), M['linguica'],
                   segments=10, rings=8, tint=tint(1, 0.1)))
        y -= 0.15

# Barris atrás do balcão e uma pipa deitada no canto.
for x in (-2.6, -2.0):
    add(lathe('barril', (x, 0, -5.55), [(0.24, 0), (0.28, 0.25), (0.29, 0.38), (0.28, 0.5), (0.24, 0.75)], M['madeira'], verts=20,
              tint=tint(1, 0.08)))
    for y in (0.12, 0.62):
        add(cyl('aro', (x, y, -5.55), 0.272 if y < 0.3 else 0.262, 0.035, M['ferro'], verts=20))

# ---------------------------------------------------------------- frente: fogão campeiro, violão e poncho
FZ = HALF - 0.45
# Lareira aberta de tijolo: soleira, pilares, fundo com fuligem, consolo de madeira, coifa e chaminé.
add(box('lareira_soleira', (0, 0.05, FZ - 0.1), (2.0, 0.1, 1.0), M['tijolo'], bevel=0.015))
add(box('lareira_fundo', (0, 0.75, HALF - 0.12), (1.6, 1.5, 0.16), M['tijolo']))
add(box('lareira_fuligem', (0, 0.6, HALF - 0.205), (1.06, 0.95, 0.01), M['brasa']))
for x in (-0.72, 0.72):
    add(box('lareira_pilar', (x, 0.7, FZ + 0.05), (0.36, 1.2, 0.6), M['tijolo'], bevel=0.015))
add(box('lareira_consolo', (0, 1.36, FZ - 0.02), (1.9, 0.12, 0.72), M['madeira_escura'], bevel=0.02))
add(box('coifa', (0, 1.84, FZ + 0.15), (1.6, 0.84, 0.5), M['parede'], bevel=0.04))
add(box('chamine', (0, (2.26 + H) / 2, FZ + 0.2), (0.7, H - 2.26, 0.36), M['parede'], bevel=0.02))
for k in range(5):  # lenha queimando sobre a soleira
    a = k * 0.6
    add(cyl('tora', (math.cos(a) * 0.16, 0.16, FZ + 0.05 + math.sin(a) * 0.08), 0.045, 0.5, M['lenha'], axis='x',
            rot=(0, 0, a), verts=8))
for k in range(6):
    x = (k - 2.5) * 0.11
    glow(cyl('chama', (x, 0.33 + random.uniform(0, 0.05), FZ + 0.05), 0.065, random.uniform(0.22, 0.36), GLOW['chama'], radius2=0.0,
             verts=8, smooth=True))
# Chaleira esquentando na soleira e uma cuia no consolo.
CX = -0.95
add(lathe('chaleira', (CX, 0.1, FZ - 0.35), [(0.1, 0), (0.13, 0.05), (0.13, 0.12), (0.08, 0.18), (0.03, 0.2), (0.035, 0.22)], M['ferro'],
          verts=16))
add(cyl('bico', (CX + 0.15, 0.22, FZ - 0.35), 0.015, 0.16, M['ferro'], axis='x', rot=(0, -0.6, 0), verts=8))
add(torus('alca', (CX, 0.34, FZ - 0.35), 0.08, 0.008, M['ferro'], rot=(math.pi / 2, 0, 0)))
add(lathe('cuia_consolo', (0.6, 1.42, FZ - 0.15), [(0.03, 0), (0.06, 0.03), (0.07, 0.07), (0.06, 0.11), (0.045, 0.13)], M['cuia'], verts=16))
# Lenha empilhada ao lado.
for row in range(4):
    for k in range(5 - row):
        add(cyl('lenha', (1.25 + k * 0.13 + row * 0.065, 0.06 + row * 0.11, FZ), 0.055, 0.6, M['lenha'], axis='z', verts=8,
                tint=tint(1, 0.15)))

# Violão pendurado.
GX, GY = -2.6, 1.75
add(sphere('violao_corpo_baixo', (GX, GY - 0.12, HALF - 0.08), (0.2, 0.22, 0.05), M['madeira'], tint=(1.1, 1.0, 0.85)))
add(sphere('violao_corpo_cima', (GX, GY + 0.14, HALF - 0.08), (0.15, 0.16, 0.05), M['madeira'], tint=(1.1, 1.0, 0.85)))
add(cyl('violao_boca', (GX, GY + 0.02, HALF - 0.135), 0.05, 0.01, M['brasa'], axis='z', verts=16))
add(box('violao_braco', (GX, GY + 0.52, HALF - 0.1), (0.06, 0.6, 0.03), M['madeira_escura']))
add(box('violao_cabeca', (GX, GY + 0.86, HALF - 0.1), (0.08, 0.14, 0.03), M['madeira_escura'], bevel=0.01))

# Poncho pendurado num cabide, com listras e franja.
PX, PY = 2.6, 1.55
add(cyl('cabide', (PX, PY + 0.62, HALF - 0.12), 0.015, 1.1, M['madeira_escura'], axis='x', verts=8))
poncho = add(grid('poncho', (PX + 0.5, PY - 0.55, HALF - 0.1), (-1.0, 0, 0), (0, 1.15, 0), 10, 12, M['poncho']))
col = poncho.data.color_attributes['Col']
for poly in poncho.data.polygons:
    cy = sum(poncho.data.vertices[v].co.z for v in poly.vertices) / len(poly.vertices)
    band = int((cy - (PY - 0.55)) / 0.115)
    c = srgb('#8e1f2f') if band % 4 else srgb('#2a1c18')
    if band in (1, 10):
        c = srgb('#d9a441')
    for li in poly.loop_indices:
        col.data[li].color = c
for k in range(20):
    paint(add(box('franja', (PX - 0.48 + k * 0.05, PY - 0.62, HALF - 0.1), (0.012, 0.14, 0.012), M['poncho'])), srgb('#8e1f2f')[:3])

# Quadro com uma paisagem do pampa.
add(box('quadro_moldura', (-0.0, 2.55, HALF - 0.06), (0.8, 0.55, 0.04), M['madeira_escura'], bevel=0.015))
add(box('quadro_tela', (0, 2.55, HALF - 0.085), (0.68, 0.43, 0.01), M['quadro']))

# ---------------------------------------------------------------- direita: sela no cavalete, laço e mesinha
SXp, SZp = 5.1, 3.4
for dz in (-0.35, 0.35):
    for dx in (-0.25, 0.25):
        add(box('cavalete_pe', (SXp + dx, 0.38, SZp + dz), (0.06, 0.8, 0.06), M['madeira'], rot_y=0.15 * dx, bevel=0.008))
add(box('cavalete_trave', (SXp, 0.78, SZp), (0.12, 0.1, 0.9), M['madeira_escura'], bevel=0.01))
add(sphere('sela', (SXp, 0.88, SZp), (0.32, 0.12, 0.42), M['couro']))
add(sphere('pelego', (SXp, 0.95, SZp), (0.26, 0.06, 0.34), M['saco'], tint=(1.15, 1.12, 1.05)))
for dz in (-0.12, 0.12):
    add(box('loro', (SXp + 0.3, 0.6, SZp + dz), (0.02, 0.45, 0.05), M['couro']))
    add(torus('estribo', (SXp + 0.31, 0.36, SZp + dz), 0.06, 0.01, M['ferro'], rot=(0, math.pi / 2, 0)))
# Laço enrolado na parede.
for k in range(5):
    add(torus('laco', (HALF - 0.08, 1.75, -3.4 + k * 0.012), 0.26 - k * 0.01, 0.012, M['couro'], rot=(0, math.pi / 2, 0)))
add(cyl('cabide_laco', (HALF - 0.12, 2.02, -3.4), 0.02, 0.2, M['madeira_escura'], axis='x', verts=8))
# Chapéu num gancho.
add(cyl('chapeu_aba', (HALF - 0.14, 1.7, -2.2), 0.2, 0.015, M['couro'], axis='x', verts=24, tint=(0.6, 0.6, 0.6)))
add(cyl('chapeu_copa', (HALF - 0.2, 1.7, -2.2), 0.11, 0.12, M['couro'], axis='x', radius2=0.1, verts=24, tint=(0.6, 0.6, 0.6)))

# Mesinha embaixo da janela com cuia, bomba e garrafa térmica.
MX, MZ = 5.25, 0.0
add(box('mesinha_tampo', (MX, 0.7, MZ), (0.6, 0.05, 0.9), M['tampo'], bevel=0.012))
for dx in (-0.24, 0.24):
    for dz in (-0.38, 0.38):
        add(box('mesinha_pe', (MX + dx, 0.34, MZ + dz), (0.05, 0.68, 0.05), M['madeira'], bevel=0.006))
add(lathe('cuia', (MX - 0.05, 0.725, MZ - 0.15), [(0.03, 0), (0.06, 0.03), (0.07, 0.07), (0.06, 0.11), (0.045, 0.13)], M['cuia'], verts=16))
add(sphere('erva_na_cuia', (MX - 0.05, 0.85, MZ - 0.15), (0.042, 0.012, 0.042), M['erva']))
add(cyl('bomba', (MX - 0.03, 0.92, MZ - 0.14), 0.005, 0.2, M['latao'], rot=(0.25, 0, 0), verts=6))
add(lathe('termica', (MX + 0.05, 0.725, MZ + 0.2), [(0.06, 0), (0.065, 0.02), (0.065, 0.28), (0.04, 0.32), (0.03, 0.36)], M['ferro'], verts=16,
          tint=(0.55, 0.6, 0.75)))

# ---------------------------------------------------------------- esquerda: sacas e barris longe do caminho de quem chega
for i, (x, z) in enumerate([(-5.45, 3.2), (-5.45, 3.75), (-4.95, 3.45), (-5.45, 4.3)]):
    # Saca de juta: caixa suavizada vira um saco cheio; em cima, a boca amarrada.
    add(box('saca', (x, 0.3, z), (0.46, 0.6, 0.38), M['saco'], rot_y=random.uniform(-0.3, 0.3), subdiv=2, smooth=True,
            tint=tint(1, 0.08)))
    add(cyl('saca_amarra', (x, 0.62, z), 0.06, 0.06, M['couro'], verts=10, tint=(0.8, 0.75, 0.6)))
    add(sphere('saca_boca', (x, 0.68, z), (0.09, 0.05, 0.08), M['saco']))
add(box('saca_em_cima', (-5.45, 0.8, 3.5), (0.62, 0.34, 0.4), M['saco'], rot_y=0.2, subdiv=2, smooth=True, tint=tint(1, 0.08)))
for z in (4.9, 5.45):
    add(lathe('barril', (-5.4, 0, z), [(0.24, 0), (0.28, 0.25), (0.29, 0.38), (0.28, 0.5), (0.24, 0.75)], M['madeira'], verts=20))
    for y in (0.12, 0.62):
        add(cyl('aro', (-5.4, y, z), 0.272 if y < 0.3 else 0.262, 0.035, M['ferro'], verts=20))
# Banco comprido encostado no fundo, à esquerda do balcão.
add(box('banco', (-4.9, 0.45, -5.5), (1.6, 0.06, 0.4), M['madeira'], bevel=0.01))
for dx in (-0.7, 0.7):
    add(box('banco_pe', (-4.9 + dx, 0.22, -5.5), (0.06, 0.44, 0.34), M['madeira_escura']))

# ---------------------------------------------------------------- mesa de truco
add(cyl('mesa_tampo', (0, TABLE_TOP - 0.045, 0), TABLE_R, 0.09, M['tampo'], verts=96, bevel=0.025, segments=4))
add(cyl('mesa_saia', (0, TABLE_TOP - 0.13, 0), TABLE_R - 0.12, 0.12, M['madeira_escura'], verts=48))
# Borda torneada e cavilhas: detalhes de marcenaria abaixo do plano das cartas.
add(torus('mesa_friso', (0, TABLE_TOP - 0.065, 0), TABLE_R - 0.018, 0.014, M['madeira_escura']))
for k in range(16):
    a = k * math.pi / 8
    add(cyl('mesa_cavilha', (math.cos(a) * 1.40, TABLE_TOP + 0.0003, math.sin(a) * 1.40),
            0.008, 0.001, M['madeira_escura'], verts=10))
add(lathe('mesa_coluna', (0, 0.06, 0), [(0.16, 0), (0.2, 0.08), (0.12, 0.2), (0.1, 0.4), (0.13, 0.5), (0.1, 0.56)], M['madeira'], verts=24))
for k in range(4):  # pés em cruz
    a = k * math.pi / 2 + math.pi / 4
    add(box('mesa_pe', (math.cos(a) * 0.38, 0.05, math.sin(a) * 0.38), (0.72, 0.1, 0.12), M['madeira_escura'], rot_y=-a, bevel=0.02))
# Marcador de pontos: um potinho de feijões na beira da mesa, entre duas cadeiras.
BX, BZ2 = math.cos(math.pi / 4) * 1.18, math.sin(math.pi / 4) * 1.18
add(lathe('potinho', (BX, TABLE_TOP, BZ2), [(0.05, 0), (0.07, 0.015), (0.075, 0.04), (0.07, 0.045)], M['cuia'], verts=16))
for k in range(16):
    a = random.uniform(0, 2 * math.pi)
    r = random.uniform(0, 0.055)
    add(sphere('feijao', (BX + math.cos(a) * r, TABLE_TOP + 0.035 + random.uniform(0, 0.01), BZ2 + math.sin(a) * r),
               (0.009, 0.006, 0.006), M['feijao'], segments=8, rings=6))
for k in range(5):  # feijões já ganhos, do lado de fora
    add(sphere('feijao_ganho', (BX - 0.15 + k * 0.022, TABLE_TOP + 0.006, BZ2 + 0.1), (0.009, 0.006, 0.006), M['feijao'], segments=8, rings=6))

# Pequeno conjunto de cerâmica no aparador, longe da área de jogo.
for x, z in [(MX - 0.12, MZ - 0.24), (MX + 0.10, MZ + 0.22)]:
    add(lathe('caneca', (x, 0.73, z), [(0.046, 0), (0.05, 0.01), (0.052, 0.1),
              (0.047, 0.105), (0.041, 0.095), (0.04, 0.02)], M['rotulo'], verts=24))
    add(torus('caneca_alca', (x + 0.055, 0.785, z), 0.028, 0.007, M['rotulo'], rot=(math.pi / 2, 0, 0)))

# Relógio de parede no fundo, com aro, marcações e ponteiros em relevo.
CX, CY, CZ = -4.25, 2.35, -5.91
add(cyl('relogio_aro', (CX, CY, CZ), 0.29, 0.065, M['madeira_escura'], axis='z', verts=48, bevel=0.012))
add(cyl('relogio_fundo', (CX, CY, CZ + 0.037), 0.255, 0.012, M['rotulo'], axis='z', verts=48))
for k in range(12):
    a = k * math.pi / 6
    add(sphere('relogio_marca', (CX + math.sin(a) * 0.215, CY + math.cos(a) * 0.215, CZ + 0.05),
               (0.011, 0.011, 0.004), M['madeira_escura'], segments=8, rings=6))
add(box('relogio_minuto', (CX, CY + 0.085, CZ + 0.057), (0.012, 0.17, 0.006), M['ferro']))
add(box('relogio_hora', (CX - 0.06, CY, CZ + 0.063), (0.12, 0.017, 0.006), M['ferro']))

# ---------------------------------------------------------------- petiscos e cerveja na mesa
# Ângulos a partir de +z (como `polar` em layout.ts), a 65° de cada cadeira: longe do monte de quem
# distribui (cadeira + 41°), dos copos (cadeira + 13°, no jogo) e dos montinhos de vazas, que não passam
# de 1,34 m do centro na direção das cadeiras. Sorteio próprio: não mexe no resto do cenário.
rng = random.Random(1808)


def on_table(deg, r):
    a = math.radians(deg)
    return math.sin(a) * r, math.cos(a) * r, a


def off(x, z, a, t, rad):
    """Desloca t ao longo da borda e rad para fora, a partir de (x, z)."""
    return x + math.cos(a) * t + math.sin(a) * rad, z - math.sin(a) * t + math.cos(a) * rad


def beer_bottle(x, z):
    y = TABLE_TOP
    prof = [(0.036, 0), (0.04, 0.02), (0.04, 0.17), (0.02, 0.23), (0.014, 0.26), (0.014, 0.3), (0.017, 0.305)]
    add(lathe('garrafa_cerveja', (x, y, z), prof, M['vidro_ambar'], verts=16))
    add(cyl('garrafa_rotulo', (x, y + 0.09, z), 0.0415, 0.07, M['rotulo'], verts=16))
    add(cyl('garrafa_tampa', (x, y + 0.31, z), 0.018, 0.012, M['latao'], verts=12))


# Tábua de churrasco: picanha fatiada e linguiça.
x, z, a = on_table(65, 1.26)
add(box('tabua', (x, TABLE_TOP + 0.014, z), (0.36, 0.028, 0.22), M['madeira'], rot_y=a, bevel=0.01))
hx, hz = off(x, z, a, 0.215, 0)
add(box('tabua_cabo', (hx, TABLE_TOP + 0.014, hz), (0.08, 0.022, 0.05), M['madeira'], rot_y=a, bevel=0.008))
for k in range(5):
    sx, sz = off(x, z, a, -0.13 + k * 0.045, -0.04)
    add(box('picanha', (sx, TABLE_TOP + 0.045, sz), (0.032, 0.035, 0.1), M['carne'], rot_y=a + rng.uniform(-0.15, 0.15),
            bevel=0.008, tint=tint(1, 0.1)))
    add(box('picanha_miolo', (sx + math.cos(a) * 0.0165, TABLE_TOP + 0.045, sz - math.sin(a) * 0.0165), (0.002, 0.026, 0.085),
            M['carne_rosada'], rot_y=a))
for k in range(3):
    sx, sz = off(x, z, a, -0.1 + k * 0.08, 0.06)
    add(sphere('linguica_assada', (sx, TABLE_TOP + 0.05, sz), (0.035, 0.022, 0.022), M['linguica'], segments=10, rings=8,
               tint=tint(0.85, 0.1)))

# Cerveja e pão.
x, z, a = on_table(155, 1.3)
beer_bottle(*off(x, z, a, -0.09, 0))
px, pz = off(x, z, a, 0.1, -0.02)
add(lathe('prato_pao', (px, TABLE_TOP, pz), [(0.05, 0), (0.09, 0.008), (0.1, 0.02), (0.095, 0.022)], M['louca'], verts=24))
for k in range(4):
    ang = k * math.pi / 2 + 0.4
    add(sphere('pao', (px + math.cos(ang) * 0.04, TABLE_TOP + 0.035, pz + math.sin(ang) * 0.04), (0.032, 0.025, 0.028), M['pao'],
               segments=10, rings=8, tint=tint(1, 0.08)))

# Farofa e mais linguiça.
x, z, a = on_table(245, 1.27)
add(lathe('cumbuca', (x, TABLE_TOP, z), [(0.04, 0), (0.07, 0.03), (0.08, 0.06), (0.077, 0.062)], M['louca'], verts=24))
add(cyl('farofa', (x, TABLE_TOP + 0.05, z), 0.073, 0.02, M['farofa'], verts=24, radius2=0.06))
for k in range(3):
    sx, sz = off(x, z, a, 0.13 + k * 0.035, rng.uniform(-0.03, 0.03))
    add(sphere('linguica_assada', (sx, TABLE_TOP + 0.022, sz), (0.022, 0.022, 0.05), M['linguica'], segments=10, rings=8,
               tint=tint(0.85, 0.1)))

# Mais uma garrafa, já pela metade da rodada.
x, z, a = on_table(335, 1.3)
beer_bottle(x, z)

# ---------------------------------------------------------------- copo de cerveja (separado)
# Na origem, com o fundo em y = 0; o jogo põe um na frente de cada jogador e o leva à boca nos goles.
cup = [
    lathe('copo_fundo', (0, 0, 0), [(0.036, 0), (0.038, 0.012)], M['vidro_claro'], verts=20),
    lathe('copo_cerveja', (0, 0.012, 0), [(0.038, 0), (0.046, 0.11), (0.0465, 0.112)], M['cerveja'], verts=20),
    lathe('copo_espuma', (0, 0.12, 0), [(0.046, 0), (0.048, 0.022), (0.03, 0.034), (0.008, 0.038)], M['espuma'], verts=20),
]

# ---------------------------------------------------------------- lampiões
LY = 2.35  # base do lampião sobre a mesa (o jogo põe a luz em LAMP_Y)


def lampiao(x, y, z, hanging):
    add(cyl('lampiao_base', (x, y, z), 0.09, 0.06, M['latao'], verts=16, bevel=0.005))
    glow(lathe('lampiao_globo', (x, y + 0.03, z), [(0.05, 0), (0.08, 0.06), (0.085, 0.12), (0.06, 0.2), (0.04, 0.22)],
               GLOW['lampiao_vidro'], verts=16))
    add(cyl('lampiao_tampa', (x, y + 0.27, z), 0.07, 0.05, M['ferro'], radius2=0.03, verts=16))
    for a in (0, math.pi):
        add(cyl('lampiao_haste', (x + math.cos(a) * 0.08, y + 0.15, z + math.sin(a) * 0.08), 0.006, 0.26, M['ferro'], verts=6))
    if hanging:
        add(torus('lampiao_alca', (x, y + 0.34, z), 0.05, 0.006, M['ferro'], rot=(math.pi / 2, 0, 0)))
        add(cyl('corrente', (x, (y + 0.38 + H - 0.42) / 2, z), 0.006, H - 0.42 - (y + 0.38), M['ferro'], verts=6))


lampiao(0, LY, 0, hanging=True)
lampiao(-1.6, 1.1, BZ, hanging=False)

# ---------------------------------------------------------------- cadeira de palha (separada)
chair = []
SH = 0.48
for dx in (-0.21, 0.21):
    for dz in (-0.19, 0.19):
        chair.append(cyl('cadeira_pe', (dx, SH / 2, dz), 0.022, SH, M['madeira'], verts=10, radius2=0.018))
for dz in (-0.19, 0.19):
    chair.append(cyl('cadeira_travessa', (0, 0.16, dz), 0.012, 0.42, M['madeira'], axis='x', verts=8))
for dx in (-0.21, 0.21):
    chair.append(cyl('cadeira_travessa', (dx, 0.12, 0), 0.012, 0.38, M['madeira'], axis='z', verts=8))
# Quadro do assento e a palha trançada (a textura vem do jogo).
for dz in (-0.21, 0.21):
    chair.append(box('cadeira_quadro', (0, SH, dz), (0.48, 0.04, 0.04), M['madeira'], bevel=0.008))
for dx in (-0.23, 0.23):
    chair.append(box('cadeira_quadro', (dx, SH, 0), (0.04, 0.04, 0.46), M['madeira'], bevel=0.008))
chair.append(box('cadeira_palha', (0, SH + 0.005, 0), (0.44, 0.03, 0.4), M['palha'], bevel=0.01, segments=3))
# Encosto atrás de quem senta (+z), com duas travessas curvas.
for dx in (-0.21, 0.21):
    chair.append(cyl('cadeira_encosto_pe', (dx, SH + 0.34, 0.2), 0.022, 0.68, M['madeira'], verts=10))
    chair.append(sphere('cadeira_pinha', (dx, SH + 0.7, 0.2), (0.03, 0.04, 0.03), M['madeira'], segments=10, rings=8))
for y in (0.3, 0.55):
    chair.append(box('cadeira_ripa', (0, SH + y, 0.21), (0.42, 0.08 if y > 0.4 else 0.06, 0.025), M['madeira'], bevel=0.01))

# ---------------------------------------------------------------- montagem, sombra assada e exportação
cenario = join('cenario', scene_parts)
box_uv(cenario)
bake_ao(cenario)
brilhos = join('brilhos', glow_parts)
box_uv(brilhos)  # o céu ganha o degradê pela altura, em metros
cadeira = join('cadeira', chair)
copo = join('copo', cup)
box_uv(cadeira, scale=2.0)
for o in (brilhos, cadeira, copo):
    o.data.color_attributes.active_color = o.data.color_attributes['Col']

os.makedirs(os.path.dirname(OUT), exist_ok=True)
export(OUT, [cenario, brilhos, cadeira, copo])
tris = sum(len(p.vertices) - 2 for o in (cenario, brilhos, cadeira, copo) for p in o.data.polygons)
print(f'BOLICHO: {OUT} ({os.path.getsize(OUT) / 1e6:.2f} MB, {tris} triângulos)')

# Prévia opcional, para conferir sem abrir o jogo.
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--previa' in argv:
    path = argv[argv.index('--previa') + 1]
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 20
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    cam.location = P(0.9, 2.2, 3.6)
    target = P(-0.1, 0.9, -1.0)
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    for name, loc, energy, color in [('lampiao', P(0, LY + 0.12, 0), 250, (1, 0.8, 0.55)), ('fogo', P(0, 0.6, FZ - 0.4), 120, (1, 0.6, 0.3)),
                                     ('janela', P(4.5, 1.6, 0), 200, (0.85, 0.92, 1))]:
        ld = bpy.data.lights.new(name, 'POINT')
        ld.energy = energy
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        sc.collection.objects.link(lo)
    for k in range(2):  # cadeiras de exemplo
        c = cadeira.copy()
        a = k * math.pi
        c.location = P(math.sin(a) * 2.1, 0, math.cos(a) * 2.1)
        c.rotation_euler = (0, 0, a)
        sc.collection.objects.link(c)
    sc.world.color = (0.05, 0.04, 0.035)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('PREVIA:', path)
