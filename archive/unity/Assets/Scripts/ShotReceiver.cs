using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;

// ShotReceiver.cs  (timestamps + zone scoring)
// ----------------------------------------------------------
// Listens for shots over UDP, raycasts them into the scene, plays feedback
// sounds, and drops a bullet-hole marker.
//
//   TIMESTAMPS: each packet may carry a 3rd field — the Python perf_counter()
//   detection time. It's parsed (2-OR-3 field, so old senders still work) and
//   passed through to the GameManager so splits use the steady Python clock.
//
//   ZONE SCORING: on a hit, if the target has a ScoringTarget it's scored A/C/D
//   from the hit point; otherwise it falls back to the target's flat 'points'.
//
// Attach to your Main Camera (which already has an AudioListener). An
// AudioSource is added automatically.
[RequireComponent(typeof(AudioSource))]
public class ShotReceiver : MonoBehaviour
{
    [Header("Network")]
    [Tooltip("Must match UDP_PORT in detector_config.py")]
    public int port = 5005;

    [Header("Aiming")]
    [Tooltip("Camera used to turn screen coords into a world ray. " +
             "Leave empty to auto-use this object's camera or Camera.main.")]
    public Camera shootingCamera;
    public float maxRange = 1000f;

    [Header("Bullet hole")]
    [Tooltip("Small prefab spawned at each impact. Should have NO Collider " +
             "(so new shots don't hit old holes) and a HitMarker component.")]
    public GameObject hitMarkerPrefab;

    [Header("Sound")]
    [Range(0f, 1f)] public float volume = 0.7f;
    public AudioClip shotSoundOverride;  // optional: your own gunshot
    public AudioClip hitSoundOverride;    // optional: your own hit "ding"

    private AudioSource audioSource;
    private AudioClip shotClip, hitClip;

    private UdpClient udpClient;
    private Thread receiveThread;
    private volatile bool running;

    // A received shot: normalized screen position + the Python-side detection
    // timestamp (seconds from perf_counter, monotonic). timestamp < 0 = not provided.
    private struct Shot
    {
        public Vector2 pos;
        public double timestamp;
        public Shot(Vector2 p, double t) { pos = p; timestamp = t; }
    }

    private readonly ConcurrentQueue<Shot> shotQueue = new ConcurrentQueue<Shot>();

    void Start()
    {
        if (shootingCamera == null)
            shootingCamera = GetComponent<Camera>() != null ? GetComponent<Camera>() : Camera.main;

        audioSource = GetComponent<AudioSource>();
        shotClip = shotSoundOverride != null ? shotSoundOverride : MakeShotSound();
        hitClip = hitSoundOverride != null ? hitSoundOverride : MakeHitSound();

        running = true;
        receiveThread = new Thread(ReceiveLoop) { IsBackground = true };
        receiveThread.Start();
        Debug.Log($"ShotReceiver listening on UDP port {port}");
    }

    void ReceiveLoop()
    {
        try
        {
            udpClient = new UdpClient(port);
            IPEndPoint remote = new IPEndPoint(IPAddress.Any, 0);
            while (running)
            {
                byte[] data = udpClient.Receive(ref remote);
                string text = Encoding.UTF8.GetString(data);
                string[] parts = text.Split(',');
                if (parts.Length >= 2 &&
                    float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out float x) &&
                    float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out float y))
                {
                    // Optional 3rd field = Python perf_counter() timestamp.
                    // Missing (old sender) -> -1, meaning "no timestamp".
                    double t = -1.0;
                    if (parts.Length >= 3)
                        double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out t);
                    shotQueue.Enqueue(new Shot(new Vector2(x, y), t));
                }
            }
        }
        catch (Exception e)
        {
            if (running) Debug.LogError("UDP receive error: " + e.Message);
        }
    }

    void Update()
    {
        while (shotQueue.TryDequeue(out Shot shot))
            ProcessShot(shot);
    }

    void ProcessShot(Shot shot)
    {
        Vector2 normalized = shot.pos;

        // Python sends (0,0)=top-left, (1,1)=bottom-right.
        // Unity viewport is (0,0)=bottom-left, so flip Y.
        Vector3 viewportPoint = new Vector3(normalized.x, 1f - normalized.y, 0f);
        Ray ray = shootingCamera.ViewportPointToRay(viewportPoint);

        bool wasHit = false;

        if (Physics.Raycast(ray, out RaycastHit hit, maxRange))
        {
            Target target = hit.collider.GetComponent<Target>();
            wasHit = target != null;  // hitting background/wall counts as a miss

            if (wasHit)
            {
                // Prefer zone scoring; fall back to the target's flat 'points'.
                ScoringTarget scorer = hit.collider.GetComponent<ScoringTarget>();
                if (scorer != null)
                {
                    ShotScore score = scorer.ScoreHit(hit.point, shot.timestamp);
                    if (GameManager.Instance != null)
                        GameManager.Instance.RegisterScoredShot(score, shot.timestamp);
                    Debug.Log($"HIT {score.zone} (+{score.points}): {hit.collider.name}");
                }
                else
                {
                    if (GameManager.Instance != null)
                    {
                        GameManager.Instance.RegisterShot(true, shot.timestamp);
                        GameManager.Instance.AddScore(target.points);
                    }
                    Debug.Log($"HIT (flat +{target.points}, no zones): {hit.collider.name}");
                }

                target.OnHit(hit.point);  // target's reaction (destroy / animate)
            }
            else
            {
                if (GameManager.Instance != null)
                    GameManager.Instance.RegisterScoredShot(
                        new ShotScore { zone = ShotZone.Miss, points = 0, timestamp = shot.timestamp },
                        shot.timestamp);
                Debug.Log("MISS (background)");
            }

            SpawnMarker(hit);  // bullet hole on whatever surface we hit
        }
        else
        {
            if (GameManager.Instance != null)
                GameManager.Instance.RegisterScoredShot(
                    new ShotScore { zone = ShotZone.Miss, points = 0, timestamp = shot.timestamp },
                    shot.timestamp);
            Debug.Log("MISS (off into space)");
        }

        // Feedback sounds.
        if (audioSource != null)
        {
            audioSource.PlayOneShot(shotClip, volume);          // every shot "reports"
            if (wasHit) audioSource.PlayOneShot(hitClip, volume); // plus a hit "ding"
        }
    }

    void SpawnMarker(RaycastHit hit)
    {
        if (hitMarkerPrefab == null) return;
        // Sit just off the surface (avoids z-fighting flicker) and face along
        // the surface normal so flat decals lie correctly.
        Vector3 pos = hit.point + hit.normal * 0.01f;
        Quaternion rot = Quaternion.LookRotation(hit.normal);
        Instantiate(hitMarkerPrefab, pos, rot);
    }

    // ---- procedural sounds (no audio files required) ----
    AudioClip MakeShotSound()
    {
        // Short burst of decaying noise -> a percussive "pop/click".
        int sr = 44100; float dur = 0.09f;
        int n = Mathf.Max(1, (int)(sr * dur));
        AudioClip clip = AudioClip.Create("shot", n, 1, sr, false);
        float[] data = new float[n];
        System.Random rng = new System.Random();
        for (int i = 0; i < n; i++)
        {
            float t = (float)i / sr;
            float decay = Mathf.Exp(-t * 45f);
            float noise = (float)(rng.NextDouble() * 2.0 - 1.0);
            data[i] = noise * decay * 0.8f;
        }
        clip.SetData(data, 0);
        return clip;
    }

    AudioClip MakeHitSound()
    {
        // Short decaying tone -> a clear hit "ding".
        int sr = 44100; float dur = 0.18f;
        int n = Mathf.Max(1, (int)(sr * dur));
        AudioClip clip = AudioClip.Create("hit", n, 1, sr, false);
        float[] data = new float[n];
        for (int i = 0; i < n; i++)
        {
            float t = (float)i / sr;
            float decay = Mathf.Exp(-t * 12f);
            data[i] = Mathf.Sin(2f * Mathf.PI * 1568f * t) * decay * 0.6f; // ~G6
        }
        clip.SetData(data, 0);
        return clip;
    }

    void OnDestroy() { Shutdown(); }
    void OnApplicationQuit() { Shutdown(); }

    void Shutdown()
    {
        running = false;
        udpClient?.Close();
        receiveThread?.Join(100);
    }
}
