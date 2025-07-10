import express, { Request, Response } from "express";
import expressWs from "express-ws";
import { RawData, WebSocket } from "ws";
import { createServer, Server as HTTPServer } from "http";
import cors from "cors";
import { Retell } from "retell-sdk";
import { CustomLlmRequest, CustomLlmResponse } from "./types";

// FIXED: Import from the correct file where you updated Katie Scheduler
import { DemoLlmClient } from "./llms/llm_openai_func_call";

export class Server {
  private httpServer: HTTPServer;
  public app: expressWs.Application;

  constructor() {
    this.app = expressWs(express()).app;
    this.httpServer = createServer(this.app);
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.urlencoded({ extended: true }));

    // Health check endpoint for Railway/Render
    this.app.get('/', (req: Request, res: Response) => {
      res.send('OK');
    });

    this.handleRetellLlmWebSocket();
    this.handleWebhook();
  }

  listen(port: number): void {
    this.app.listen(port);
    console.log("Listening on " + port);
  }

  handleWebhook() {
    this.app.post("/webhook", (req: Request, res: Response) => {
      if (
        !Retell.verify(
          JSON.stringify(req.body),
          process.env.RETELL_API_KEY,
          req.headers["x-retell-signature"] as string,
        )
      ) {
        console.error("Invalid signature");
        return;
      }
      const content = req.body;
      switch (content.event) {
        case "call_started":
          console.log("Call started event received", content.data.call_id);
          break;
        case "call_ended":
          console.log("Call ended event received", content.data.call_id);
          break;
        case "call_analyzed":
          console.log("Call analyzed event received", content.data.call_id);
          break;
        default:
          console.log("Received an unknown event:", content.event);
      }
      res.json({ received: true });
    });
  }

  handleRetellLlmWebSocket() {
    this.app.ws(
      "/llm-websocket/:call_id",
      async (ws: WebSocket, req: Request) => {
        try {
          const callId = req.params.call_id;
          console.log("Handle llm ws for: ", callId);

          const config: CustomLlmResponse = {
            response_type: "config",
            config: {
              auto_reconnect: true,
              call_details: true,
            },
          };
          ws.send(JSON.stringify(config));

          // Create the LLM client instance
          const llmClient = new DemoLlmClient();

          ws.on("error", (err) => {
            console.error("Error received in LLM websocket client: ", err);
          });
          ws.on("close", (err) => {
            console.error("Closing llm ws for: ", callId);
          });

          ws.on("message", async (data: RawData, isBinary: boolean) => {
            if (isBinary) {
              console.error("Got binary message instead of text in websocket.");
              ws.close(1007, "Cannot find corresponding Retell LLM.");
            }
            const request: CustomLlmRequest = JSON.parse(data.toString());

            if (request.interaction_type === "call_details") {
              console.log("call details: ", request.call);

              // NEW: Automatically trigger GHL lookup at the start of every call
              const callerPhone = request.call?.from ?? "";
              if (callerPhone) {
                try {
                  console.log(`Triggering GHL lookup for phone: ${callerPhone}`);
                  
                  // Call the GHL lookup webhook immediately
                  const lookupResult = await llmClient.handleFunctionCall(
                    "ghl_lookup",
                    { phone: callerPhone }
                  );

                  console.log("GHL lookup completed:", lookupResult);

                  // Send the lookup result as a tool call result to the conversation
                  const toolResultMessage: CustomLlmResponse = {
                    response_type: "tool_call_result",
                    tool_call_id: "ghl_lookup_init",
                    content: lookupResult
                  };
                  ws.send(JSON.stringify(toolResultMessage));

                } catch (error) {
                  console.error("GHL lookup failed:", error);
                  
                  // Send an error result so the LLM knows the lookup failed
                  const errorMessage: CustomLlmResponse = {
                    response_type: "tool_call_result",
                    tool_call_id: "ghl_lookup_init",
                    content: JSON.stringify({ 
                      error: "Failed to lookup contact information",
                      details: error instanceof Error ? error.message : 'Unknown error'
                    })
                  };
                  ws.send(JSON.stringify(errorMessage));
                }
              } else {
                console.log("No caller phone number available for GHL lookup");
              }

              // Send the greeting after the lookup
              llmClient.BeginMessage(ws);
              
            } else if (
              request.interaction_type === "reminder_required" ||
              request.interaction_type === "response_required"
            ) {
              console.clear();
              console.log("req", request);
              llmClient.DraftResponse(request, ws);
            } else if (request.interaction_type === "ping_pong") {
              let pingpongResponse: CustomLlmResponse = {
                response_type: "ping_pong",
                timestamp: request.timestamp,
              };
              ws.send(JSON.stringify(pingpongResponse));
            } else if (request.interaction_type === "update_only") {
              // process live transcript update if needed
            }
          });
        } catch (err) {
          console.error("Encountered error:", err);
          ws.close(1011, "Encountered error: " + err);
        }
      },
    );
  }
}
