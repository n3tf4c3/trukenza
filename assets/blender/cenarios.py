"""Nove destinos externos: cenários cartoon originais, nas coordenadas do jogo.

blender -b --factory-startup -P assets/blender/cenarios.py
Exporta um GLB compacto com um nó por cenário, água separada e mesa comum.
O círculo de 4,5 m fica livre para cadeiras, caminhada e câmera.
"""
import math
import os
import random
import sys
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from lib import P, box, box_uv, cyl, export, join, mat, reset, sphere, torus

reset()
random.seed(73)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'apps/web/public/modelos/cenarios.glb')
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
path = mat('pedra_clara', '#d4bfa1')
pink = mat('coral', '#ed7c88')
gold = mat('amarelo', '#f5be55')
blue = mat('azul', '#427fb2')
cloud = mat('nuvem', '#fff5dc')
neon_pink = mat('neon_rosa', '#ed5cb1', emit='#ff3399', strength=3)
neon_blue = mat('neon_azul', '#5bdae8', emit='#2bd9ff', strength=3)
neon_gold = mat('neon_dourado', '#ffe3a0', emit='#ffd06b', strength=2.5)
night = mat('asfalto', '#242942')
hotel = mat('hotel', '#3d405e')
hotel2 = mat('hotel_claro', '#6f6072')


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


def palm(x, z, height=4.2):
    for k in range(10):
        t = k / 10
        cyl('tronco_coqueiro', (x + t*t*0.55, height*(t+0.05), z), 0.18-t*0.075, height/10+0.03,
            wood, verts=10, radius2=0.17-t*0.075)
    crown = (x+0.55, height, z)
    for k in range(9):
        a = k*math.tau/9
        vertices = [P(*crown)]
        for t, w, y in [(0.32, 0.32, 0.35), (0.7, 0.26, 0.08), (1, 0, -0.65)]:
            for side in (-1, 1):
                vertices.append(P(crown[0]+math.cos(a)*t*2+math.sin(a)*w*side,
                                  height+y, z+math.sin(a)*t*2-math.cos(a)*w*side))
        me = bpy.data.meshes.new('folha_coqueiro')
        me.from_pydata(vertices, [], [(0, 1, 2), (1, 3, 4, 2), (3, 5, 6, 4)])
        ob = bpy.data.objects.new('folha_coqueiro', me)
        bpy.context.collection.objects.link(ob)
        me.materials.append(leaf if k % 2 else leaf2)
    for a in (0, 2, 4):
        sphere('coco', (crown[0]+math.cos(a)*0.22, height-0.12, z+math.sin(a)*0.22), (0.16, 0.2, 0.16), wood, segments=12, rings=8)


def umbrella(x, z, material):
    cyl('haste_sombrinha', (x, 1.25, z), 0.035, 2.5, cream, verts=12)
    verts = [P(x, 2.7, z)] + [P(x+math.cos(k*math.tau/12)*1.5, 2.15, z+math.sin(k*math.tau/12)*1.5) for k in range(12)]
    me = bpy.data.meshes.new('sombrinha')
    me.from_pydata(verts, [], [(0, k+1, (k+1)%12+1) for k in range(12)])
    me.materials.append(material)
    me.materials.append(cream)
    for p in me.polygons:
        p.material_index = p.index % 2
    obj = bpy.data.objects.new('sombrinha', me)
    bpy.context.collection.objects.link(obj)
    sphere('ponteira', (x, 2.7, z), (0.07, 0.1, 0.07), cream, segments=12, rings=8)
    for dx in (-0.65, 0.65):
        box('espreguicadeira', (x+dx, 0.36, z+0.4), (0.5, 0.08, 1.5), cream, bevel=0.03)
        box('toalha', (x+dx, 0.41, z+0.4), (0.4, 0.02, 1.2), material, bevel=0.01)
        for dz in (-0.15, 0.95):
            box('pe_espreguicadeira', (x+dx, 0.18, z+dz), (0.4, 0.36, 0.04), wood)


def tree(x, z, height, autumn=False):
    cyl('tronco', (x, height/2, z), 0.2, height, wood, verts=10, radius2=0.10)
    for a in (0, 2.1, 4.2):
        rod('galho', (x, height*0.6, z), (x+math.cos(a)*0.8, height, z+math.sin(a)*0.8), 0.08, wood)
    for dx, dy, dz, r in [(0, 0.6, 0, 1.25), (-0.8, 0.1, 0, 1), (0.7, 0.2, 0.2, 1.1), (0, 0.1, -0.7, 1)]:
        sphere('copa', (x+dx, height+dy, z+dz), (r, r*0.9, r), gold if autumn else leaf2 if dx else leaf, segments=16, rings=10)


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
    sphere('luz_poste', (x, 3.05, z), (0.22, 0.28, 0.22), neon_gold, segments=16, rings=10)
    cyl('chapeu_poste', (x, 3.33, z), 0.3, 0.15, dark, radius2=0.03, verts=16)


def collect(name, before):
    objects = [o for o in bpy.data.objects if o not in before and o.type in ('MESH', 'FONT')]
    obj = join(name, objects)
    box_uv(obj)
    return obj


exports = []
before = set(bpy.data.objects)
cyl('mesa_tampo', (0, 0.735, 0), 1.5, 0.09, top, verts=96, bevel=0.018, segments=3)
cyl('mesa_borda', (0, 0.675, 0), 1.47, 0.04, wood, verts=96, bevel=0.01)
cyl('mesa_pedestal', (0, 0.34, 0), 0.16, 0.64, wood, verts=16, radius2=0.22)
for a in (0, math.pi/2):
    box('mesa_base', (0, 0.06, 0), (1.3, 0.12, 0.18), wood, rot_y=a, bevel=0.04)
exports.append(collect('mesa_externa', before))

before = set(bpy.data.objects)
box('areal', (0, -0.12, 4), (90, 0.2, 26), sand)
box('beira_agua', (0, -0.045, -9), (90, 0.04, 3), wet)
for x, z, h in [(-6,-3,4.5), (6,-5,5), (-8,5,4.2), (7,5,4.6), (12,-2,4.3)]:
    palm(x,z,h)
for x,z,c in [(-5,-6,pink),(5,3,blue),(-6,6,gold)]:
    umbrella(x,z,c)
# Caminho de tábuas do acesso à praia, fora da área de caminhada.
for k in range(26):
    box('passarela', (-9, 0.015, 8-k*0.44), (2, 0.08, 0.4), wood, bevel=0.018)
for k in range(32):
    x,z = random.uniform(-13,13), random.uniform(-7,10)
    if x*x+z*z < 24: continue
    sphere('pedrinha', (x,0.01,z), (0.09,0.045,0.06), cream, segments=8,rings=6)
for x,z in [(-12,-23),(13,-27)]:
    sphere('ilha', (x,0.1,z), (4,1.0,2.5), sand,segments=20,rings=10)
    palm(x,z,3.4)
for x,y,z in [(-11,9,-22),(5,8,-26),(18,10,-20)]:
    for dx in (-1,0,1): sphere('nuvem', (x+dx,y+0.2*(dx==0),z), (1.7,0.6,0.7), cloud,segments=16,rings=10)
exports.append(collect('praia', before))
before = set(bpy.data.objects)
box('oceano', (0,-0.08,-44), (110,0.08,68),sea)
for k in range(28):
    x,z = random.uniform(-35,35),random.uniform(-30,-10)
    sphere('onda', (x,-0.025,z),(random.uniform(0.7,2),0.022,0.05),foam,segments=12,rings=6)
exports.append(collect('praia_agua',before))

before = set(bpy.data.objects)
box('gramado',(0,-0.12,0),(90,0.2,90),grass)
cyl('pracinha',(0,-0.018,0),4.5,0.04,path,verts=96)
box('alameda',(0,-0.025,0),(2.5,0.04,60),path)
box('alameda',(0,-0.026,0),(50,0.04,2.5),path)
for k in range(16):
    a=k*math.tau/16
    r=8+(k%3)*2.8
    tree(math.cos(a)*r,math.sin(a)*r,3.2+(k%3)*0.4,k%5==0)
for x,z in [(-5,-3),(5,-3),(-5,4),(5,4)]:
    bench(x,z)
for x,z in [(-4.5,-4.5),(4.5,-4.5),(-4.5,4.5),(4.5,4.5)]:
    lamppost(x,z)
for x,z in [(-5.5,0),(5.5,0),(-4,-6),(4,-6)]:
    cyl('canteiro',(x,0.12,z),0.8,0.24,cream,verts=24,bevel=0.05)
    sphere('arbusto',(x,0.36,z),(0.75,0.35,0.65),leaf,segments=16,rings=10)
    for k in range(9):
        a=k*2.4
        sphere('flor',(x+math.cos(a)*0.5,0.65+0.08*math.sin(k),z+math.sin(a)*0.45),(0.09,0.055,0.09),pink if k%2 else gold,segments=8,rings=6)
# Coreto ao fundo.
cyl('coreto_base',(0,0.12,-10),2.2,0.24,cream,verts=8)
for k in range(8):
    a=k*math.tau/8
    cyl('coreto_pilar',(math.cos(a)*1.9,1.5,-10+math.sin(a)*1.9),0.07,2.8,cream,verts=8)
cyl('coreto_telhado',(0,3.35,-10),2.7,0.85,blue,verts=8,radius2=0)
for x,y,z in [(-15,10,-20),(9,9,-24),(20,11,12)]:
    for dx in (-1,0,1): sphere('nuvem',(x+dx,y,z),(2,0.55,0.8),cloud,segments=12,rings=8)
exports.append(collect('parque',before))

before=set(bpy.data.objects)
box('praca_noturna',(0,-0.12,0),(80,0.2,80),night)
cyl('terraco',(0,-0.025,0),4.6,0.06,mat('piso_vegas','#716579'),verts=96)
torus('contorno_terraco',(0,0.012,0),4.6,0.025,neon_gold)
# Boulevard e hotéis fictícios, sem copiar marcas ou fachadas.
for x in (-12,12):
    box('avenida',(x,-0.013,0),(5,0.03,70),mat('rua','#1b2034'))
    for z in range(-30,31,4): box('faixa',(x,0.01,z),(0.1,0.012,1.6),gold)
for k,(x,z) in enumerate([(-8,-11),(-3.8,-14),(2,-15),(7,-12),(-18,-4),(18,-4),(-16,10),(17,10),(-6,17),(5,17)]):
    h=5+(k%4)*1.5
    w=3.4
    box('hotel',(x,h/2,z),(w,h,3),hotel if k%2 else hotel2,bevel=0.16,segments=2)
    neon=[neon_pink,neon_blue,neon_gold][k%3]
    for dx in (-w/2,w/2): box('neon_vertical',(x+dx,h/2,z+1.53),(0.045,h,0.035),neon)
    for y in (0.7,h-0.2): box('neon_horizontal',(x,y,z+1.53),(w,0.06,0.035),neon)
    for row in range(int(h/0.65)-1):
        for col in range(5):
            if (row+col+k)%4==0: continue
            box('janela_hotel',(x-1.25+col*0.62,1+row*0.65,z+1.515),(0.28,0.3,0.025),neon_gold)
    box('cobertura',(x,h+0.2,z),(w+0.3,0.25,3.3),neon)
    if k < 4: text(['LUA','OASIS','AURORA','NOVA'][k],(x,h-0.8,z+1.56),0.42,neon)
# Letreiro principal em forma de losango arredondado.
for x in (-1.3,1.3): cyl('poste_letreiro',(x,1.8,-7.2),0.08,3.6,dark,verts=12)
box('letreiro_moldura',(0,3.7,-7.2),(5,2,0.2),neon_pink,bevel=0.32,segments=5)
box('letreiro_fundo',(0,3.7,-7.06),(4.8,1.8,0.08),mat('fundo_letreiro','#242b4d'),bevel=0.28,segments=5)
text('LAS VEGAS',(0,3.9,-6.99),0.62,neon_gold)
text('TRUKENZA',(0,3.3,-6.99),0.31,neon_blue)
for x in (-2.1,-1.4,-0.7,0,0.7,1.4,2.1): sphere('lampada',(x,4.55,-6.98),(0.055,0.055,0.035),neon_gold,segments=8,rings=6)
# Roda panorâmica e palmeiras junto ao boulevard.
torus('roda_gigante',(9,5,-10),3,0.055,neon_blue,rot=(math.pi/2,0,0))
for k in range(12):
    a=k*math.tau/12
    rod('raio_roda',(9,5,-10),(9+math.cos(a)*3,5+math.sin(a)*3,-10),0.018,neon_gold)
    sphere('cabine',(9+math.cos(a)*3,4.85+math.sin(a)*3,-10),(0.18,0.25,0.18),neon_pink,segments=12,rings=8)
for dx in (-1.5,1.5): rod('suporte_roda',(9+dx,0,-9.8),(9,5,-10),0.09,cream)
for x,z in [(-6,-3),(6,3),(-6,5),(7,-6)]: palm(x,z,3.6)
for x,z in [(-7,0),(7,0)]:
    cyl('fonte_bacia',(x,0.2,z),1.15,0.4,cream,verts=40,bevel=0.07)
    cyl('fonte_agua',(x,0.41,z),1.02,0.03,sea,verts=40)
    for k in range(7):
        a=k*math.tau/7
        cyl('jato_fonte',(x+math.cos(a)*0.45,0.8,z+math.sin(a)*0.45),0.025,0.8,neon_blue,verts=8)
exports.append(collect('vegas',before))

stone = mat('pedra_muralha','#aaa08a')
red = mat('vermelhao','#ac4139')
roof = mat('telhado_jade','#355c5e')
rock = mat('rocha','#687969')
snow = mat('neve','#f4f2ee')
lake = mat('lago','#6ab1bd',rough=0.25,metal=0.12)
sakura = mat('cerejeira','#f3b0cb')
hill = mat('montanha','#709b86')


def plane(size=90, material=grass):
    box('chao',(0,-0.12,0),(size,0.2,size),material)
    cyl('roda_da_mesa',(0,-0.018,0),4.5,0.04,path,verts=96)


def mountain(x,z,r,h,material=hill):
    cyl('montanha',(x,h/2-0.1,z),r,h,material,verts=24,radius2=0.3)


def blossom(x,z,h=3.1):
    cyl('cerejeira_tronco',(x,h/2,z),0.16,h,wood,verts=12,radius2=0.07)
    for k in range(5):
        a=k*math.tau/5
        dx,dz=math.cos(a)*0.75,math.sin(a)*0.75
        rod('cerejeira_galho',(x,h*0.65,z),(x+dx,h,z+dz),0.07,wood)
        sphere('flores_cerejeira',(x+dx,h+0.25,z+dz),(0.9,0.7,0.9),sakura,segments=18,rings=12)
    for k in range(14):
        a=k*2.4
        sphere('petala_caida',(x+math.cos(a)*1.6,0.01,z+math.sin(a)*1.5),(0.06,0.012,0.035),sakura,segments=8,rings=6)


def pavilion(x,z,levels=1):
    box('pavilhao_base',(x,0.15,z),(4.2,0.3,4.2),stone,bevel=0.08)
    for level in range(levels):
        w=3.6-level*0.55
        y=0.3+level*2.3
        for dx in (-w/2+0.2,w/2-0.2):
            for dz in (-w/2+0.2,w/2-0.2):
                cyl('coluna_vermelha',(x+dx,y+1,z+dz),0.09,2,red,verts=12)
        box('viga_pavilhao',(x,y+1.9,z),(w,0.18,w),red,bevel=0.03)
        # Duas saias sobrepostas de telhado, pontas ascendentes.
        cyl('telhado_pavilhao',(x,y+2.25,z),w*0.88,0.7,roof,verts=4,radius2=w*0.34,rot=(0,0,math.pi/4))
        for dx in (-1,1):
            for dz in (-1,1):
                rod('ponta_telhado',(x+dx*w*0.59,y+1.98,z+dz*w*0.59),(x+dx*w*0.72,y+2.2,z+dz*w*0.72),0.06,gold)
    sphere('remate_pavilhao',(x,levels*2.3+0.6,z),(0.11,0.25,0.11),gold,segments=12,rings=8)


def lantern(x,y,z):
    cyl('fio_lanterna',(x,y+0.4,z),0.009,0.5,dark,verts=6)
    sphere('lanterna',(x,y,z),(0.22,0.29,0.22),red,segments=16,rings=10)
    for dy in (-0.25,0.25): cyl('aro_lanterna',(x,y+dy,z),0.12,0.05,gold,verts=12)
    cyl('franja_lanterna',(x,y-0.4,z),0.025,0.22,gold,verts=8)


def torii(x,z):
    for dx in (-1.5,1.5):
        cyl('torii_pilar',(x+dx,1.8,z),0.14,3.6,red,verts=16,radius2=0.1)
        cyl('torii_base',(x+dx,0.25,z),0.17,0.5,dark,verts=16)
    box('torii_travessa',(x,2.6,z),(4,0.18,0.23),red,bevel=0.025)
    box('torii_topo',(x,3.45,z),(4.6,0.22,0.38),red,bevel=0.05)
    box('torii_capa',(x,3.62,z),(4.9,0.14,0.46),dark,bevel=0.05)
    box('torii_centro',(x,3.0,z),(0.18,0.7,0.18),red)


def water_node(name,x,z,rx,rz):
    before=set(bpy.data.objects)
    sphere('lago',(x,-0.04,z),(rx,0.07,rz),lake,segments=64,rings=10)
    for k in range(12):
        sphere('reflexo',(x+random.uniform(-rx*0.8,rx*0.8),0.032,z+random.uniform(-rz*0.7,rz*0.7)),(0.5,0.005,0.025),foam,segments=10,rings=6)
    exports.append(collect(name+'_agua',before))


before=set(bpy.data.objects)
plane(material=path)
# Torre Eiffel estilizada: quatro apoios abertos e treliça, vista de um café.
tx,tz=0,-15
for sx in (-1,1):
    for sz in (-1,1):
        pts=[(tx+sx*2.8,0,tz+sz*2.8),(tx+sx*1.55,4,tz+sz*1.55),(tx+sx*0.7,7,tz+sz*0.7),(tx+sx*0.12,12,tz+sz*0.12)]
        for i in range(3): rod('torre_pilar',pts[i],pts[i+1],0.15 if i==0 else 0.09,wood)
for y,r in [(3.9,1.6),(6.9,0.75),(9,0.45),(10.6,0.25)]:
    for side in (-1,1):
        box('torre_plataforma',(tx,y,tz+side*r),(r*2+0.35,0.18,0.25),wood)
        box('torre_plataforma',(tx+side*r,y,tz),(0.25,0.18,r*2+0.35),wood)
for y0,y1,r0,r1 in [(0,2,2.8,2.2),(2,4,2.2,1.55),(4,5.5,1.55,1.12),(5.5,7,1.12,0.7),(7,9,0.7,0.45),(9,10.6,0.45,0.25)]:
    for side in (-1,1):
        for flip in (-1,1):
            rod('trelica',(tx+flip*r0,y0,tz+side*r0),(tx-flip*r1,y1,tz+side*r1),0.036,wood)
            rod('trelica',(tx+side*r0,y0,tz+flip*r0),(tx+side*r1,y1,tz-flip*r1),0.036,wood)
rod('antena',(0,12,-15),(0,13,-15),0.045,wood)
for k in range(8):
    x=(-1 if k%2 else 1)*(8+k%3)
    z=-9+(k//2)*7
    box('fachada_paris',(x,3,z),(3,6,4),cream,bevel=0.08)
    cyl('telhado_paris',(x,6.5,z),2.7,1.2,mat('ardosia','#566171'),verts=4,radius2=1.4,rot=(0,0,math.pi/4))
    for y in (1.5,3,4.5):
        for dx in (-0.8,0.8):
            box('janela_paris',(x+dx,y,z+2.02),(0.65,0.95,0.06),blue,bevel=0.1)
            box('sacada',(x+dx,y-0.45,z+2.2),(0.85,0.12,0.4),dark,bevel=0.03)
for x in (-5,5):
    tree(x,-6,3.2)
    lamppost(x,2)
    bench(x,4)
umbrella(-5,6,red)
# O marco cabe acima dos personagens no enquadramento da mesa; escala de diorama.
for o in bpy.data.objects:
    if o not in before and o.type == 'MESH' and o.name.startswith(('torre_', 'trelica', 'antena')):
        o.location = P(-3,0,-25) + (o.location-P(0,0,-15))*0.65
        o.scale *= 0.65
exports.append(collect('paris',before))

before=set(bpy.data.objects)
plane()
pavilion(-5,-8,2)
for x,z in [(-6,4),(6,5),(7,-5),(-10,-2)]: tree(x,z,3.4)
for x in (-3,-1.5,0,1.5,3): lantern(x,3.1,-6)
rod('cordao_lanternas',(-4,3.6,-6),(4,3.6,-6),0.012,dark)
for x,z in [(5,-9),(9,-13),(-14,-18)]:
    mountain(x,z,2,5,rock)
for k in range(8):
    x,z=5+math.cos(k)*1.2,3+math.sin(k)*0.8
    cyl('bambu',(x,1.9,z),0.045,3.8,leaf,verts=8)
    for y in (1,2,3):
        torus('bambu_no',(x,y,z),0.05,0.008,gold)
        sphere('bambu_folha',(x+0.25,y+0.2,z),(0.45,0.06,0.09),leaf2,segments=10,rings=6)
exports.append(collect('china',before))
water_node('china',3,-11,4.8,4)

before=set(bpy.data.objects)
plane()
torii(0,-7)
pavilion(5,-12)
for x,z in [(-5,-4),(5,-4),(-6,4),(6,5),(-8,-10),(8,-9)]: blossom(x,z)
for x in (-3.7,3.7):
    for z in (-5,5):
        cyl('lanterna_pedra',(x,0.5,z),0.15,1,stone,verts=8)
        box('luz_lanterna',(x,1.03,z),(0.35,0.3,0.35),neon_gold,bevel=0.02)
        cyl('teto_lanterna',(x,1.3,z),0.4,0.22,roof,verts=4,radius2=0.03,rot=(0,0,math.pi/4))
# Ponte curva acima de um pequeno lago lateral.
for k in range(16):
    t=k/15
    box('ponte_tabua',(-7+4*t,0.18+0.45*math.sin(t*math.pi),-7),(0.26,0.1,1.3),wood,bevel=0.02)
    for dz in (-0.68,0.68):
        cyl('ponte_balaustre',(-7+4*t,0.58+0.45*math.sin(t*math.pi),-7+dz),0.025,0.8,red,verts=8)
exports.append(collect('japao',before))
water_node('japao',-5,-7,3,2)

before=set(bpy.data.objects)
plane(material=stone)
# Plataforma larga com parapeitos fora da câmera; muralha serpenteia ao fundo.
for x in (-5.8,5.8):
    box('parapeito',(x,0.45,1),(0.45,0.9,13),stone,bevel=0.03)
    for z in range(-5,8): box('ameia',(x,1.08,z),(0.5,0.4,0.5),stone,bevel=0.02)
for k in range(10):
    z=-8-k*3.4
    x=math.sin(k*0.8)*4
    y=0.3+k*0.35
    box('muralha_corpo',(x,y+0.8,z),(3.6,1.6,3.8),stone,bevel=0.04)
    for dx in (-1.65,1.65):
        box('muralha_lateral',(x+dx,y+1.9,z),(0.32,0.6,3.8),stone)
        for dz in (-1.3,0,1.3): box('muralha_ameia',(x+dx,y+2.38,z+dz),(0.4,0.4,0.6),stone)
    if k%3==0:
        box('torre_muralha',(x,y+2,z),(4,4,4),stone,bevel=0.05)
        for dx in (-1.7,0,1.7):
            for dz in (-1.7,1.7): box('torre_ameia',(x+dx,y+4.3,z+dz),(0.7,0.6,0.6),stone)
        box('janela_torre',(x,y+2.4,z+2.02),(0.55,0.9,0.04),dark,bevel=0.1)
for k in range(12):
    mountain((-1 if k%2 else 1)*(10+k%4*3),-10-k*3,5+k%3,4+k%4,hill)
exports.append(collect('muralha',before))

before=set(bpy.data.objects)
# Margem elevada, lago aberto e Fuji bem acima do horizonte.
box('margem_fuji',(0,-0.12,10),(90,0.2,34),grass)
cyl('pracinha_fuji',(0,-0.018,0),4.5,0.04,path,verts=96)
mountain(0,-44,14,7,mat('fuji_azul','#68859d'))
cyl('fuji_nevado',(0,6.05,-44),4,1.9,snow,verts=36,radius2=0.3)
for k in range(9):
    a=k*math.tau/9
    sphere('neve_irregular',(math.cos(a)*3,5.075+0.1*math.sin(k),-44+math.sin(a)*3),(1.3,0.4,1.2),snow,segments=12,rings=8)
for x,z in [(-6,-3),(6,-3),(-7,6),(7,6)]: blossom(x,z)
torii(-9,-6)
for x in (-16,17): mountain(x,-30,8,5,hill)
for x,z in [(-5,2),(5,3)]: bench(x,z)
exports.append(collect('fuji',before))
water_node('fuji',0,-22,46,15)

before=set(bpy.data.objects)
box('leito_cataratas',(0,-0.4,-25),(100,0.4,90),rock)
box('mirante_chao',(0,-0.12,8),(60,0.2,29),grass)
cyl('mirante',(0,-0.018,0),4.6,0.04,path,verts=96)
# Guarda-corpo do mirante, largo para os jogadores e a câmera.
for x in range(-9,10):
    cyl('mirante_poste',(x,0.5,-6),0.045,1,wood,verts=10)
for y in (0.55,1): rod('mirante_barra',(-10,y,-6),(10,y,-6),0.045,wood)
for k in range(13):
    a=math.pi*(0.12+0.76*k/12)
    x,z=math.cos(a)*18,-10-math.sin(a)*12
    h=5+0.7*math.sin(k*1.7)
    box('paredao',(x,h/2-0.9,z),(4.4,h+1.8,4.6),rock,bevel=0.5,segments=3)
    sphere('mata_paredao',(x,h+0.35,z),(2.3,0.8,2.5),leaf,segments=16,rings=10)
    for dx in (-0.7,0,0.7):
        box('queda_agua',(x+dx,h/2-0.7,z+2.34),(0.68,h+1,0.13),fall,bevel=0.15,segments=3)
    sphere('espuma_base',(x,-0.1,z+2.6),(1.7,0.28,0.7),foam,segments=16,rings=10)
for x,z in [(-6,1),(6,2),(-8,7),(8,8),(-12,-4),(12,-4)]:
    tree(x,z,3.6)
    palm(x+1,z+2,4)
exports.append(collect('cataratas',before))
water_node('cataratas',0,-20,25,14)

os.makedirs(os.path.dirname(OUT),exist_ok=True)
export(OUT,exports)
print(f'CENARIOS: {OUT} ({os.path.getsize(OUT)/1e6:.2f} MB; {len(exports)} peças)')
