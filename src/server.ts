import express, { Request, Response } from "express";
import expressWs from "express-ws";
import { RawData, WebSocket } from "ws";
import { createServer, Server as HTTPServer } from "http";
import cors from "cors";
import fetch from "node-fetch";
import { Retell } from "retell-sdk";
import { CustomLlmRequest, CustomLlmResponse } from "./types";
import { DemoLlmClient } from "./llms/llm_openai_func_call";

/* ----------  constants  ---------- */
const N8N_GHL_WEBHOOK =
  "https://n8n-cloudhosted.onrender.com/webhook/894adbcb-6c82-4c25-b0e7-a1d973266aad";

export class Server {
  private httpServer: HTTPServer;
  public app: expressWs.Application;

  constructor() {
    this.app = expressWs(express()).app;
    this.httpServer = createServer(this.app);

    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    this.app.get("/", (_req, res) => res.send("OK"));

    this.handleRetellLlmWebSocket();
    this.handleWebhook();
  }

  listen(port: number): void {
    this.app.listen(port);
    console.log("Listening on", port);
  }

  // Optional Retell event webhook
  private handleWebhook() {
    this.app.post("/webhook", (req: Request, res: Response) => {
      if (
        !Retell.verify(
          JSON.stringify(req.body),
          process.env.RETELL_API_KEY,
          req.headers["x-retell-signature"] as string
        )
      ) {
        console.error("Invalid Retell signature");
        return res.sendStatus(403);
      }
      console.log("Retell event:", req.body.event);
      res.json({ received: true });
    });
  }

  // Main LLM websocket
  private handleRetellLlmWebSocket() {
    this.app.ws("/llm-websocket/:call_id", async (ws, req) => {
      const callId = req.params.call_id;
      console.log("LLM socket opened for", callId);

      // 1. Send config
      const cfg: CustomLlmResponse = {
        response_type: "config",
        config: { auto_reconnect: true, call_details: true }
      };
      ws.send(JSON.stringify(cfg));

      // 2. LLM helper
      const llmClient = new DemoLlmClient();

      ws.on("error", e => console.error("ws error:", e));
      ws.on("close", () => console.log("ws closed for", callId));

      // 3. Handle inbound messages
      ws.on("message", async (data: RawData, isBinary: boolean) => {
        if (isBinary) {
          ws.close(1007, "Binary frames not supported");
          return;
        }

        const request: CustomLlmRequest = JSON.parse(data.toString());

        // ----------  call_details  ----------
        if (request.interaction_type === "call_details") {
          console.log("call_details payload:", JSON.stringify(request.call, null, 2));

          // a) use Retell's contact lookup result if present
          let contactObj = request.call?.customer;

          // b) fallback – build minimal object from caller phone with comprehensive extraction
          if (!contactObj) {
            const phone =
              request.call?.customer?.phone   ??
              request.call?.customer?.number  ??
              request.call?.caller?.phone     ??
              request.call?.contact?.phone    ??
              request.call?.user_phone        ?? // Retell's native variable
              request.call?.from_number       ?? // NEW: websocket from_number variable
              request.call?.phoneNumber       ??
              request.call?.from              ??
              request.call?.to                ??
              "";
            contactObj = { phone };
            console.log("No contact from Retell; falling back to phone:", phone);
            console.log("Available call data fields:", Object.keys(request.call || {}));
          }

          // c) POST to your n8n webhook
          let n8nResponseJson = { success: false, message: "Lookup skipped" };
          try {
            const n8n = await fetch(N8N_GHL_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(contactObj)
            });
            n8nResponseJson = await n8n.json();
            console.log("n8n webhook OK:", n8nResponseJson);
          } catch (err) {
            console.error("n8n webhook failed:", err);
          }

          // d) pass the (potentially enriched) contact data to LLM
          const toolMsg: CustomLlmResponse = {
            response_type: "tool_call_result",
            tool_call_id: "ghl_lookup_init",
            content: JSON.stringify(n8nResponseJson)
          };
          ws.send(JSON.stringify(toolMsg));

          // e) greet the caller
          llmClient.BeginMessage(ws);
          return;
        }

        // ----------  normal turns  ----------
        if (
          request.interaction_type === "response_required" ||
          request.interaction_type === "reminder_required"
        ) {
          llmClient.DraftResponse(request, ws);
          return;
        }

        // ----------  keep-alive  ----------
        if (request.interaction_type === "ping_pong") {
          const pong: CustomLlmResponse = {
            response_type: "ping_pong",
            timestamp: request.timestamp
          };
          ws.send(JSON.stringify(pong));
        }

        // update_only messages need no action
      });
    });
  }
}
