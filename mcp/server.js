import express from "express";
import fetch from "node-fetch";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const PORT = process.env.PORT || 8899;

// 같은 docker compose 네트워크에서 collector 서비스로 접근
const COLLECTOR_INGEST = process.env.COLLECTOR_INGEST || "http://collector:8080/ingest";

// (선택) 간단 토큰. ChatGPT 등록쪽 인증이 Bearer를 지원하면 같이 쓰면 됨.
const AUTH_TOKEN = process.env.MCP_TOKEN || "";

const app = express();

// MCP SSE 엔드포인트
app.get("/sse", async (req, res) => {
  if (AUTH_TOKEN) {
    const h = req.headers.authorization || "";
    if (h !== `Bearer ${AUTH_TOKEN}`) return res.status(401).send("unauthorized");
  }

  const transport = new SSEServerTransport("/message", res);
  const server = new McpServer({ name: "soul-mcp", version: "0.1.0" });

  // 실시간 저장 도구: collector로 그대로 전달해서 sqlite에 꽂기
  server.tool(
    "save_utterance",
    "Save a text utterance immediately into my local DB (via collector).",
    {
      text: { type: "string", description: "text to store" },
      type: { type: "string", description: "event type", default: "mcp" }
    },
    async ({ text, type }) => {
      const payload = { type: type || "mcp", text };

      const r = await fetch(COLLECTOR_INGEST, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`collector ingest failed: ${r.status} ${body}`);
      }

      return {
        content: [{ type: "text", text: "ok" }]
      };
    }
  );

  await server.connect(transport);
});

// SSE에서 오는 MCP 메시지 POST 수신
app.post("/message", express.text({ type: "*/*" }), (req, res) => {
  res.status(200).send("ok");
});

app.listen(PORT, () => console.log(`MCP server listening on :${PORT}`));