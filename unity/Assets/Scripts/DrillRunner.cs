using System;
using System.Collections.Generic;
using UnityEngine;

// DrillRunner.cs  (per-region scoring + Mozambique)
// ---------------------------------------------------------------------------
// Runs structured drills on top of your existing pieces. It reuses ShotTimer as
// the buzzer/clock and reads GameManager's ShotScored event to follow the
// course of fire and score it by zone.
//
// A drill ends after its required number of rounds. Optional per-region "pass
// criteria" (min A / body / head hits) let it judge PASS/FAIL as well as time:
//   * Bill Drill / par strings: no criteria -> "passed" just means made par.
//   * Mozambique: 3 rounds, needs >=2 body and >=1 head (needs a target whose
//     ScoringTarget has 'hasHeadZone' enabled).
//
// SETUP:
//   * Add to the "GameManager" GameObject (next to ShotTimer). Finds it itself.
//   * Targets need a ScoringTarget. Misses count as rounds fired (zone = Miss).
//   * Tab cycles drills while idle; Space (ShotTimer) starts a run.
public class DrillRunner : MonoBehaviour
{
    [Serializable]
    public class DrillDef
    {
        public string name = "Bill Drill";
        [Tooltip("Rounds to fire to complete the drill.")]
        public int requiredShots = 6;
        [Tooltip("Goal time from the beep to the last shot (seconds).")]
        public float parTime = 2.0f;

        [Tooltip("Min A-zone hits to pass (0 = not required).")]
        public int minAHits = 0;
        [Tooltip("Min body hits A/C/D to pass (0 = not required).")]
        public int minBodyHits = 0;
        [Tooltip("Min head hits to pass (0 = not required; needs a head zone).")]
        public int minHeadHits = 0;
    }

    public struct DrillResult
    {
        public string name;
        public int requiredShots;
        public float time;       // beep -> last shot (seconds)
        public int points;       // sum of zone points
        public int aCount;       // A-zone hits
        public int bodyCount;    // A/C/D hits
        public int headCount;    // head hits
        public float hitFactor;  // points / time (USPSA metric)
        public bool madePar;     // time <= parTime
        public bool passedCriteria;  // per-region minimums met
        public bool passed;      // criteria AND par
        public bool hasCriteria; // does this drill define hit criteria?
    }

    [Header("Controls")]
    [Tooltip("Cycle to the next drill (only while idle).")]
    public KeyCode cycleKey = KeyCode.Tab;

    [Header("Drills (leave empty to use the built-in defaults)")]
    public List<DrillDef> drills = new List<DrillDef>();

    public event Action<DrillResult> DrillCompleted;

    // ---- read-only state for the UI ----
    public string CurrentDrillName => Current != null ? Current.name : "—";
    public int RequiredShots => Current != null ? Current.requiredShots : 0;
    public float ParTime => Current != null ? Current.parTime : 0f;
    public bool CurrentUsesCriteria =>
        Current != null && (Current.minAHits > 0 || Current.minBodyHits > 0 || Current.minHeadHits > 0);
    public bool InProgress => attemptActive;
    public int ShotsCollected => shotsCollected;
    public int PointsCollected => pointsCollected;
    public int ACount => aCount;
    public int BodyCount => bodyCount;
    public int HeadCount => headCount;
    public bool HasResult => hasResult;
    public DrillResult LastResult { get; private set; }

    private ShotTimer timer;
    private int currentIndex;
    private bool attemptActive;
    private bool completed;
    private bool wasRunning;
    private bool hasResult;

    private float startTime;
    private int shotsCollected;
    private int pointsCollected;
    private int aCount;
    private int bodyCount;
    private int headCount;

    private DrillDef Current =>
        (drills != null && drills.Count > 0)
            ? drills[Mathf.Clamp(currentIndex, 0, drills.Count - 1)]
            : null;

    void Start()
    {
        timer = FindObjectOfType<ShotTimer>();

        if (drills == null || drills.Count == 0)
            drills = DefaultDrills();

        if (GameManager.Instance != null)
            GameManager.Instance.ShotScored += OnShotScored;
    }

    void OnDestroy()
    {
        if (GameManager.Instance != null)
            GameManager.Instance.ShotScored -= OnShotScored;
    }

    void Update()
    {
        // Cycle drills only when nothing is running, so you can't swap mid-attempt.
        if (Input.GetKeyDown(cycleKey) && !attemptActive && drills.Count > 0)
            currentIndex = (currentIndex + 1) % drills.Count;

        // Start an attempt the moment the ShotTimer's beep fires (enters Running).
        if (timer != null)
        {
            bool running = timer.CurrentState == ShotTimer.State.Running;
            if (running && !wasRunning) BeginAttempt();
            wasRunning = running;
        }
    }

    void BeginAttempt()
    {
        attemptActive = true;
        completed = false;
        startTime = Time.time;
        shotsCollected = 0;
        pointsCollected = 0;
        aCount = 0;
        bodyCount = 0;
        headCount = 0;
    }

    void OnShotScored(ShotScore s)
    {
        if (!attemptActive || completed) return;

        shotsCollected++;
        pointsCollected += s.points;
        switch (s.zone)
        {
            case ShotZone.Head: headCount++; break;
            case ShotZone.A: aCount++; bodyCount++; break;
            case ShotZone.C:
            case ShotZone.D: bodyCount++; break;
            // Miss: counts as a round fired, but no hit.
        }

        if (Current != null && shotsCollected >= Current.requiredShots)
            CompleteAttempt();
    }

    void CompleteAttempt()
    {
        completed = true;
        attemptActive = false;

        float time = Time.time - startTime;
        bool hasCriteria = Current.minAHits > 0 || Current.minBodyHits > 0 || Current.minHeadHits > 0;
        bool hitsPassed = aCount >= Current.minAHits
                       && bodyCount >= Current.minBodyHits
                       && headCount >= Current.minHeadHits;
        bool madePar = time <= Current.parTime;

        var result = new DrillResult
        {
            name = Current.name,
            requiredShots = Current.requiredShots,
            time = time,
            points = pointsCollected,
            aCount = aCount,
            bodyCount = bodyCount,
            headCount = headCount,
            hitFactor = time > 0.0001f ? pointsCollected / time : 0f,
            madePar = madePar,
            passedCriteria = hitsPassed,
            passed = hitsPassed && madePar,
            hasCriteria = hasCriteria
        };

        LastResult = result;
        hasResult = true;
        DrillCompleted?.Invoke(result);
    }

    List<DrillDef> DefaultDrills() => new List<DrillDef>
    {
        new DrillDef { name = "Bill Drill",     requiredShots = 6, parTime = 2.0f },
        new DrillDef { name = "Mozambique",     requiredShots = 3, parTime = 2.5f, minBodyHits = 2, minHeadHits = 1 },
        new DrillDef { name = "Par String (5)", requiredShots = 5, parTime = 3.0f },
    };
}
