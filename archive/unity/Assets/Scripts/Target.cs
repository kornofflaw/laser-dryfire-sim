using UnityEngine;

// Target.cs  (scoring lives in ShotReceiver)
// ----------------------------------------------------
// Put this on any object you want to be shootable. The object ALSO needs a
// Collider. For A/C/D zone scoring, add a ScoringTarget component too.
//
// OnHit does NOT add score. Scoring happens in ShotReceiver — zone-based when a
// ScoringTarget is present, or the flat 'points' below as a fallback. That keeps
// a single scoring path and avoids double-counting. OnHit is purely the target's
// REACTION to being hit.
public class Target : MonoBehaviour
{
    [Tooltip("Fallback points if this target has NO ScoringTarget component. " +
             "Ignored once zones are set up.")]
    public int points = 10;

    // Called by ShotReceiver when a shot lands on this object.
    public void OnHit(Vector3 hitPoint)
    {
        // Starter behavior: remove the target when hit. Replace with a
        // sound, hit splash, animation, respawn, etc.
        Destroy(gameObject);
    }
}
