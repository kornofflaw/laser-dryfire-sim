using System.Globalization;
using System.IO;
using UnityEngine;

// SessionLogger.cs
// ----------------
// Appends one row to a CSV file each time a timed run finishes, so you can
// track first-shot time and accuracy over weeks. Open the file in Excel,
// Numbers, or Google Sheets.
//
// HOW TO USE:
//   1. Put this file in Assets/Scripts.
//   2. Attach it to the "GameManager" GameObject (the same one with the
//      ShotTimer). It finds the ShotTimer automatically.
//   3. Play, do some timed runs, then check the Console: it prints the exact
//      file path. On a Mac that's inside
//      ~/Library/Application Support/<Company>/<Project>/
public class SessionLogger : MonoBehaviour
{
    public string fileName = "shooting_log.csv";

    private string path;
    private ShotTimer timer;

    void Start()
    {
        path = Path.Combine(Application.persistentDataPath, fileName);

        // Write the header row once, when the file is first created.
        if (!File.Exists(path))
            File.AppendAllText(path, "datetime,par_time,first_shot_s,shots,hits,accuracy_pct\n");

        Debug.Log("Session log file: " + path);

        timer = FindObjectOfType<ShotTimer>();
        if (timer != null)
            timer.RunCompleted += LogRun;
        else
            Debug.LogWarning("SessionLogger: no ShotTimer found in the scene.");
    }

    void OnDestroy()
    {
        if (timer != null)
            timer.RunCompleted -= LogRun;
    }

    void LogRun(ShotTimer.RunResult r)
    {
        var c = CultureInfo.InvariantCulture;

        string first = r.firstShotTime >= 0f ? r.firstShotTime.ToString("0.000", c) : "";
        float accuracy = r.shots > 0 ? (float)r.hits / r.shots * 100f : 0f;

        string line = string.Join(",",
            r.timestamp.ToString("yyyy-MM-dd HH:mm:ss"),
            r.parTime.ToString("0.00", c),
            first,
            r.shots.ToString(),
            r.hits.ToString(),
            accuracy.ToString("0.0", c));

        File.AppendAllText(path, line + "\n");
        Debug.Log("Logged run: " + line);
    }
}
