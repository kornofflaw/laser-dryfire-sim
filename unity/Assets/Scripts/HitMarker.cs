using UnityEngine;

// HitMarker.cs
// ------------
// Goes on the bullet-hole prefab. The marker stays for 'lifetime' seconds,
// then shrinks away over 'fadeTime' and removes itself, so bullet holes
// don't pile up forever.
//
// HOW TO USE:
//   1. Put this file in Assets/Scripts.
//   2. Create a small marker object (a Sphere works well — looks the same
//      from any angle). Scale it small (e.g. 0.1, 0.1, 0.1).
//   3. REMOVE its Collider (so future shots don't hit old holes).
//   4. Give it a dark material if you like, add this HitMarker component,
//      then drag it into the Project window to make it a prefab and delete
//      the scene copy.
//   5. Drag that prefab into the ShotReceiver's "Hit Marker Prefab" slot.
public class HitMarker : MonoBehaviour
{
    [Tooltip("Seconds the marker stays at full size before fading.")]
    public float lifetime = 3f;

    [Tooltip("Seconds spent shrinking away at the end.")]
    public float fadeTime = 0.5f;

    private float age;
    private Vector3 startScale;

    void Start()
    {
        startScale = transform.localScale;
    }

    void Update()
    {
        age += Time.deltaTime;

        if (age >= lifetime)
        {
            Destroy(gameObject);
            return;
        }

        float remaining = lifetime - age;
        if (remaining < fadeTime)
            transform.localScale = startScale * (remaining / fadeTime);
    }
}
