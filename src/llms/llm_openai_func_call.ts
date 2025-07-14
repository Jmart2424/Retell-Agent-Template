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
  private contactSummary = "";
  
  // Enhanced custom field mapping with actual field names
  private customFieldMapping: { [key: string]: string } = {
    "SeLYuAVIdqR3xz31DgX5": "Home Value",
    "K2oQYXcF7zmZgbNZJgaz": "Loan Amount", 
    "11RRpfCU116d77Rzfb5H": "Loan Type",
    "5KCQnRaGgliP0LdaeQg5": "Veteran",
    "CwLeULca6xiOauN0BJ5Q": "Debt Amount",
    "xcocCapAHPBgV9JBc5s4": "Bk or late payment",
    "tGTdSy9ExfqQ3jSz67nl": "Additional Cash",
    "A4anrspWxgyfoutQZLVv": "Credit Score",
    "e7t1K6scrQ2a5T1aFcJV": "Reason for Cashout",
    "Yt929EATMXlci8PU9vlv": "Call Summary"
  };

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_APIKEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  // Enhanced system prompt with specific custom field information
  private systemPrompt = `
## Identity & Purpose
You are Katie Scheduler, a virtual assistant representing PestAway Solutions, a professional pest control provider serving San Antonio, TX, and surrounding areas. Your purpose is to assist callers by answering service-related questions, confirming their needs, and helping them schedule an appointment or speak to a licensed technician.

## How to Use Contact Data
You have access to comprehensive contact information from our CRM system containing:

### Standard Fields:
- id, dateAdded, type, locationId, phone, country, source
- firstName, lastName, fullNameLowerCase, firstNameLowerCase, lastNameLowerCase, emailLowerCase
- city, address1, state, postalCode, email
- tags (customer categories)

### Custom Fields Available:
You have access to the following specific custom fields for each contact:
- **Home Value**: The estimated value of the customer's home
- **Loan Amount**: The amount of the loan being processed
- **Loan Type**: The type of loan (e.g., VA, Conventional, FHA)
- **Veteran**: Whether the customer is a veteran (Yes/No)
- **Debt Amount**: Total debt amount for consolidation
- **Bk or late payment**: Bankruptcy or late payment history
- **Additional Cash**: Additional cash needed or available
- **Credit Score**: Customer's credit score
- **Reason for Cashout**: Why the customer needs cash out
- **Call Summary**: Summary of previous calls and interactions

## Responding to Customer Inquiries
When a caller asks about their information, USE the exact data you have on file:

**Standard Field Examples:**
- "What's my address?" → Quote the EXACT address1, city, state, postalCode
- "What's my phone number?" → Confirm the EXACT phone number
- "What email do you have?" → Quote the EXACT email address

**Custom Field Examples:**
- "What's my home value?" → Reference the exact Home Value field
- "What's my loan amount?" → Reference the exact Loan Amount field
- "What type of loan do I have?" → Reference the exact Loan Type field
- "Am I a veteran?" → Reference the exact Veteran field
- "What's my debt amount?" → Reference the exact Debt Amount field
- "What's my credit score?" → Reference the exact Credit Score field
- "Why did I call before?" → Reference the exact Call Summary field
- "What was my reason for cash out?" → Reference the exact Reason for Cashout field

CRITICAL: Never guess, invent, or hallucinate information. If a specific field is missing or empty, politely ask the caller to provide it. Always use the EXACT data provided - do not modify, approximate, or substitute similar information.

## Contact Personalization
If you receive contact information at the start of the conversation, use it to personalize your greeting and responses:
- Greet the caller by name if firstName or lastName is available
- Reference relevant custom fields if appropriate (e.g., "I see you're looking into a VA loan")
- Mention previous call summaries if available
- If you do not receive any contact info, proceed with a generic friendly greeting

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

## Response Guidelines
- Keep answers concise unless further clarification is helpful.
- Ask one question at a time to keep the flow natural.
- Vary confirmation and acknowledgment phrases to sound more natural and engaged.
- Avoid technical jargon unless the homeowner uses it first.
- Always offer a clear next step (e.g., schedule a visit, connect with a tech).

## Function Usage
When a customer asks about availability or scheduling, use the check_calendar_tidycal function to check available time slots. Always be helpful and offer alternative times if the requested slot is not available.
`;

  // Define available functions (unchanged)
  private functions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
              description: "Type of pest control service requested"
            }
          },
          required: ["requested_datetime"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "ghl_lookup",
        description: "Lookup contact information in GoHighLevel CRM system",
        parameters: {
          type: "object",
          properties: {
            phone: {
              type: "string",
              description: "Phone number to lookup in GoHighLevel"
            },
            email: {
              type: "string",
              description: "Email address to lookup (optional)"
            }
          },
          required: ["phone"]
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

  // Enhanced function to handle comprehensive custom fields lookup
  private async handleFunctionCall(functionName: string, parameters: any): Promise<string> {
    const webhookEndpoints: { [key: string]: string | null } = {
      'check_calendar_tidycal': 'https://n8n-cloudhosted.onrender.com/webhook-test/c01d3726-2d0d-4f83-8adf-3b32f5354d2f',
      'ghl_lookup': 'https://n8n-cloudhosted.onrender.com/webhook-test/894adbcb-6c82-4c25-b0e7-a1d973266aad',
      'end_call': null
    };

    if (functionName === 'end_call') {
      return JSON.stringify({ 
        success: true, 
        message: parameters.reason || "Thank you for calling PestAway Solutions! Have a great day!" 
      });
    }

    const webhookUrl = webhookEndpoints[functionName as keyof typeof webhookEndpoints];
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
      
      // Enhanced handling for GHL lookup results
      if (functionName === 'ghl_lookup' && result.contact) {
        // Store the complete contact data for later use
        this.contactSummary = this.createEnhancedContactSummary(result.contact);
      }
      
      return JSON.stringify(result);
    } catch (error) {
      console.error(`Error calling function ${functionName}:`, error);
      return JSON.stringify({ 
        error: `Failed to execute ${functionName}`,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Enhanced method to create comprehensive contact summary with exact field names
  private createEnhancedContactSummary(contactData: any): string {
    if (!contactData || Object.keys(contactData).length === 0) return "";

    const sections: string[] = [];
    
    // Standard contact information
    const standardFields = this.processStandardFields(contactData);
    if (standardFields) sections.push(standardFields);
    
    // Custom fields information with exact names
    const customFields = this.processCustomFieldsWithMapping(contactData);
    if (customFields) sections.push(customFields);
    
    // Tags information
    const tags = this.processTags(contactData);
    if (tags) sections.push(tags);

    return sections.length > 0 ? `[Contact Information: ${sections.join(" | ")}]` : "";
  }

  // Process standard fields from contact data
  private processStandardFields(contact: any): string {
    const parts: string[] = [];
    
    // Personal information
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    if (name) parts.push(`Customer: ${name}`);
    if (contact.email) parts.push(`Email: ${contact.email}`);
    if (contact.phone) parts.push(`Phone: ${contact.phone}`);
    
    // Address information
    const address = [contact.address1, contact.city, contact.state, contact.postalCode].filter(Boolean).join(", ");
    if (address) parts.push(`Address: ${address}`);
    
    // System information
    if (contact.id) parts.push(`Contact ID: ${contact.id}`);
    if (contact.dateAdded) parts.push(`Date Added: ${contact.dateAdded}`);
    if (contact.type) parts.push(`Type: ${contact.type}`);
    if (contact.source) parts.push(`Source: ${contact.source}`);
    if (contact.country) parts.push(`Country: ${contact.country}`);
    
    return parts.join(" | ");
  }

  // Process custom fields using exact field mapping
  private processCustomFieldsWithMapping(contact: any): string {
    if (!contact.customField || !Array.isArray(contact.customField)) return "";
    
    const customFieldParts: string[] = [];
    
    contact.customField.forEach((field: any) => {
      if (field.id && field.value) {
        // Use exact field name from mapping
        const fieldName = this.customFieldMapping[field.id];
        if (fieldName) {
          customFieldParts.push(`${fieldName}: ${field.value}`);
        } else {
          // Fallback for unknown field IDs
          customFieldParts.push(`Custom Field ${field.id}: ${field.value}`);
        }
      }
    });
    
    return customFieldParts.length > 0 ? `Custom Fields: ${customFieldParts.join(", ")}` : "";
  }

  // Process tags from contact data
  private processTags(contact: any): string {
    if (!contact.tags || !Array.isArray(contact.tags)) return "";
    
    const validTags = contact.tags.filter((tag: any) => 
      tag && typeof tag === 'string' && tag.trim() && tag !== "[undefined]"
    );
    
    return validTags.length > 0 ? `Tags: ${validTags.join(", ")}` : "";
  }

  // Enhanced BeginMessage with custom greeting
  BeginMessage(ws: WebSocket, contactJson: any = {}) {
    // Parse the contact JSON returned by your webhook:
    let contact: any = {};
    try {
      // if your n8n response wraps the data, adjust accordingly:
      contact = contactJson.contact ?? contactJson.data ?? contactJson;
    } catch {
      contact = {};
    }

    // Extract first name (or fallback):
    const firstName = contact.firstName || contact.first_name || "";

    // Build your exact greeting:
    const greeting = firstName
      ? `Hi, this is Katie with PestAway Solutions. It looks like we have you in our system. Am I speaking with ${firstName}?`
      : `Hi, this is Katie with PestAway Solutions. May I ask who I’m speaking with today?`;

    // Send the greeting over the WebSocket:
    const res: CustomLlmResponse = {
      response_type: "response",
      response_id: 0,
      content: greeting,
      content_complete: true,
      end_call: false,
    };
    ws.send(JSON.stringify(res));
  }

  // Helper method to find custom field values by exact field name
  private findCustomFieldByName(customFields: any[], fieldName: string): string | null {
    if (!Array.isArray(customFields)) return null;
    
    for (const field of customFields) {
      if (field.id && field.value) {
        const mappedName = this.customFieldMapping[field.id];
        if (mappedName === fieldName) {
          return field.value;
        }
      }
    }
    return null;
  }

  // Helper method to get all custom field values as an object
  private getAllCustomFields(customFields: any[]): { [fieldName: string]: string } {
    const result: { [fieldName: string]: string } = {};
    
    if (!Array.isArray(customFields)) return result;
    
    customFields.forEach(field => {
      if (field.id && field.value) {
        const fieldName = this.customFieldMapping[field.id];
        if (fieldName) {
          result[fieldName] = field.value;
        }
      }
    });
    
    return result;
  }

  // ConversationToChatRequestMessages, PreparePrompt, and DraftResponse remain unchanged
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

    if (this.contactSummary && this.contactSummary.trim()) {
      requestMessages.push({
        role: "assistant",
        content: this.contactSummary,
      });
    }

    for (const message of transcript) {
      requestMessages.push(message);
    }

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

    if (request.interaction_type !== "response_required" && request.interaction_type !== "reminder_required") {
      return;
    }

    const requestMessages = this.PreparePrompt(request, funcResult);

    let funcCall: FunctionCall | undefined;
    let funcArguments = "";
    let toolCallHandled = false;

    try {
      const events = await this.client.chat.completions.create({
        model: "llama3-70b-8192",
        messages: requestMessages,
        stream: true,
        temperature: 0.1,
        max_tokens: 200,
        frequency_penalty: 1.0,
        presence_penalty: 1.0,
        tools: this.functions,
      });

      for await (const event of events as any) {
        if (event.choices.length >= 1) {
          const delta = event.choices[0].delta;
          if (!delta) continue;

          if (delta.tool_calls && delta.tool_calls.length > 0 && !toolCallHandled) {
            const toolCall = delta.tool_calls[0];
            if (toolCall.id && toolCall.function?.name) {
              funcArguments += toolCall.function.arguments || "";
              funcCall = {
                id: toolCall.id,
                funcName: toolCall.function.name,
                arguments: {},
              };
              continue;
            }
          } else if (funcCall && funcArguments && !toolCallHandled) {
            funcCall.arguments = JSON.parse(funcArguments);
            const functionResult = await this.handleFunctionCall(funcCall.funcName, funcCall.arguments);

            let parsedResult: any;
            try {
              parsedResult = JSON.parse(functionResult);
            } catch {
              parsedResult = { error: "Invalid response format" };
            }

            let responseContent = "";
            if (parsedResult.available) {
              responseContent = `Great! ${parsedResult.message || 'That time slot is available.'}`;
              if (parsedResult.suggested_times && Array.isArray(parsedResult.suggested_times) && parsedResult.suggested_times.length > 0) {
                responseContent += ` I also have these alternative times available: ${parsedResult.suggested_times.join(", ")}.`;
              }
            } else if (parsedResult.success && funcCall.funcName === "ghl_lookup") {
              responseContent = parsedResult.message || "Contact information found.";
            } else {
              responseContent = `I'm sorry, that time slot isn't available. Let me suggest some alternatives.`;
              if (parsedResult.suggested_times && Array.isArray(parsedResult.suggested_times) && parsedResult.suggested_times.length > 0) {
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
            toolCallHandled = true;
            break;
          } else if (delta.content && !toolCallHandled) {
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
      if (funcCall && funcCall.funcName === "end_call") {
        const res: CustomLlmResponse = {
          response_type: "response",
          response_id: request.response_id,
          content: "Thank you for calling PestAway Solutions!",
          content_complete: true,
          end_call: true,
        };
        ws.send(JSON.stringify(res));
      }
    }
  }
}
