"""Apoio comum aos scripts do Blender (cenário e personagens).

Tudo é pensado nas coordenadas do jogo (three.js: Y para cima, +Z para a câmera); `P` converte para o
Blender (Z para cima). O exportador glTF faz a conversão de volta, então o que é modelado aqui com
`P(x, y, z)` aparece no jogo exatamente em (x, y, z).

Rodar sempre em segundo plano, a partir da raiz do projeto, por exemplo:
    blender -b --factory-startup -P assets/blender/bolicho.py
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector


def P(x, y, z):
    """Ponto do jogo (x, y, z) → Blender (x, -z, y)."""
    return Vector((x, -z, y))


def S(sx, sy, sz):
    """Tamanho no jogo (largura, altura, profundidade) → escala do Blender."""
    return Vector((sx, sz, sy))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(7)


def srgb(hexcolor):
    """'#rrggbb' em sRGB → RGBA linear (o que o Blender e o glTF guardam)."""
    h = hexcolor.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


_MATS = {}


def mat(name, color='#ffffff', rough=0.7, metal=0.0, emit=None, strength=0.0):
    """Material por nome (reaproveitado). O jogo troca/acrescenta texturas pelo nome."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = strength
    _MATS[name] = m
    return m


def _finish(obj, material, tint=None, smooth=False, bevel=0.0, segments=2, subdiv=0):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new('chanfro', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
    if subdiv > 0:
        mod = obj.modifiers.new('suave', 'SUBSURF')
        mod.levels = subdiv
        mod.render_levels = subdiv
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    paint(obj, tint or (1.0, 1.0, 1.0))
    return obj


def paint(obj, rgb):
    """Cor por vértice uniforme ('Col'): variação de tom entre peças do mesmo material."""
    me = obj.data
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for d in attr.data:
        d.color = (*rgb, 1.0)
    me.color_attributes.active_color = attr
    return attr


def tint(base=1.0, spread=0.08):
    v = base + random.uniform(-spread, spread)
    return (v, v, v)


def box(name, center, size, material, rot_y=0.0, **kw):
    """Caixa no jogo: centro (x, y, z), tamanho (largura, altura, profundidade), giro em torno de Y."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*center))
    o = bpy.context.object
    o.name = name
    o.scale = S(*size)
    o.rotation_euler = (0, 0, rot_y)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(o, material, **kw)


def cyl(name, center, radius, height, material, verts=24, axis='y', radius2=None, rot=(0, 0, 0), **kw):
    """Cilindro (ou tronco de cone com `radius2`) ao longo do eixo do jogo indicado."""
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=height, location=P(*center))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=radius2, depth=height, location=P(*center))
    o = bpy.context.object
    o.name = name
    # O cilindro nasce em Z do Blender = Y do jogo.
    if axis == 'x':
        o.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'z':
        o.rotation_euler = (math.pi / 2, 0, 0)
    if rot != (0, 0, 0):
        o.rotation_euler = (o.rotation_euler[0] + rot[0], o.rotation_euler[1] + rot[1], o.rotation_euler[2] + rot[2])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return _finish(o, material, **kw)


def sphere(name, center, radii, material, segments=24, rings=16, rot=(0, 0, 0), **kw):
    """Esfera (elipsoide com `radii` = (rx, ry, rz) no jogo)."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=P(*center))
    o = bpy.context.object
    o.name = name
    o.scale = S(*radii)
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    kw.setdefault('smooth', True)
    return _finish(o, material, **kw)


def torus(name, center, major, minor, material, rot=(0, 0, 0), arc=None, **kw):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=10, location=P(*center))
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    kw.setdefault('smooth', True)
    return _finish(o, material, **kw)


def lathe(name, base, profile, material, verts=24, **kw):
    """Sólido de revolução em torno do eixo Y do jogo. `profile` = [(raio, altura), ...] de baixo para cima."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for r, h in profile:
        ring = []
        for i in range(verts):
            a = 2 * math.pi * i / verts
            ring.append(bm.verts.new(P(base[0] + math.cos(a) * r, base[1] + h, base[2] + math.sin(a) * r)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(verts):
            j = (i + 1) % verts
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    bottom = bm.faces.new(list(reversed(rings[0])))
    top = bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    kw.setdefault('smooth', True)
    return _finish(o, material, **kw)


def grid(name, origin, u, v, nu, nv, material, holes=(), **kw):
    """Plano em grade a partir de `origin`, com lados `u` e `v` (vetores do jogo) e nu × nv quadrados.
    `holes` = [(u0, u1, v0, v1)] em frações de 0 a 1: quadrados dentro deles não são criados (portas e janelas)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    o3, u3, v3 = Vector(origin), Vector(u), Vector(v)
    vs = [[bm.verts.new(P(*(o3 + u3 * (i / nu) + v3 * (j / nv)))) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            cu, cv = (i + 0.5) / nu, (j + 0.5) / nv
            if any(a <= cu <= b and c <= cv <= d for a, b, c, d in holes):
                continue
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    loose = [vv for vv in bm.verts if not vv.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return _finish(o, material, **kw)


def apply_all(objs):
    """Aplica modificadores (chanfro, suavização) e devolve os objetos já em malha final."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    return list(bpy.context.selected_objects)


def join(name, objs):
    objs = apply_all(objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.data.name = name
    return o


def box_uv(obj, scale=1.0):
    """UV por projeção de caixa no espaço do jogo (1 unidade = 1 m × scale): o jogo põe texturas de madeira,
    tijolo e palha pelo nome do material, sem costuras visíveis em peças retas."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = obj.matrix_world @ l.vert.co
            gx, gy, gz = co.x, co.z, -co.y  # de volta às coordenadas do jogo
            if ax == 2:  # normal em Z do Blender = Y do jogo (chão, teto, tampos)
                l[uv].uv = (gx * scale, gz * scale)
            elif ax == 0:  # normal em X
                l[uv].uv = (gz * scale, gy * scale)
            else:  # normal em Y do Blender = Z do jogo
                l[uv].uv = (gx * scale, gy * scale)
    bm.to_mesh(me)
    bm.free()


def bake_ao(obj, samples=48, distance=0.9):
    """Assa a oclusão de ambiente nos vértices e multiplica na cor 'Col' (escurece cantos e encostos)."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.device = 'CPU'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('mundo')
    scene.world.light_settings.distance = distance
    me = obj.data
    col = me.color_attributes['Col']
    ao = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO')
    for c, a in zip(col.data, ao.data):
        k = 0.35 + 0.65 * a.color[0]  # nunca preto total: o jogo ainda tem luz ambiente
        c.color = (c.color[0] * k, c.color[1] * k, c.color[2] * k, 1.0)
    me.color_attributes.remove(ao)
    me.color_attributes.active_color = me.color_attributes['Col']


def export(path, objects=None):
    if objects is not None:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=objects is not None,
        export_apply=True,
        export_yup=True,
        export_vertex_color='ACTIVE',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
    )
