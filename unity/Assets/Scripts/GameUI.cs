using TMPro;
using UnityEngine;
using UnityEngine.UI;

// GameUI.cs  (stats + shot timer + DRILL panel with body/head counts + PASS/FAIL)
// ---------
// Builds a Canvas + TextMeshPro UI in code (nothing to wire up) and updates it
// every frame.
//
// REQUIRES (one time): Window > TextMeshPro > Import TMP Essential Resources.
//
// HOW TO USE:
//   1. Put this file in Assets/Scripts.
//   2. On the "GameManager" GameObject: keep GameManager, ShotTimer,
//      SessionLogger, and DrillRunner, then ADD this GameUI component.
//   3. Play. Stats top-left, shot timer top-right, DRILL bottom-left.
//      R resets stats, Space starts a run, Tab cycles drills (while idle).
public class GameUI : MonoBehaviour
{
    public KeyCode resetKey = KeyCode.R;
    public int fontSize = 30;

    private TMP_Text statsText;
    private TMP_Text timerText;
    private TMP_Text drillText;
    private ShotTimer timer;
    private DrillRunner drill;

    void Start()
    {
        timer = FindObjectOfType<ShotTimer>();
        drill = FindObjectOfType<DrillRunner>();
        BuildUI();
    }

    void BuildUI()
    {
        // ---- Canvas (scales with screen so it stays crisp on the projector) ----
        var canvasGO = new GameObject("GameCanvas");
        var canvas = canvasGO.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;

        var scaler = canvasGO.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;

        canvasGO.AddComponent<GraphicRaycaster>();

        // Stats panel: top-LEFT.
        statsText = CreatePanel(canvas.transform, "StatsPanel",
            anchor: new Vector2(0f, 1f),
            anchoredPos: new Vector2(30f, -30f),
            size: new Vector2(440f, 250f));

        // Timer panel: top-RIGHT.
        timerText = CreatePanel(canvas.transform, "TimerPanel",
            anchor: new Vector2(1f, 1f),
            anchoredPos: new Vector2(-30f, -30f),
            size: new Vector2(470f, 300f));

        // Drill panel: bottom-LEFT.
        drillText = CreatePanel(canvas.transform, "DrillPanel",
            anchor: new Vector2(0f, 0f),
            anchoredPos: new Vector2(30f, 30f),
            size: new Vector2(490f, 250f));
    }

    TMP_Text CreatePanel(Transform parent, string name, Vector2 anchor, Vector2 anchoredPos, Vector2 size)
    {
        // Background panel
        var panel = new GameObject(name, typeof(RectTransform), typeof(Image));
        panel.transform.SetParent(parent, false);

        var rt = panel.GetComponent<RectTransform>();
        rt.anchorMin = anchor;
        rt.anchorMax = anchor;
        rt.pivot = anchor;
        rt.sizeDelta = size;
        rt.anchoredPosition = anchoredPos;

        var img = panel.GetComponent<Image>();
        img.color = new Color(0f, 0f, 0f, 0.55f);
        var rounded = Resources.GetBuiltinResource<Sprite>("UI/Skin/Background.psd");
        if (rounded != null) { img.sprite = rounded; img.type = Image.Type.Sliced; }

        // Text inside, with padding
        var textGO = new GameObject("Text", typeof(RectTransform));
        textGO.transform.SetParent(panel.transform, false);
        var trt = textGO.GetComponent<RectTransform>();
        trt.anchorMin = Vector2.zero;
        trt.anchorMax = Vector2.one;
        trt.offsetMin = new Vector2(22f, 18f);
        trt.offsetMax = new Vector2(-22f, -18f);

        var tmp = textGO.AddComponent<TextMeshProUGUI>();
        tmp.alignment = TextAlignmentOptions.TopLeft;
        tmp.fontSize = fontSize;
        tmp.color = Color.white;
        tmp.lineSpacing = 6f;
        return tmp;
    }

    void Update()
    {
        if (Input.GetKeyDown(resetKey) && GameManager.Instance != null)
            GameManager.Instance.ResetSession();

        var gm = GameManager.Instance;
        if (gm != null && statsText != null)
        {
            statsText.text =
                "<b>SESSION</b>\n" +
                $"Score: {gm.Score}\n" +
                $"Hits: {gm.Hits} / {gm.Shots}\n" +
                $"Accuracy: {gm.Accuracy:0.0}%\n" +
                $"Time: {gm.SessionTime:0.0}s\n" +
                $"<size=70%><color=#bbbbbb>[{resetKey}] reset</color></size>";
        }

        if (timer != null && timerText != null)
            timerText.text = BuildTimerText(timer);

        if (drill != null && drillText != null)
            drillText.text = BuildDrillText(drill);
    }

    string BuildTimerText(ShotTimer t)
    {
        string head = "<b>SHOT TIMER</b>\n";
        switch (t.CurrentState)
        {
            case ShotTimer.State.Idle:
                return head +
                    $"Press [{t.startKey}] to start\n" +
                    $"Par: {t.parTime:0.0}s";

            case ShotTimer.State.Delay:
                return head +
                    "<color=#ffd34d><b>STAND BY...</b></color>\n" +
                    "wait for the beep";

            case ShotTimer.State.Running:
                return head +
                    "<color=#7CFC00><b>GO!</b></color>\n" +
                    $"Par in: {t.ParRemaining:0.00}s\n" +
                    (t.FirstShotTime < 0f ? "First shot: --\n" : $"First shot: {t.FirstShotTime:0.00}s\n") +
                    $"Split: {t.LastSplit:0.00}s\n" +
                    $"Shots: {t.ShotsThisRun}   Hits: {t.HitsThisRun}";

            case ShotTimer.State.Done:
                return head +
                    "<b>DONE</b>\n" +
                    (t.FirstShotTime < 0f ? "First shot: --\n" : $"First shot: {t.FirstShotTime:0.00}s\n") +
                    $"Shots: {t.ShotsThisRun}   Hits: {t.HitsThisRun}\n" +
                    $"<size=70%><color=#bbbbbb>[{t.startKey}] run again</color></size>";
        }
        return head;
    }

    string BuildDrillText(DrillRunner d)
    {
        string head = "<b>DRILL</b>\n";
        string footer =
            $"<size=70%><color=#bbbbbb>[{d.cycleKey}] change drill  ·  " +
            $"[{(timer != null ? timer.startKey : KeyCode.Space)}] run</color></size>";

        if (d.InProgress)
        {
            string counts = d.CurrentUsesCriteria
                ? $"Body: {d.BodyCount}   Head: {d.HeadCount}"
                : $"Points: {d.PointsCollected}   A: {d.ACount}";
            return head +
                $"<color=#7CFC00><b>{d.CurrentDrillName}</b></color>\n" +
                $"Shots: {d.ShotsCollected} / {d.RequiredShots}\n" +
                counts;
        }

        if (d.HasResult)
        {
            var r = d.LastResult;
            string parTag = r.madePar
                ? "<color=#7CFC00>made par</color>"
                : "<color=#ff6b6b>over par</color>";

            if (r.hasCriteria)
            {
                string passTag = r.passed
                    ? "<color=#7CFC00><b>PASS</b></color>"
                    : "<color=#ff6b6b><b>FAIL</b></color>";
                return head +
                    $"<b>{r.name}</b> — {passTag}\n" +
                    $"Time: {r.time:0.00}s   {parTag}\n" +
                    $"Body: {r.bodyCount}   Head: {r.headCount}   A: {r.aCount}\n" +
                    footer;
            }

            return head +
                $"<b>{r.name}</b> — done\n" +
                $"Time: {r.time:0.00}s   {parTag}\n" +
                $"Points: {r.points}   A: {r.aCount}/{r.requiredShots}\n" +
                $"Hit factor: {r.hitFactor:0.00}\n" +
                footer;
        }

        return head +
            $"{d.CurrentDrillName}\n" +
            $"{d.RequiredShots} rounds  ·  par {d.ParTime:0.0}s\n" +
            footer;
    }
}
