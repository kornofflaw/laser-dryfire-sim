# rocketbox_to_glb.py — convert Microsoft Rocketbox avatars and animations
# (MIT, github.com/microsoft/Microsoft-Rocketbox) into web-ready GLBs for the
# 3D scenarios. Run with Blender's Python module (pip install bpy, Python 3.11):
#
#   python rocketbox_to_glb.py avatar  <Rocketbox>/Assets/Avatars/.../X.fbx  out/X.glb
#   python rocketbox_to_glb.py anims   out/anims.glb  name=<anim.fbx> [name=<anim.fbx> ...]
#
# What it does:
#   * renames the 3ds Max Biped bones to the names char3d.js uses (Hips,
#     Spine1, RightArm, LeftUpLeg ...), so poses, hit zones and blood work
#     on these avatars exactly as on the other models
#   * relinks the textures (the FBX paths point at the authors' machine),
#     shrinks them to 1024 px JPEG (the hair/eyelash opacity map stays PNG)
#   * exports metres, Y up; animations keep bone rotations and the hips'
#     position only, so any clip plays on any avatar of the same sex
# It is a one-off asset tool, not part of the web app.

import bpy, os, sys

BONES = {
    'Bip01 Pelvis': 'Hips', 'Bip01 Spine': 'Spine', 'Bip01 Spine1': 'Spine1', 'Bip01 Spine2': 'Spine2',
    'Bip01 Neck': 'Neck', 'Bip01 Head': 'Head', 'Bip01 HeadNub': 'HeadTop_End',
}
for side, S in (('L', 'Left'), ('R', 'Right')):
    BONES.update({
        f'Bip01 {side} Clavicle': f'{S}Shoulder', f'Bip01 {side} UpperArm': f'{S}Arm',
        f'Bip01 {side} Forearm': f'{S}ForeArm', f'Bip01 {side} Hand': f'{S}Hand',
        f'Bip01 {side} Thigh': f'{S}UpLeg', f'Bip01 {side} Calf': f'{S}Leg',
        f'Bip01 {side} Foot': f'{S}Foot', f'Bip01 {side} Toe0': f'{S}ToeBase',
    })
    for i, finger in enumerate(('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')):
        BONES[f'Bip01 {side} Finger{i}'] = f'{S}Hand{finger}1'
        BONES[f'Bip01 {side} Finger{i}1'] = f'{S}Hand{finger}2'
        BONES[f'Bip01 {side} Finger{i}2'] = f'{S}Hand{finger}3'

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def armature():
    return [o for o in bpy.data.objects if o.type == 'ARMATURE']

def rename_bones(arm):
    for b in arm.data.bones:
        if b.name in BONES:
            b.name = BONES[b.name]

def rename_action(action):
    # Blender 5 layered actions: fcurves live in channelbags.
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                drop = []
                for fc in bag.fcurves:
                    p = fc.data_path
                    if p.startswith('pose.bones["'):
                        name = p.split('"')[1]
                        new = BONES.get(name, name)
                        fc.data_path = p.replace(f'"{name}"', f'"{new}"')
                        # Body bones only (no face / nub bones); rotations
                        # everywhere, position only on the hips.
                        if name not in BONES:
                            drop.append(fc)
                        elif fc.data_path.endswith('location') and new != 'Hips':
                            drop.append(fc)
                        elif fc.data_path.endswith('scale'):
                            drop.append(fc)
                for fc in drop:
                    bag.fcurves.remove(fc)

def fix_textures(tex_dir, out_dir, size=1024):
    # Blender's module build can't read these TGAs, so PIL converts them first.
    from PIL import Image
    os.makedirs(out_dir, exist_ok=True)
    for img in list(bpy.data.images):
        base = os.path.basename(img.filepath.replace('\\', '/'))
        src = os.path.join(tex_dir, base)
        if not os.path.exists(src) or 'specular' in base.lower():
            continue
        alpha = 'opacity' in base.lower()
        stem = os.path.splitext(base)[0]
        path = os.path.join(out_dir, stem + ('.png' if alpha else '.jpg'))
        im = Image.open(src)
        px = size // 2 if alpha else size  # hair/eyelash cards don't need more
        im = im.convert('RGBA' if alpha else 'RGB').resize((px, px), Image.LANCZOS)
        im.save(path, **({} if alpha else {'quality': 85}))
        new = bpy.data.images.load(path)
        if 'normal' in base.lower():
            new.colorspace_settings.name = 'Non-Color'
        img.user_remap(new)
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)

def simplify_materials():
    # Specular maps -> plain roughness (skin and cloth); glTF has no 3ds Max specular.
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        for name in ('Specular IOR Level', 'Specular', 'Roughness', 'Metallic'):
            inp = bsdf.inputs.get(name)
            if inp:
                for l in list(inp.links):
                    nt.links.remove(l)
        bsdf.inputs['Roughness'].default_value = 0.62
        bsdf.inputs['Metallic'].default_value = 0.0
        for n in list(nt.nodes):
            if n.type == 'TEX_IMAGE' and n.image and 'specular' in n.image.name.lower():
                nt.nodes.remove(n)

def export(path, anims):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=False,
        export_animations=anims, export_animation_mode='ACTIONS' if anims else 'ACTIONS',
        export_force_sampling=True, export_frame_step=2, export_optimize_animation_size=True, export_def_bones=True, export_skins=True, export_morph=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_image_format='AUTO', export_jpeg_quality=85,
    )

def avatar(fbx, out):
    reset()
    bpy.ops.import_scene.fbx(filepath=fbx)
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o)
    arm = armature()[0]
    rename_bones(arm)
    tex_dir = os.path.join(os.path.dirname(os.path.dirname(fbx)), 'Textures')
    fix_textures(tex_dir, os.path.join(os.path.dirname(out), '_tex', os.path.splitext(os.path.basename(out))[0]))
    simplify_materials()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    export(out, anims=False)

def anims(out, items):
    reset()
    base = None
    for name, fbx in items:
        before = set(bpy.data.objects)
        acts_before = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=fbx, use_anim=True)
        new_objs = [o for o in bpy.data.objects if o not in before]
        arm = next(o for o in new_objs if o.type == 'ARMATURE')
        act = arm.animation_data.action
        act.name = name
        rename_action(act)
        for a in set(bpy.data.actions) - acts_before - {act}:
            bpy.data.actions.remove(a)
        if base is None:
            base = arm
            rename_bones(base)
            for o in new_objs:
                if o is not base:
                    bpy.data.objects.remove(o)
        else:
            for o in new_objs:
                bpy.data.objects.remove(o)
        # Stash on the base armature so the exporter writes every clip.
        track = base.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(act.frame_range[0]), act)
        act.use_fake_user = True
    base.animation_data.action = None
    export(out, anims=True)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if args[0] == 'avatar':
        avatar(args[1], args[2])
    else:
        anims(args[1], [a.split('=', 1) for a in args[2:]])
