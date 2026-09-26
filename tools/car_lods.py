"""Make lighter versions of the parked car for the 3D parking lot.

car.glb (the source, 359k triangles) is far more detailed than a car 10-45 m
away needs. This writes two versions next to it:

  car_mid.glb  every part kept (the seats show: it's an open-top car),
               decimated to ~170k triangles; used for the nearer cars
  car_lod.glb  no interior / brake parts, decimated to ~62k triangles;
               used for cars beyond CONFIG.knife3d.carDetailDist

Run with Blender's Python module (pip install bpy):
  python tools/car_lods.py web/assets/3d/car.glb
"""
import re
import sys
import bpy

HIDDEN = re.compile(r'steering|interior|leather|carpet|carbon|brake|nuts|centre|leds|wipers', re.I)


def build(src, out, drop_hidden, big_ratio, small_ratio):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    before = after = 0
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            continue
        mats = ' '.join(m.name for m in o.data.materials if m)
        if drop_hidden and (HIDDEN.search(o.name) or HIDDEN.search(mats)):
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        before += n
        if n > 1500:
            bpy.context.view_layer.objects.active = o
            mod = o.modifiers.new('dec', 'DECIMATE')
            mod.ratio = big_ratio if n > 20000 else small_ratio
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
        after += sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f'{out}: {before} -> {after} triangles')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)


if __name__ == '__main__':
    src = sys.argv[-1]
    base = src.rsplit('/', 1)[0]
    build(src, f'{base}/car_mid.glb', False, 0.4, 0.5)
    build(src, f'{base}/car_lod.glb', True, 0.22, 0.35)
