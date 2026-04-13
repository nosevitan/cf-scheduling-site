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

export default function Home() {
  const [rankings, setRankings] = useState("");
  const [conferences, setConferences] = useState("");
  const [conferenceMode, setConferenceMode] = useState<"text" | "screenshot">("text");
  const [conferenceImage, setConferenceImage] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [error, setError] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://enterprise.tail3be075.ts.net";

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
    if (screenshots.length === 0) {
      setError("Please upload schedule screenshots");
      return;
    }
    if (conferenceMode === "text" && !conferences.trim()) {
      setError("Please enter conference data");
      return;
    }

    setError("");
    setLoading(true);
    setStatus("Uploading screenshots...");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("rankings", rankings);

      if (conferenceMode === "text") {
        formData.append("conferences", conferences);
      } else if (conferenceImage) {
        formData.append("conference_image", conferenceImage);
      }

      screenshots.forEach((file) => {
        formData.append("screenshots", file);
      });

      setStatus("Processing screenshots with OCR...");

      const response = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Server error");
      }

      setStatus("Schedule generated!");
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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

            {/* Conferences */}
            <section>
              <div className="flex items-center gap-4 mb-2">
                <label className="block text-sm font-medium text-zinc-300">
                  Conferences
                </label>
                <div className="flex gap-2 text-xs">
                  <button
                    className={`px-3 py-1 rounded-full border ${
                      conferenceMode === "text"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                    }`}
                    onClick={() => setConferenceMode("text")}
                  >
                    Text
                  </button>
                  <button
                    className={`px-3 py-1 rounded-full border ${
                      conferenceMode === "screenshot"
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                    }`}
                    onClick={() => setConferenceMode("screenshot")}
                  >
                    Screenshot
                  </button>
                </div>
              </div>

              {conferenceMode === "text" ? (
                <textarea
                  className="w-full h-48 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder={`SEC: Oklahoma, Texas, Auburn, SMU | Washington St., Wisconsin, Virginia Tech, Cincinnati\nBig 12: Ohio State, Colorado, Arkansas, North Carolina | Missouri, Louisville, California, Oklahoma State\n...`}
                  value={conferences}
                  onChange={(e) => setConferences(e.target.value)}
                />
              ) : (
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="conf-upload"
                    onChange={(e) =>
                      setConferenceImage(e.target.files?.[0] || null)
                    }
                  />
                  <label
                    htmlFor="conf-upload"
                    className="cursor-pointer text-zinc-400 hover:text-zinc-300"
                  >
                    {conferenceImage ? (
                      <span className="text-green-400">
                        {conferenceImage.name}
                      </span>
                    ) : (
                      "Click to upload conference screenshot"
                    )}
                  </label>
                </div>
              )}
            </section>

            {/* Screenshots */}
            <section>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Schedule Screenshots
                <span className="text-zinc-500 ml-2 font-normal">
                  (2 per team — top half + bottom half)
                </span>
              </label>
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
                  <p className="text-xs text-zinc-600">
                    Upload all team schedule screenshots (2 per team)
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
            </section>

            {/* Submit */}
            {error && (
              <p className="text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-4 py-2">
                {error}
              </p>
            )}

            <button
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? status : "Generate Schedule"}
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
                {
                  label: "Spread",
                  value: result.stats.spread.toFixed(1),
                },
                {
                  label: "Week 0 Games",
                  value: result.stats.week0Games,
                },
                {
                  label: "OOC Games",
                  value: result.stats.totalOOCGames,
                },
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
                        <span className="text-zinc-500 mr-1">
                          #{row.rank}
                        </span>
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
