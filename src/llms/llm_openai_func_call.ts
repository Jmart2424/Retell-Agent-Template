import fetch from 'node-fetch';
import OpenAI from "openai";
import { WebSocket } from "ws";
import {
  CustomLlmResponse,
  FunctionCall,
  ReminderRequiredRequest,
  ResponseRequiredRequest,
  Utterance,
} from "../types";

export class DemoLlmClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_APIKEY,
    });
  }

  // Define the system prompt for Katie Scheduler
  private systemPrompt = `
## Identity & Purpose
You are Katie Scheduler, a virtual assistant representing PestAway Solutions, a professional pest control provider serving San Antonio, TX, and surrounding areas. Your purpose is to assist callers by answering service-related questions, confirming their needs, and helping them schedule an appointment or speak to a licensed technician. Your goal is to make the experience smooth, reassuring, and informative—especially for customers dealing with stressful pest situations.

## Voice & Persona

### Personality
- Sound professional, friendly, calm, and knowledgeable—like a helpful receptionist who's been with the company for years.
- Show genuine concern for the caller's pest issue, offering helpful guidance without sounding overly pushy.
- Project confidence and reassurance—make the customer feel like they're in good hands.
- Avoid high-pressure sales language—focus on being informative and solution-oriented.

### Speech Characteristics
- Speak in a professional-friendly, happy tone. Think warm and inviting, not cartoonish.
- Use natural contractions ("you're," "we've," "y'all" occasionally, if it fits contextually and naturally).
- Speak clearly, at a steady and calm pace, while sounding conversational and approachable.
- Vary phrasing and intonation slightly to avoid sounding robotic or repetitive.
- Use simple, accessible language when talking about pests, treatments, and pricing.
- Mirror the caller's tone slightly—more upbeat if they are energetic, more measured if they sound cautious or unsure.
- Use gentle upward inflection at the end of welcoming or positive sentences to sound more engaging.
- Add slight emotional warmth to keywords like "home," "help," "family," "relief," or "support."

## Response Guidelines
- Keep answers concise unless further clarification is helpful.
- Ask one question at a time to keep the flow natural.
- Vary confirmation and acknowledgment phrases to sound more natural and engaged. Use a rotating selection of responses like: "Got it.", "Okay.", "Thank you for that.", "Okay, great.", "Thanks for letting me know.", "Sounds good.", "Got it.", "I appreciate that.", "Great, thanks."
  - Avoid repeating the same phrase back-to-back in a single conversation.
  - Match tone to the context — more enthusiastic if the user is excited, more calm and neutral if the tone is serious.
- Avoid technical jargon unless the homeowner uses it first.
- Don't overuse technical terms—keep explanations simple and benefit-driven.
- Always offer a clear next step (e.g., schedule a visit, connect with a tech).

## Function Usage
When a customer asks about availability or scheduling, use the check_calendar_tidycal function to check available time slots. Always be helpful and offer alternative times if the requested slot is not available.
`;

  // Define the functions available to the agent
  private functions = [
    {
      type: "function",
      function: {
        name: "check_calendar_tidycal",
        description: "Check calendar availability for pest control service appointments",
        parameters: {
          type: "object",
          properties: {
            requested_datetime: {
              type: "string",
              description: "Requested date and time in ISO format (YYYY-MM-DDTHH:MM:SS)"
            },
            service_type: {
              type: "string",
              description: "Type of pest control service requested",
              default: "general_pest_control"
            }
          },
          required: ["requested_datetime"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "end_call",
        description: "End the call gracefully",
        parameters: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description: "Reason for ending the call"
            }
          },
          required: ["reason"]
        }
      }
    }
  ];

  // Function to handle N8N webhook calls
  private async handleFunctionCall(functionName: string, parameters: any): Promise<string> {
    // Map function names to n8n webhook endpoints
    const webhookEndpoints = {
      'check_calendar_tidycal': 'https://n8n-cloudhosted.onrender.com/webhook-test/c01d3726-2d0d-4f83-8adf-3b32f5354d2f',
      'end_call': null // Handle locally
    };

    if (functionName === 'end_call') {
      // Handle end_call locally
      return JSON.stringify({ 
        success: true, 
        message: parameters.reason || "Thank you for calling PestAway Solutions! Have a great day!" 
      });
    }

    const webhookUrl = webhookEndpoints[functionName];
    if (!webhookUrl) {
      return JSON.stringify({ error: `Unknown function: ${functionName}` });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          function_name: functionName,
          parameters: parameters,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return JSON.stringify(result);
    } catch (error) {
      console.error(`Error calling function ${functionName}:`, error);
      return JSON.stringify({ 
        error: `Failed to check calendar availability`,
        details: error.message 
      });
    }
  }

  // First sentence requested
  BeginMessage(ws: WebSocket) {
    const beginSentence = "Hi there! I'm Katie from PestAway Solutions. How can I help you today?";
    const res: CustomLlmResponse = {
      response_type: "response",
      response_id: 0,
      content: beginSentence,
      content_complete: true,
      end_call: false,
    };
    ws.send(JSON.stringify(res));
  }

  private ConversationToChatRequestMessages(conversation: Utterance[]) {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    for (const turn of conversation) {
      result.push({
        role: turn.role === "agent" ? "assistant" : "user",
        content: turn.content,
      });
    }
    return result;
  }

  private PreparePrompt(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    funcResult?: FunctionCall,
  ) {
    const transcript = this.ConversationToChatRequestMessages(request.transcript);
    const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];

    for (const message of transcript) {
      requestMessages.push(message);
    }

    // Add function result if available
    if (funcResult) {
      requestMessages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: funcResult.id,
            type: "function",
            function: {
              name: funcResult.funcName,
              arguments: JSON.stringify(funcResult.arguments),
            },
          },
        ],
      });
      requestMessages.push({
        role: "tool",
        tool_call_id: funcResult.id,
        content: funcResult.result || "",
      });
    }

    if (request.interaction_type === "reminder_required") {
      requestMessages.push({
        role: "user",
        content: "(Now the user has not responded in a while, you would say:)",
      });
    }

    return requestMessages;
  }

  async DraftResponse(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    ws: WebSocket,
    funcResult?: FunctionCall,
  ) {
    console.clear();
    console.log("req", request);
    if (request.interaction_type === "update_only") {
      // process live transcript update if needed
      return;
    }
    const requestMessages = this.PreparePrompt(request, funcResult);
    let funcCall: FunctionCall | undefined;
    let funcArguments = "";

    try {
      const events = await this.client.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: requestMessages,
        stream: true,
        temperature: 0.1,
        max_tokens: 200,
        frequency_penalty: 1.0,
        presence_penalty: 1.0,
        tools: this.functions,
      });

      for await (const event of events) {
        if (event.choices.length >= 1) {
          const delta = event.choices[0].delta;
          if (!delta) continue;

          // Handle function calls
          if (delta.tool_calls && delta.tool_calls.length >= 1) {
            const toolCall = delta.tool_calls[0];
            if (toolCall.id) {
              if (funcCall) {
                break; // Another function received, old function complete
              } else {
                funcCall = {
                  id: toolCall.id,
                  funcName: toolCall.function?.name || "",
                  arguments: {},
                };
              }
            } else {
              funcArguments += toolCall.function?.arguments || "";
            }
          } else if (delta.content) {
            const res: CustomLlmResponse = {
              response_type: "response",
              response_id: request.response_id,
              content: delta.content,
              content_complete: false,
              end_call: false,
            };
            ws.send(JSON.stringify(res));
          }
        }
      }
    } catch (err) {
      console.error("Error in gpt stream: ", err);
    } finally {
      if (funcCall != null) {
        funcCall.arguments = JSON.parse(funcArguments);
        
        // Handle end_call function
        if (funcCall.funcName === "end_call") {
          const res: CustomLlmResponse = {
            response_type: "response",
            response_id: request.response_id,
            content: funcCall.arguments.message || "Thank you for calling PestAway Solutions!",
            content_complete: true,
            end_call: true,
          };
          ws.send(JSON.stringify(res));
        } else {
          // Handle other functions (like calendar check)
          try {
            const functionResult = await this.handleFunctionCall(funcCall.funcName, funcCall.arguments);
            
            // Parse the result to provide a meaningful response
            const parsedResult = JSON.parse(functionResult);
            let responseContent = "";
            
            if (parsedResult.available) {
              responseContent = `Great! ${parsedResult.message}`;
              if (parsedResult.suggested_times && parsedResult.suggested_times.length > 0) {
                responseContent += ` I also have these alternative times available: ${parsedResult.suggested_times.join(", ")}.`;
              }
            } else {
              responseContent = `I'm sorry, that time slot isn't available. Let me suggest some alternatives.`;
              if (parsedResult.suggested_times && parsedResult.suggested_times.length > 0) {
                responseContent += ` How about: ${parsedResult.suggested_times.join(", ")}?`;
              }
            }
            
            const res: CustomLlmResponse = {
              response_type: "response",
              response_id: request.response_id,
              content: responseContent,
              content_complete: true,
              end_call: false,
            };
            ws.send(JSON.stringify(res));
          } catch (error) {
            console.error("Error handling function call:", error);
            // Send error response
            const res: CustomLlmResponse = {
              response_type: "response",
              response_id: request.response_id,
              content: "I'm sorry, I'm having trouble checking our calendar right now. Let me transfer you to someone who can help.",
              content_complete: true,
              end_call: false,
            };
            ws.send(JSON.stringify(res));
          }
        }
      } else {
        const res: CustomLlmResponse = {
          response_type: "response",
          response_id: request.response_id,
          content: "",
          content_complete: true,
          end_call: false,
        };
        ws.send(JSON.stringify(res));
      }
    }
  }
}
