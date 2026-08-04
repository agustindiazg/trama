import { NextResponse } from "next/server";
import { getCostLogs, getCostStats } from "@/lib/costLogger";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json"; // json, csv, stats
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 1000);

    if (format === "stats") {
      const stats = await getCostStats();
      return NextResponse.json(stats);
    }

    const logs = await getCostLogs(limit);

    if (format === "csv") {
      if (!logs.length) {
        return new NextResponse("timestamp,action,model,inputTokens,outputTokens,costUSD,status\n", {
          headers: { "content-type": "text/csv" }
        });
      }

      const headers = ["timestamp", "action", "model", "inputTokens", "outputTokens", "costUSD", "status"];
      const csv = [
        headers.join(","),
        ...logs.map((log) =>
          headers.map((h) => {
            const value = log[h];
            if (typeof value === "object") return JSON.stringify(value);
            return String(value || "").replace(/"/g, '""');
          }).join(",")
        )
      ].join("\n");

      return new NextResponse(csv, {
        headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=cost-logs.csv" }
      });
    }

    // Default JSON
    return NextResponse.json({
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error("[LOGS_API_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
