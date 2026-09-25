# 3D asset credits

Used by the 3D scenes (`web/js/knife3d.js`, `web/js/office3d.js`, `web/js/judge3d.js`, `web/js/range3d.js`).
Unless noted, files were taken from the three.js repository's examples
(github.com/mrdoob/three.js, `examples/models` and `examples/textures`).

| File | What | Source / licence |
| --- | --- | --- |
| `car.glb`, `car_shadow.png` | Parked cars (`ferrari.glb`, `ferrari_ao.png`) | "Ferrari 458 Italia" by vicent091036, CC BY 4.0, as distributed with three.js examples. |
| `people/*.glb` (m04 … bf01) | Realistic people for the judgment scenes, the knife attack and the office scenario: 12 avatars (Rocketbox `Male_Adult_04/05/06/09/12/17/18`, `Female_Adult_04/07/13`, `Business_Male_02`, `Business_Female_01`), converted by `tools/rocketbox_to_glb.py` (bones renamed, textures reduced to 1024 px) | Microsoft Rocketbox Avatar Library (github.com/microsoft/Microsoft-Rocketbox), MIT licence, © 2020 Microsoft. |
| `people/anims_m.glb`, `people/anims_f.glb` | Motion-captured idle, look around, nervous, angry, walk, run and phone-call clips for those avatars | Microsoft Rocketbox Avatar Library, MIT licence, © 2020 Microsoft. |
| `sky.hdr` | Dusk lighting and reflections (`venice_sunset_1k.hdr`) | Poly Haven (polyhaven.com), CC0. |
| `city.hdr` | Daytime city lighting for the office scene (`pedestrian_overpass_1k.hdr`) | Poly Haven (polyhaven.com), CC0. |
| `range/range.hdr` | Outdoor light and sky for the 3D range (`quarry_01_1k.hdr`) | Poly Haven (polyhaven.com), CC0. |
| `range/dirt_color.jpg` | Berm dirt (`dirt.jpg`); `dirt_normal.jpg` was derived from it (Sobel filter) | Babylon.js Assets (github.com/BabylonJS/Assets), CC BY 4.0. |
| `range/gravel_color.jpg`, `gravel_normal.jpg`, `gravel_rough.jpg` | Bay floor gravel (`rockyGround` PBR set; roughness taken from its metal/rough map) | Babylon.js Assets (github.com/BabylonJS/Assets), CC BY 4.0. |
| `range/wood_color.jpg`, `wood_rough.jpg`, `wood_bump.jpg` | Target stakes and stands (`hardwood2_*.jpg`) | three.js examples textures. |

three.js itself (`web/vendor/three`) is MIT licensed; see `web/vendor/three/LICENSE`.

Asphalt, paint wear, the store front and the knife are generated in code. On the 3D
range, the cardboard targets, bullet holes, grass tufts and brass are generated in code.
