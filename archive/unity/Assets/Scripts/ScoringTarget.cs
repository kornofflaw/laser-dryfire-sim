using UnityEngine;

// ScoringTarget.cs  (A/C/D zones + optional HEAD zone)
// ---------------------------------------------------------------------------
// Turns a raycast HIT POINT into a score, USPSA-style. Body is scored A/C/D as
// nested rectangles; an optional HEAD zone (a rectangle near the top of the
// face) unlocks the Mozambique / failure drill (2 body + 1 head).
//
// HOW IT WORKS (no extra colliders, minimal wiring):
//   * ShotReceiver raycasts and gets a world-space hit point.
//   * This converts it into the target's LOCAL space (rotation/scale-safe) and
//     classifies it. The head is checked FIRST, so it wins where it overlaps
//     the body rectangles.
//
// SETUP:
//   * Add to each target GameObject (the one with the collider). Select it in
//     the Scene view to SEE the zones: red = A, yellow = C, white = face,
//     blue = head (when enabled).
//   * Leave 'hasHeadZone' off for plain targets; turn it on for a Mozambique
//     target so head hits are distinguished from body hits.
//   * Unity Quad: the local half-size defaults (0.5) are correct at ANY scale.
public enum ShotZone { Miss, A, C, D, Head }

public struct ShotScore
{
    public ShotZone zone;
    public int points;
    public Vector2 normalizedHit;  // where it landed, -1..1 across the target face
    public double timestamp;       // Python detection time, passed through for logging
}

public class ScoringTarget : MonoBehaviour
{
    [Header("Target face size in LOCAL units (Unity Quad = 0.5)")]
    public float localHalfWidth = 0.5f;
    public float localHalfHeight = 0.5f;

    [Header("Body zone extents (fraction of half-size, 0..1)")]
    [Range(0f, 1f)] public float aZoneHalfWidth = 0.30f;
    [Range(0f, 1f)] public float aZoneHalfHeight = 0.55f;
    [Range(0f, 1f)] public float cZoneHalfWidth = 0.65f;
    [Range(0f, 1f)] public float cZoneHalfHeight = 0.90f;
    // D zone = anything inside the face but outside the C rectangle (and not head).

    [Header("Head zone (optional — enables Mozambique)")]
    public bool hasHeadZone = false;
    [Range(0f, 1f)] public float headHalfWidth = 0.28f;
    [Range(-1f, 1f)] public float headBottom = 0.60f;   // ny where the head starts
    [Range(-1f, 1f)] public float headTop = 1.00f;      // ny where the head ends

    [Header("Points per zone")]
    public int aPoints = 5;
    public int cPoints = 3;
    public int dPoints = 1;
    public int headPoints = 5;

    // Pure classification — no side effects, easy to reason about/test.
    // Pass the world-space point your raycast returned (hit.point).
    public ShotScore ScoreHit(Vector3 worldPoint, double timestamp = -1.0)
    {
        // Into the target's own space (divides out position, rotation, AND scale).
        Vector3 local = transform.InverseTransformPoint(worldPoint);

        // Normalize to -1..1 across the face.
        float nx = Mathf.Abs(localHalfWidth)  > 1e-6f ? local.x / localHalfWidth  : 0f;
        float ny = Mathf.Abs(localHalfHeight) > 1e-6f ? local.y / localHalfHeight : 0f;

        ShotZone zone;
        // Head first, so it takes priority in the region where it overlaps body C.
        if (hasHeadZone && Mathf.Abs(nx) <= headHalfWidth && ny >= headBottom && ny <= headTop)
            zone = ShotZone.Head;
        else if (Mathf.Abs(nx) <= aZoneHalfWidth && Mathf.Abs(ny) <= aZoneHalfHeight)
            zone = ShotZone.A;
        else if (Mathf.Abs(nx) <= cZoneHalfWidth && Mathf.Abs(ny) <= cZoneHalfHeight)
            zone = ShotZone.C;
        else
            zone = ShotZone.D;

        int pts = zone == ShotZone.Head ? headPoints
                : zone == ShotZone.A ? aPoints
                : zone == ShotZone.C ? cPoints
                : dPoints;

        return new ShotScore
        {
            zone = zone,
            points = pts,
            normalizedHit = new Vector2(nx, ny),
            timestamp = timestamp
        };
    }

    // Draw the zones in the Scene view when the target is selected, so you can
    // eyeball and tune them against your projected target art.
    void OnDrawGizmosSelected()
    {
        Gizmos.matrix = transform.localToWorldMatrix;

        Gizmos.color = new Color(1f, 0.2f, 0.2f);   // A = red
        Gizmos.DrawWireCube(Vector3.zero,
            new Vector3(2f * localHalfWidth * aZoneHalfWidth,
                        2f * localHalfHeight * aZoneHalfHeight, 0f));

        Gizmos.color = new Color(1f, 0.85f, 0.2f);  // C = yellow
        Gizmos.DrawWireCube(Vector3.zero,
            new Vector3(2f * localHalfWidth * cZoneHalfWidth,
                        2f * localHalfHeight * cZoneHalfHeight, 0f));

        Gizmos.color = Color.white;                  // face = D outer bound
        Gizmos.DrawWireCube(Vector3.zero,
            new Vector3(2f * localHalfWidth, 2f * localHalfHeight, 0f));

        if (hasHeadZone)                             // head = blue
        {
            Gizmos.color = new Color(0.4f, 0.8f, 1f);
            float cy = (headBottom + headTop) * 0.5f * localHalfHeight;
            float w = 2f * localHalfWidth * headHalfWidth;
            float h = Mathf.Abs(headTop - headBottom) * localHalfHeight;
            Gizmos.DrawWireCube(new Vector3(0f, cy, 0f), new Vector3(w, h, 0f));
        }
    }
}
