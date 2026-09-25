using System;
using UnityEngine;

// GameManager.cs  (timestamp-aware + zone scoring hook)
// ---------------------------------------------------------
// Fires a 'ShotFired' event whenever a shot is registered, so the ShotTimer
// (and anything else) can react without extra wiring. Attach to an empty
// GameObject named "GameManager".
//
// TIMESTAMPS:
//   * RegisterShot takes the Python-side detection timestamp (seconds from
//     perf_counter, monotonic; -1 means "not provided"). Splits are computed
//     from it when available (immune to Unity frame jitter); Time.time fallback.
//
// ZONE SCORING (Phase 2):
//   * RegisterScoredShot() is the single entry point for a scored shot. It
//     records the shot, adds the zone points, and raises 'ShotScored' for the
//     UI / logger / DrillRunner. Existing ShotFired subscribers are untouched.
public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    // Told about every shot. bool = hit a target; double = Python timestamp (-1 if absent).
    public event Action<bool, double> ShotFired;

    // Told about every scored shot (zone, points, where it landed). For UI/logging.
    public event Action<ShotScore> ShotScored;

    public int Score { get; private set; }
    public int Shots { get; private set; }
    public int Hits { get; private set; }
    public int Misses => Shots - Hits;
    public float Accuracy => Shots > 0 ? (float)Hits / Shots * 100f : 0f;

    public float SessionTime { get; private set; }
    public float LastSplit { get; private set; }

    private float lastShotTime = -1f;      // Unity clock, fallback split source
    private double lastShotPyTime = -1.0;  // Python detection clock (preferred)
    private bool sessionRunning;

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
    }

    void Update()
    {
        if (sessionRunning)
            SessionTime += Time.deltaTime;
    }

    // shotTimestamp defaults to -1 so any old caller that omits it still compiles
    // (and simply falls back to Unity-clock splits).
    public void RegisterShot(bool wasHit, double shotTimestamp = -1.0)
    {
        if (!sessionRunning) sessionRunning = true;

        Shots++;
        if (wasHit) Hits++;

        // Split between consecutive shots. Prefer the Python detection timestamps
        // (steady, no frame jitter); fall back to Unity's clock if absent.
        float now = Time.time;
        if (shotTimestamp >= 0.0 && lastShotPyTime >= 0.0)
            LastSplit = (float)(shotTimestamp - lastShotPyTime);
        else if (lastShotTime >= 0f)
            LastSplit = now - lastShotTime;

        lastShotTime = now;
        lastShotPyTime = shotTimestamp;

        // Notify any listeners (e.g. the ShotTimer).
        ShotFired?.Invoke(wasHit, shotTimestamp);
    }

    // One call from ShotReceiver for a shot that was scored against a target.
    // A Miss (score.zone == ShotZone.Miss) still counts as a shot, just no hit/points.
    public void RegisterScoredShot(ShotScore score, double shotTimestamp = -1.0)
    {
        RegisterShot(score.zone != ShotZone.Miss, shotTimestamp);
        if (score.points != 0) AddScore(score.points);
        ShotScored?.Invoke(score);
    }

    public void AddScore(int points) => Score += points;

    public void ResetSession()
    {
        Score = 0;
        Shots = 0;
        Hits = 0;
        SessionTime = 0f;
        LastSplit = 0f;
        lastShotTime = -1f;
        lastShotPyTime = -1.0;
        sessionRunning = false;
    }
}
