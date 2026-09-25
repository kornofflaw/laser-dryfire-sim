using System;
using System.Collections;
using UnityEngine;

// ShotTimer.cs  (timestamp-aware splits)
// -------------------------------------------------------
// Range-style timer: random start delay -> start beep -> par beep. Run data is
// exposed through public properties so GameUI can read it.
// Attach to the "GameManager" GameObject.
//
// TIMESTAMPS:
//   * HandleShot receives the Python detection timestamp and uses it for the
//     shot-to-shot SPLIT, which removes Unity's frame-jitter from split times.
//   * firstShotTime (beep -> first shot) STAYS on Unity's clock: the start beep
//     is a Unity event, so it can't be compared to a Python timestamp without a
//     clock handshake. That's a separate, later problem.
//   * If a timestamp is missing (-1), splits fall back to Unity time automatically.
[RequireComponent(typeof(AudioSource))]
public class ShotTimer : MonoBehaviour
{
    public enum State { Idle, Delay, Running, Done }

    public struct RunResult
    {
        public DateTime timestamp;
        public float parTime;
        public float firstShotTime;  // -1 if no shot was fired
        public int shots;
        public int hits;
    }

    public event Action<RunResult> RunCompleted;

    [Header("Controls")]
    public KeyCode startKey = KeyCode.Space;

    [Header("Start delay (random buzzer wait)")]
    public bool randomDelay = true;
    public float minDelay = 1.5f;
    public float maxDelay = 4.0f;
    public float fixedDelay = 2.0f;

    [Header("Par time")]
    public float parTime = 5.0f;

    [Header("Beep sound")]
    public float startBeepHz = 1000f;
    public float parBeepHz = 700f;
    public float beepSeconds = 0.18f;
    [Range(0f, 1f)] public float volume = 0.6f;
    public AudioClip startClipOverride;
    public AudioClip parClipOverride;

    public State CurrentState { get; private set; } = State.Idle;

    // ---- read-only run data for the UI ----
    public float FirstShotTime => firstShotTime;
    public float LastSplit => lastSplit;
    public int ShotsThisRun => shotsThisRun;
    public int HitsThisRun => hitsThisRun;
    public float ParRemaining =>
        CurrentState == State.Running ? Mathf.Max(0f, parTime - (Time.time - runStartTime)) : 0f;

    private AudioSource audioSource;
    private AudioClip startClip, parClip;

    private float runStartTime;
    private float firstShotTime = -1f;
    private float lastShotRel;              // Unity clock, fallback split source
    private double lastShotPyTime = -1.0;   // Python detection clock (preferred)
    private float lastSplit;
    private int shotsThisRun;
    private int hitsThisRun;

    void Start()
    {
        audioSource = GetComponent<AudioSource>();
        startClip = startClipOverride != null ? startClipOverride : MakeBeep(startBeepHz);
        parClip = parClipOverride != null ? parClipOverride : MakeBeep(parBeepHz);

        if (GameManager.Instance != null)
            GameManager.Instance.ShotFired += HandleShot;
    }

    void OnDestroy()
    {
        if (GameManager.Instance != null)
            GameManager.Instance.ShotFired -= HandleShot;
    }

    void Update()
    {
        if (Input.GetKeyDown(startKey) &&
            (CurrentState == State.Idle || CurrentState == State.Done))
        {
            StopAllCoroutines();
            StartCoroutine(RunRoutine());
        }

        if (CurrentState == State.Running && (Time.time - runStartTime) >= parTime)
        {
            audioSource.PlayOneShot(parClip, volume);
            CurrentState = State.Done;

            RunCompleted?.Invoke(new RunResult
            {
                timestamp = DateTime.Now,
                parTime = parTime,
                firstShotTime = firstShotTime,
                shots = shotsThisRun,
                hits = hitsThisRun
            });
        }
    }

    IEnumerator RunRoutine()
    {
        firstShotTime = -1f;
        lastShotRel = 0f;
        lastShotPyTime = -1.0;
        lastSplit = 0f;
        shotsThisRun = 0;
        hitsThisRun = 0;

        CurrentState = State.Delay;
        float delay = randomDelay ? UnityEngine.Random.Range(minDelay, maxDelay) : fixedDelay;
        yield return new WaitForSeconds(delay);

        audioSource.PlayOneShot(startClip, volume);
        runStartTime = Time.time;
        CurrentState = State.Running;
    }

    // wasHit = did the shot land on a target; pyTime = Python detection timestamp
    // (seconds, monotonic; -1 if not provided).
    void HandleShot(bool wasHit, double pyTime)
    {
        if (CurrentState != State.Running) return;

        float t = Time.time - runStartTime;   // Unity clock: time from the start beep
        shotsThisRun++;
        if (wasHit) hitsThisRun++;

        if (firstShotTime < 0f)
        {
            firstShotTime = t;   // first shot measured from the beep (Unity clock)
        }
        else
        {
            // Split = gap between consecutive shots. Prefer the Python detection
            // timestamps (no Unity frame jitter); fall back to Unity time if absent.
            if (pyTime >= 0.0 && lastShotPyTime >= 0.0)
                lastSplit = (float)(pyTime - lastShotPyTime);
            else
                lastSplit = t - lastShotRel;
        }

        lastShotRel = t;
        lastShotPyTime = pyTime;
    }

    AudioClip MakeBeep(float frequency)
    {
        int sampleRate = 44100;
        int samples = Mathf.Max(1, (int)(sampleRate * beepSeconds));
        AudioClip clip = AudioClip.Create("beep", samples, 1, sampleRate, false);

        float[] data = new float[samples];
        int fade = Mathf.Max(1, sampleRate / 1000);
        for (int i = 0; i < samples; i++)
        {
            float t = (float)i / sampleRate;
            float env = 1f;
            if (i < fade) env = (float)i / fade;
            else if (i > samples - fade) env = (float)(samples - i) / fade;
            data[i] = Mathf.Sin(2f * Mathf.PI * frequency * t) * env;
        }
        clip.SetData(data, 0);
        return clip;
    }
}
