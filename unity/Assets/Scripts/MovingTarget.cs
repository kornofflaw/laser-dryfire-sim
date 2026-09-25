using UnityEngine;

// MovingTarget.cs
// ---------------
// Makes a target move. Put it on your target PREFAB alongside the Target
// component and its Collider. Movement is independent of scoring.
//
// PATTERNS:
//   PingPong - drifts and bounces inside the spawn area (stays on screen)
//   Crossing - flies straight across and leaves (reaction drills)
//   SineWave - travels sideways while weaving up and down
//
// The TargetSpawner gives each target its roaming bounds automatically.
[RequireComponent(typeof(Target))]
public class MovingTarget : MonoBehaviour
{
    public enum Pattern { PingPong, Crossing, SineWave }

    [Header("Movement")]
    public Pattern pattern = Pattern.PingPong;
    [Tooltip("Speed in world units per second.")]
    public float speed = 3f;
    [Tooltip("Pick a random direction on spawn (recommended).")]
    public bool randomDirection = true;
    [Tooltip("Used only when Random Direction is off.")]
    public Vector2 direction = Vector2.right;

    [Header("SineWave extras")]
    public float sineAmplitude = 1.0f;
    public float sineFrequency = 2.0f;

    private Vector3 vel;
    private float baseY;
    private float phase;
    private bool initialized;

    // Bounds, filled in by Initialize().
    private float left, right, bottom, top;

    // Called by TargetSpawner right after the target is created.
    public void Initialize(Vector3 areaCenter, Vector2 areaSize)
    {
        float halfW = areaSize.x / 2f;
        float halfH = areaSize.y / 2f;
        left = areaCenter.x - halfW;
        right = areaCenter.x + halfW;
        bottom = areaCenter.y - halfH;
        top = areaCenter.y + halfH;

        baseY = transform.position.y;
        phase = Random.value * Mathf.PI * 2f;

        switch (pattern)
        {
            case Pattern.PingPong:
                float angle = randomDirection
                    ? Random.Range(0f, Mathf.PI * 2f)
                    : Mathf.Atan2(direction.y, direction.x);
                vel = new Vector3(Mathf.Cos(angle), Mathf.Sin(angle), 0f) * speed;
                break;

            case Pattern.Crossing:
            case Pattern.SineWave:
                bool goingRight = randomDirection ? (Random.value < 0.5f) : direction.x >= 0f;
                vel = new Vector3(goingRight ? speed : -speed, 0f, 0f);
                if (pattern == Pattern.Crossing)
                {
                    // Start at the entering edge so it crosses the full width.
                    Vector3 p = transform.position;
                    p.x = goingRight ? left : right;
                    transform.position = p;
                }
                break;
        }

        initialized = true;
    }

    void Update()
    {
        // If placed by hand (no spawner), give it a default area around itself.
        if (!initialized)
            Initialize(transform.position, new Vector2(10f, 5f));

        Vector3 pos = transform.position;

        switch (pattern)
        {
            case Pattern.PingPong:
                pos += vel * Time.deltaTime;
                if (pos.x < left) { pos.x = left; vel.x = Mathf.Abs(vel.x); }
                else if (pos.x > right) { pos.x = right; vel.x = -Mathf.Abs(vel.x); }
                if (pos.y < bottom) { pos.y = bottom; vel.y = Mathf.Abs(vel.y); }
                else if (pos.y > top) { pos.y = top; vel.y = -Mathf.Abs(vel.y); }
                transform.position = pos;
                break;

            case Pattern.Crossing:
                pos += vel * Time.deltaTime;
                transform.position = pos;
                // Despawn once it leaves the area (a little past the edge).
                if (pos.x < left - 0.5f || pos.x > right + 0.5f)
                    Destroy(gameObject);
                break;

            case Pattern.SineWave:
                pos.x += vel.x * Time.deltaTime;
                phase += sineFrequency * Time.deltaTime;
                pos.y = Mathf.Clamp(baseY + Mathf.Sin(phase) * sineAmplitude, bottom, top);
                if (pos.x < left) { pos.x = left; vel.x = Mathf.Abs(vel.x); }
                else if (pos.x > right) { pos.x = right; vel.x = -Mathf.Abs(vel.x); }
                transform.position = pos;
                break;
        }
    }
}
