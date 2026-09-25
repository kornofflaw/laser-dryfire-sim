using UnityEngine;

// TargetSpawner.cs
// ----------------
// Spawns shootable targets at random spots so there's always something to
// shoot. Keeps up to 'maxTargets' alive at once. If the prefab has a
// MovingTarget, each new target is handed its roaming bounds (this area).
//
// HOW TO USE:
//   1. Put this file in Assets/Scripts.
//   2. Make a target PREFAB: create a Quad (or Cube), add the Target script
//      (plus ScoringTarget for A/C/D zones, and MovingTarget if it should move),
//      make sure it has a Collider, then drag it into the Project window to turn
//      it into a prefab. Delete the one in the scene.
//   3. Create an empty GameObject named "TargetSpawner", attach this script,
//      and position it in front of the camera (targets spawn around it).
//   4. Drag your target prefab into the "Target Prefab" slot.
public class TargetSpawner : MonoBehaviour
{
    [Tooltip("Prefab to spawn. Must have a Target component and a Collider.")]
    public GameObject targetPrefab;

    [Tooltip("How many targets can be alive at once.")]
    public int maxTargets = 3;

    [Tooltip("Seconds between spawn attempts.")]
    public float spawnInterval = 1.0f;

    [Tooltip("Width (x) and height (y) of the area targets spawn within, " +
             "centered on this object.")]
    public Vector2 areaSize = new Vector2(8f, 4f);

    [Tooltip("Seconds before an un-shot target disappears. 0 = stays until shot.")]
    public float targetLifetime = 0f;

    private float timer;

    void Update()
    {
        timer += Time.deltaTime;
        if (timer >= spawnInterval && CountTargets() < maxTargets)
        {
            timer = 0f;
            SpawnOne();
        }
    }

    int CountTargets()
    {
        // Fine for small numbers of targets in a prototype.
        return FindObjectsOfType<Target>().Length;
    }

    void SpawnOne()
    {
        if (targetPrefab == null)
        {
            Debug.LogWarning("TargetSpawner: assign a Target Prefab in the Inspector.");
            return;
        }

        Vector3 pos = transform.position + new Vector3(
            Random.Range(-areaSize.x / 2f, areaSize.x / 2f),
            Random.Range(-areaSize.y / 2f, areaSize.y / 2f),
            0f);

        GameObject t = Instantiate(targetPrefab, pos, Quaternion.identity);

        // Moving targets roam inside this spawner's area.
        MovingTarget mover = t.GetComponent<MovingTarget>();
        if (mover != null)
            mover.Initialize(transform.position, areaSize);

        if (targetLifetime > 0f)
            Destroy(t, targetLifetime);
    }

    // Draws the spawn area in the Scene view so you can position it easily.
    void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.yellow;
        Gizmos.DrawWireCube(transform.position, new Vector3(areaSize.x, areaSize.y, 0.1f));
    }
}
