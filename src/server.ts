import express, { Request, Response } from "express";
import expressWs from "express-ws";
import { RawData, WebSocket } from "ws";
import { createServer, Server as HTTPServer } from "http";
import cors from "cors";
import { Retell } from "retell-sdk";
import { CustomLlmRequest, CustomLlmResponse } from "./types";
import { DemoLlmClient } from "./llms/llm_openai_func_call";

export class Server {
  private httpServer: HTTPServer;
  public  app: expressWs.Application;

  constructor() {
    this.app = expressWs(express()).app;
    this.httpServer = createServer(this.app);

    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.urlencoded({ extended: true }));

    /* simple health check */
    this.app.get("/", (_req, res) => res.send("OK"));

    this.handleRetellLlmWebSocket();
    this.handleWebhook();
  }

  listen(port: number): void {
    this.app.listen(port);
    console.log("Listening on", port);
  }

  /* ----------  Retell event webhooks (optional) ---------- */
  private handleWebhook() {
    this.app.post("/webhook", (req: Request, res: Response) => {
      if (
        !Retell.verify(
          JSON.stringify(req.body),
          process.env.RETELL_API_KEY,
          req.headers["x-retell-signature"] as string
        )
      ) {
        console.error("Invalid Retell signature"); return;
      }
      console.log("Retell event:", req.body.event);
      res.json({ received: true });
    });
  }

  /* ----------  Main LLM WebSocket bridge  ---------- */
  private handleRetellLlmWebSocket() {
    this.app.ws("/llm-websocket/:call_id", async (ws, req) => {
      const callId = req.params.call_id;
      console.log("LLM socket opened for", callId);

      /* 1. Send initial config so Retell starts streaming */
      const cfg: CustomLlmResponse = {
        response_type: "config",
        config: { auto_reconnect: true, call_details: true }
      };
      ws.send(JSON.stringify(cfg));

      /* 2. Create LLM helper */
      const llmClient = new DemoLlmClient();

      ws.on("error", e => console.error("ws error:", e));
      ws.on("close", () => console.log("ws closed for", callId));

      /* 3. Handle inbound websocket messages */
      ws.on("message", async (data: RawData, isBinary: boolean) => {
        if (isBinary) {
          ws.close(1007, "binary frames unsupported"); return;
        }

        const request: CustomLlmRequest = JSON.parse(data.toString());

        /* ----------  CALL_DETAILS  ---------- */
        if (request.interaction_type === "call_details") {
          console.log("call_details payload:", JSON.stringify(request.call, null, 2));

          /* Extract phone from every known Retell path */
          const phone =
              request.call?.customer?.phone        ??
              request.call?.customer?.number       ??
              request.call?.caller?.phone          ??
              request.call?.contact?.phone         ??
              request.call?.phoneNumber            ??
              request.call?.from                   ??
              request.call?.to                     ??
              "";

          console.log("Caller phone resolved to:", phone || "<empty>");

          /* Perform GHL lookup (even if phone empty, for debugging) */
          try {
            const lookupJson = await llmClient.handleFunctionCall(
              "ghl_lookup",
              { phone }
            );
            console.log("GHL lookup response:", lookupJson);

            /* Feed the result to the LLM as a tool result */
            const toolMsg: CustomLlmResponse = {
              response_type: "tool_call_result",
              tool_call_id: "ghl_lookup_init",
              content: lookupJson
            };
            ws.send(JSON.stringify(toolMsg));
          } catch (err) {
            console.error("GHL lookup failed:", err);
            const errMsg: CustomLlmResponse = {
              response_type: "tool_call_result",
              tool_call_id: "ghl_lookup_init",
              content: JSON.stringify({
                error: "Lookup failed",
                details: err instanceof Error ? err.message : "unknown"
              })
            };
            ws.send(JSON.stringify(errMsg));
          }

          /* Always send greeting AFTER lookup attempt */
          llmClient.BeginMessage(ws);
          return;
        }

        /* ----------  NORMAL TURNS  ---------- */
        if (
          request.interaction_type === "response_required" ||
          request.interaction_type === "reminder_required"
        ) {
          llmClient.DraftResponse(request, ws);
          return;
        }

        /* ----------  KEEP-ALIVE  ---------- */
        if (request.interaction_type === "ping_pong") {
          const pong: CustomLlmResponse = {
            response_type: "ping_pong",
            timestamp: request.timestamp
          };
          ws.send(JSON.stringify(pong));
        }

        /* update_only messages need no action */
      });
    });
  }
}
