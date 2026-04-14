"use client";

import { useState, useCallback } from "react";

type ScheduleRow = {
  team: string;
  conference: string;
  rank: number;
  weeks: string[];
  homeGames: number;
  awayGames: number;
  oocGames: number;
  totalGames: number;
  totalSoS: number;
};

type ScheduleResult = {
  schedule: ScheduleRow[];
  stats: {
    avgSoS: number;
    stdDev: number;
    spread: number;
    week0Games: number;
    totalOOCGames: number;
  };
};

// Compress image to max 1200px width, JPEG quality 0.7 (~50-100KB each)
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob || new Blob()),
        "image/jpeg",
        0.7
      );
    };
    img.src = URL.createObjectURL(file);
  });
}

export default function Home() {
  const [rankings, setRankings] = useState("");
  const [conferencesUser, setConferencesUser] = useState("");
  const [conferencesFiller, setConferencesFiller] = useState("");
  const [rivalries, setRivalries] = useState("");
  const [additionalLocks, setAdditionalLocks] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"youtube" | "screenshots">("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [error, setError] = useState("");

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "https://enterprise.tail3be075.ts.net";

  const handleScreenshotDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    setScreenshots((prev) => [...prev, ...files]);
  }, []);

  const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setScreenshots((prev) => [...prev, ...files]);
    }
  };

  const handleSubmit = async () => {
    if (!rankings.trim()) {
      setError("Please enter team rankings");
      return;
    }
    if (scheduleMode === "youtube" && !youtubeUrl.trim()) {
      setError("Please enter a YouTube URL");
      return;
    }
    if (scheduleMode === "screenshots" && screenshots.length === 0) {
      setError("Please upload schedule screenshots");
      return;
    }
    if (!conferencesUser.trim()) {
      setError("Please enter user team conferences");
      return;
    }
    if (!conferencesFiller.trim()) {
      setError("Please enter filler team conferences");
      return;
    }

    setError("");
    setLoading(true);
    setProgress(0);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("rankings", rankings);
      formData.append("conferences_user", conferencesUser);
      formData.append("conferences_filler", conferencesFiller);
      formData.append("rivalries", rivalries);
      formData.append("additional_locks", additionalLocks);

      if (scheduleMode === "youtube") {
        setStatus("Sending YouTube URL to server...");
        setProgress(10);
        formData.append("youtube_url", youtubeUrl);
      } else {
        // Compress images
        setStatus("Compressing screenshots...");
        const compressed: Blob[] = [];
        for (let i = 0; i < screenshots.length; i++) {
          const blob = await compressImage(screenshots[i]);
          compressed.push(blob);
          setProgress(Math.round(((i + 1) / screenshots.length) * 40));
        }
        setStatus("Uploading to server...");
        setProgress(45);
        compressed.forEach((blob, i) => {
          formData.append(
            "screenshots",
          blob,
          screenshots[i].name || `screenshot_${i}.jpg`
        );
        });
      }

      // Send to server
      setStatus(scheduleMode === "youtube"
        ? "Processing video (downloading, extracting frames, OCR — this may take 5-10 minutes)..."
        : "Processing screenshots with OCR (this may take a few minutes)...");
      setProgress(50);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600000); // 10 min timeout

      const response = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errMsg = `Server error (${response.status})`;
        try {
          const err = await response.json();
          errMsg = err.detail || errMsg;
        } catch {
          // ignore parse errors
        }
        throw new Error(errMsg);
      }

      setStatus("Schedule generated!");
      setProgress(100);
      const data = await response.json();
      setResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. The server may still be processing.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!result) return;
    const headers = [
      "Team",
      "Conference",
      "Rank",
      ...Array.from({ length: 14 }, (_, i) => `Week ${i}`),
      "Home",
      "Away",
      "OOC",
      "Total",
      "SoS",
    ];
    const rows = result.schedule.map((r) => [
      r.team,
      r.conference,
      r.rank,
      ...r.weeks,
      r.homeGames,
      r.awayGames,
      r.oocGames,
      r.totalGames,
      r.totalSoS.toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cfb_schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">
          CFB Schedule Generator
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Generate balanced non-conference schedules for EA Sports College
          Football 26
        </p>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!result ? (
          <div className="space-y-8">
            {/* Rankings */}
            <section>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Team Rankings
                <span className="text-zinc-500 ml-2 font-normal">
                  (paste one team per line, #1 first)
                </span>
              </label>
              <textarea
                className="w-full h-48 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder={`Oklahoma\nOhio State\nOregon\nClemson\n...`}
                value={rankings}
                onChange={(e) => setRankings(e.target.value)}
              />
            </section>

            {/* Conferences — User Teams */}
            <section>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Conferences &mdash; User Teams
              </label>
              <textarea
                className="w-full h-48 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder={`SEC: Oklahoma, Texas, Auburn, SMU\nBig 12: Ohio State, Colorado, Arkansas, North Carolina\nBig Ten: Oregon, Maryland, UCLA, Nebraska, Ole Miss\nACC: Clemson, Indiana, Tennessee, USC\nPac-12: Texas A&M, LSU, Texas Tech, TCU\nCUSA: Alabama, Georgia, Penn State, Florida\nAAC: Notre Dame, Miami, South Carolina, Michigan`}
                value={conferencesUser}
                onChange={(e) => setConferencesUser(e.target.value)}
              />
            </section>

            {/* Conferences — Filler Teams */}
            <section>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Conferences &mdash; Filler Teams
              </label>
              <textarea
                className="w-full h-48 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder={`SEC: Washington St., Wisconsin, Virginia Tech, Cincinnati\nBig 12: Missouri, Louisville, California, Oklahoma State\nBig Ten: Rutgers, NC State, BYU\nACC: Arizona State, Pittsburgh, Baylor, Vanderbilt\nPac-12: Kansas, Kentucky, Florida State, Mississippi St.\nCUSA: Utah, Illinois, Arizona, Oregon State\nAAC: Washington, Iowa, Iowa State, Kansas State`}
                value={conferencesFiller}
                onChange={(e) => setConferencesFiller(e.target.value)}
              />
            </section>

            {/* Additional Protected Rivalries */}
            <section>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Additional Protected Rivalries
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                (one per line, e.g. Michigan vs Ohio State)
              </p>
              <textarea
                className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder={`Oklahoma vs Texas\nAuburn vs Alabama\nClemson vs South Carolina\nOhio State vs Michigan`}
                value={rivalries}
                onChange={(e) => setRivalries(e.target.value)}
              />
            </section>

            {/* Additional Locked Games */}
            <section>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Additional Locked Games
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                (games locked in-game that aren&apos;t conference or rivalry)
              </p>
              <textarea
                className="w-full h-24 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder={`South Carolina vs Kentucky W5\nOklahoma @ Georgia Tech W8`}
                value={additionalLocks}
                onChange={(e) => setAdditionalLocks(e.target.value)}
              />
            </section>

            {/* Schedule Data Input */}
            <section>
              <div className="flex items-center gap-4 mb-2">
                <label className="block text-sm font-medium text-zinc-300">
                  Schedule Data
                </label>
                <div className="flex gap-2 text-xs">
                  <button
                    className={`px-3 py-1 rounded-full border ${
                      scheduleMode === "youtube"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                    }`}
                    onClick={() => setScheduleMode("youtube")}
                  >
                    YouTube Video
                  </button>
                  <button
                    className={`px-3 py-1 rounded-full border ${
                      scheduleMode === "screenshots"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                    }`}
                    onClick={() => setScheduleMode("screenshots")}
                  >
                    Screenshots
                  </button>
                </div>
              </div>

              {scheduleMode === "youtube" ? (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">
                    Stream your PS5 to YouTube while scrolling through each team&apos;s Custom Schedule (~5-10 sec per team). Paste the video link below.
                  </p>
                  <input
                    type="text"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">
                    Upload 2 screenshots per team (top half + bottom half of schedule)
                  </p>
                  <div
                    className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center transition-colors hover:border-zinc-500"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleScreenshotDrop}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      id="screenshot-upload"
                      onChange={handleScreenshotSelect}
                    />
                    <label
                      htmlFor="screenshot-upload"
                      className="cursor-pointer space-y-2"
                    >
                      <div className="text-3xl">&#128247;</div>
                      <p className="text-zinc-400">
                        Drag & drop screenshots here, or click to browse
                      </p>
                    </label>
                  </div>
                  {screenshots.length > 0 && (
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-sm text-zinc-400">
                        {screenshots.length} files selected (
                        {Math.floor(screenshots.length / 2)} teams)
                      </p>
                      <button
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() => setScreenshots([])}
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Submit */}
            {error && (
              <p className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-4 py-2">
                {error}
              </p>
            )}

            {loading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>{status}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Processing..." : "Generate Schedule"}
            </button>
          </div>
        ) : (
          /* Results */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Generated Schedule</h2>
              <div className="flex gap-3">
                <button
                  className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-4 py-2 rounded-lg transition-colors"
                  onClick={downloadCSV}
                >
                  Download CSV
                </button>
                <button
                  className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 px-4 py-2 rounded-lg transition-colors"
                  onClick={() => setResult(null)}
                >
                  New Schedule
                </button>
              </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Avg SoS", value: result.stats.avgSoS.toFixed(2) },
                { label: "Std Dev", value: result.stats.stdDev.toFixed(2) },
                { label: "Spread", value: result.stats.spread.toFixed(1) },
                { label: "Week 0 Games", value: result.stats.week0Games },
                { label: "OOC Games", value: result.stats.totalOOCGames },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                >
                  <p className="text-xs text-zinc-500">{stat.label}</p>
                  <p className="text-lg font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Schedule table */}
            <div className="overflow-x-auto border border-zinc-800 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800">
                    <th className="px-3 py-2 text-left font-medium text-zinc-400 sticky left-0 bg-zinc-900 z-10">
                      Team
                    </th>
                    {Array.from({ length: 14 }, (_, i) => (
                      <th
                        key={i}
                        className="px-2 py-2 text-center font-medium text-zinc-400 min-w-[110px]"
                      >
                        W{i}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center font-medium text-zinc-400">
                      H/A
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-zinc-400">
                      SoS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row, idx) => (
                    <tr
                      key={row.team}
                      className={`border-b border-zinc-800/50 ${
                        idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/30"
                      }`}
                    >
                      <td className="px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-inherit z-10">
                        <span className="text-zinc-500 mr-1">#{row.rank}</span>
                        {row.team}
                        <span className="text-zinc-600 ml-1 text-[10px]">
                          {row.conference}
                        </span>
                      </td>
                      {row.weeks.map((w, wi) => {
                        const isOOC = w.includes("*");
                        const isBye = w === "BYE";
                        const clean = w.replace(/\*/g, "");
                        return (
                          <td
                            key={wi}
                            className={`px-2 py-2 text-center whitespace-nowrap ${
                              isBye
                                ? "text-zinc-700"
                                : isOOC
                                  ? "text-green-400 font-medium"
                                  : "text-zinc-400"
                            }`}
                          >
                            {clean}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center text-zinc-400">
                        {row.homeGames}/{row.awayGames}
                      </td>
                      <td className="px-2 py-2 text-center font-mono">
                        {row.totalSoS.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-zinc-600">
              <span className="text-green-400">Green</span> = new OOC games
              (enter these in-game). White = locked/existing games.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
