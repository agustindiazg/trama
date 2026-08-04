import { NextResponse } from "next/server";
import { getJobAnalysisLogs, getJobAnalysisStats } from "@/lib/costLogger";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "logs"; // "logs" o "stats"
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (view === "stats") {
      const stats = await getJobAnalysisStats();
      return NextResponse.json(stats);
    }

    const logs = await getJobAnalysisLogs(limit);
    return NextResponse.json({
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error("Job analysis logs error:", error);
    return NextResponse.json({ error: "Error fetching job analysis logs" }, { status: 500 });
  }
}
