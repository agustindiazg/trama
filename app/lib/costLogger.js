import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");
const COSTS_LOG_FILE = path.join(LOGS_DIR, "costs.jsonl");

// Asegurar que el directorio de logs existe
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

export async function logCost(costEntry) {
  try {
    ensureLogsDir();

    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...costEntry
    });

    fs.appendFileSync(COSTS_LOG_FILE, logLine + "\n", "utf8");
  } catch (error) {
    // Fallback: log to console si falla el archivo
    console.error("[COST_LOG_ERROR]", error.message);
  }
}

// Log job analysis separately for better tracking
export async function logJobAnalysis(analysisEntry) {
  try {
    ensureLogsDir();

    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "job-analysis",
      ...analysisEntry
    });

    fs.appendFileSync(COSTS_LOG_FILE, logLine + "\n", "utf8");
  } catch (error) {
    console.error("[JOB_ANALYSIS_LOG_ERROR]", error.message);
  }
}

export async function getCostLogs(limit = 50) {
  try {
    ensureLogsDir();

    if (!fs.existsSync(COSTS_LOG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(COSTS_LOG_FILE, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);

    // Retornar últimas N líneas
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // Más recientes primero
  } catch (error) {
    console.error("[GET_COST_LOGS_ERROR]", error.message);
    return [];
  }
}

export async function getJobAnalysisLogs(limit = 50) {
  try {
    const logs = await getCostLogs(limit * 2); // Fetch more to filter

    return logs
      .filter(log => log.type === "job-analysis" || log.action === "analyze-job-posting")
      .slice(0, limit);
  } catch (error) {
    console.error("[GET_JOB_ANALYSIS_LOGS_ERROR]", error.message);
    return [];
  }
}

export async function getJobAnalysisStats() {
  try {
    const logs = await getCostLogs(10000); // Todos los logs
    const jobLogs = logs.filter(log => log.type === "job-analysis" || log.action === "analyze-job-posting");

    if (!jobLogs.length) {
      return {
        totalAnalyses: 0,
        bySourceType: {},
        avgKeywordsPerAnalysis: 0,
        avgQuestionsPerAnalysis: 0
      };
    }

    const stats = {
      totalAnalyses: jobLogs.length,
      bySourceType: {},
      avgKeywordsPerAnalysis: 0,
      avgQuestionsPerAnalysis: 0,
      totalKeywords: 0,
      totalQuestions: 0
    };

    jobLogs.forEach((log) => {
      const sourceType = log.sourceType || "unknown";
      if (!stats.bySourceType[sourceType]) {
        stats.bySourceType[sourceType] = { count: 0 };
      }
      stats.bySourceType[sourceType].count += 1;

      stats.totalKeywords += log.keywordsDetected || 0;
      stats.totalQuestions += log.questionsGenerated || 0;
    });

    stats.avgKeywordsPerAnalysis = parseFloat(
      (stats.totalKeywords / stats.totalAnalyses).toFixed(2)
    );
    stats.avgQuestionsPerAnalysis = parseFloat(
      (stats.totalQuestions / stats.totalAnalyses).toFixed(2)
    );

    return stats;
  } catch (error) {
    console.error("[GET_JOB_ANALYSIS_STATS_ERROR]", error.message);
    return null;
  }
}

export async function getCostStats() {
  try {
    const logs = await getCostLogs(10000); // Todos los logs

    if (!logs.length) {
      return {
        totalRequests: 0,
        totalCostUSD: 0,
        avgCostPerRequest: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        byAction: {}
      };
    }

    const stats = {
      totalRequests: logs.filter(l => l.action !== undefined).length,
      totalCostUSD: 0,
      avgCostPerRequest: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byAction: {}
    };

    logs.forEach((log) => {
      if (log.action) {
        stats.totalCostUSD += log.costUSD || 0;
        stats.totalInputTokens += log.inputTokens || 0;
        stats.totalOutputTokens += log.outputTokens || 0;

        const action = log.action || "unknown";
        if (!stats.byAction[action]) {
          stats.byAction[action] = {
            count: 0,
            totalCost: 0,
            avgCost: 0,
            totalTokens: 0
          };
        }

        stats.byAction[action].count += 1;
        stats.byAction[action].totalCost += log.costUSD || 0;
        stats.byAction[action].totalTokens += (log.inputTokens || 0) + (log.outputTokens || 0);
      }
    });

    if (stats.totalRequests > 0) {
      stats.avgCostPerRequest = parseFloat((stats.totalCostUSD / stats.totalRequests).toFixed(6));
    }

    Object.keys(stats.byAction).forEach((action) => {
      stats.byAction[action].avgCost = parseFloat(
        (stats.byAction[action].totalCost / stats.byAction[action].count).toFixed(6)
      );
    });

    return stats;
  } catch (error) {
    console.error("[GET_COST_STATS_ERROR]", error.message);
    return null;
  }
}
