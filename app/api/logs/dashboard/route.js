import { NextResponse } from "next/server";

export async function GET() {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cost Tracking Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin-bottom: 20px; color: #333; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .stat-card h3 { font-size: 12px; color: #999; text-transform: uppercase; margin-bottom: 8px; }
    .stat-card .value { font-size: 28px; font-weight: bold; color: #333; }
    .stat-card .unit { font-size: 14px; color: #666; margin-left: 5px; }
    table { width: 100%; background: white; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    th { background: #f8f8f8; padding: 12px; text-align: left; font-weight: 600; color: #333; border-bottom: 1px solid #eee; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f9f9f9; }
    .status-success { color: #22c55e; font-weight: 600; }
    .status-error { color: #ef4444; font-weight: 600; }
    .action-badge { display: inline-block; padding: 4px 8px; background: #f0f0f0; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .loading { text-align: center; padding: 40px; color: #666; }
    .error { background: #fee2e2; color: #991b1b; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>💰 Cost Tracking Dashboard</h1>

    <div id="stats" class="stats-grid"></div>
    <div id="error" class="error" style="display: none;"></div>
    <div id="loading" class="loading">Loading...</div>
    <table id="table" style="display: none;">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Action</th>
          <th>Model</th>
          <th>Input Tokens</th>
          <th>Output Tokens</th>
          <th>Cost (USD)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>

  <script>
    async function loadData() {
      try {
        const [logsRes, statsRes] = await Promise.all([
          fetch('/api/logs?limit=100'),
          fetch('/api/logs?format=stats')
        ]);

        if (!logsRes.ok || !statsRes.ok) throw new Error('Failed to load data');

        const logsData = await logsRes.json();
        const stats = await statsRes.json();

        // Render stats
        const statsHtml = \`
          <div class="stat-card">
            <h3>Total Requests</h3>
            <div class="value">\${stats.totalRequests}</div>
          </div>
          <div class="stat-card">
            <h3>Total Cost</h3>
            <div class="value">\\$\${stats.totalCostUSD.toFixed(4)}</div>
          </div>
          <div class="stat-card">
            <h3>Avg Cost/Request</h3>
            <div class="value">\\$\${stats.avgCostPerRequest.toFixed(6)}</div>
          </div>
          <div class="stat-card">
            <h3>Total Tokens</h3>
            <div class="value">\${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}</div>
          </div>
          \${Object.entries(stats.byAction).map(([action, data]) => \`
            <div class="stat-card">
              <h3>\${action}</h3>
              <div style="font-size: 14px;">
                <div>\${data.count} requests</div>
                <div>\\$\${data.totalCost.toFixed(4)}</div>
                <div style="color: #999; font-size: 12px;">avg: \\$\${data.avgCost.toFixed(6)}</div>
              </div>
            </div>
          \`).join('')}
        \`;
        document.getElementById('stats').innerHTML = statsHtml;

        // Render logs
        const logs = logsData.logs || [];
        const tbody = document.getElementById('tbody');
        tbody.innerHTML = logs.map(log => \`
          <tr>
            <td>\${new Date(log.timestamp).toLocaleString()}</td>
            <td><span class="action-badge">\${log.action}</span></td>
            <td style="font-size: 12px; color: #666;">\${log.model}</td>
            <td>\${(log.inputTokens || 0).toLocaleString()}</td>
            <td>\${(log.outputTokens || 0).toLocaleString()}</td>
            <td style="font-weight: 600;">\\$\${(log.costUSD || 0).toFixed(6)}</td>
            <td class="status-\${log.status}">\${log.status}</td>
          </tr>
        \`).join('');

        document.getElementById('loading').style.display = 'none';
        document.getElementById('table').style.display = 'table';
      } catch (error) {
        document.getElementById('loading').style.display = 'none';
        const errorDiv = document.getElementById('error');
        errorDiv.style.display = 'block';
        errorDiv.textContent = '❌ Error loading data: ' + error.message;
      }
    }

    // Load every 5 seconds
    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}
