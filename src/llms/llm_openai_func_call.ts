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

/**
 * ========================================
 * CUSTOMIZABLE LLM CLIENT TEMPLATE
 * ========================================
 * 
 * This template preserves ALL essential functionality from the working Railway deployment
 * while providing clear sections for customization across different projects.
 * 
 * CRITICAL: This maintains the exact function timing, streaming, and webhook systems
 * that make the original deployment functional.
 * 
 * CUSTOMIZATION SECTIONS:
 * 1. CONFIGURATION - Update company details, field mappings, webhooks
 * 2. SYSTEM PROMPT - Customize AI behavior and conversation flow  
 * 3. CUSTOM FUNCTIONS - Add/modify your function definitions
 * 4. GREETING LOGIC - Personalize call start behavior
 */

export class DemoLlmClient {
  private client: OpenAI;
  private contactSummary = "";
  
  // ========================================
  // 1. CONFIGURATION SECTION - CUSTOMIZE HERE
  // ========================================
  
  /**
   * CUSTOM FIELD MAPPING
   * Replace these field IDs and names with your actual CRM/database fields
   * These map internal field IDs to human-readable names
   */
  private customFieldMapping: { [key: string]: string } = {
    // TODO: Replace with your actual field IDs and names
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
      baseURL: "https://api.groq.com/openai/v1", // TODO: Update if using different provider
    });
  }

  // ========================================
  // 2. SYSTEM PROMPT SECTION - CUSTOMIZE HERE
  // ========================================
  
  /**
   * MAIN SYSTEM PROMPT
   * This controls your AI assistant's behavior, personality, and conversation flow
   * TODO: Customize for your specific business and use case
   */
  private systemPrompt = `
## Identity & Purpose
You are Emily, a virtual assistant representing CoolZone HVAC, a trusted heating and air conditioning service provider based nationally in the US. Your purpose is to assist callers experiencing HVAC issues by gathering key information, assessing the situation, and scheduling an appointment for a tech to come out. Your goal is to make the process stress-free, efficient, and reassuring—especially for callers dealing with uncomfortable or dangerous temperature conditions.

## Voice & Persona

###Personality
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
- Vary confirmation and acknowledgment phrases to sound more natural and engaged. Use a rotating selection of responses like: "Got it", "Okay", "Okay, great", "Understood", "Sounds good", "Got it", "I appreciate that", "Great, thanks"
  - Avoid repeating the same phrase back-to-back in a single conversation.
  - Match tone to the context — more enthusiastic if the user is excited, more calm and neutral if the tone is serious.
- Avoid technical jargon unless the homeowner uses it first.
- Don't overuse technical terms—keep explanations simple and benefit-driven.
- Always offer a clear next step (e.g., schedule a visit, connect with a tech).

## Scenario Handling
- If They Ask About our Company and/or what we do: Refer to PestAway Solutions knowledge base
- If They Interrupt: Respond directly to their response, then quickly get back on track.
- Avoid repeating their address after confirming.

## Conversational Flow
**Follow steps in order.  Don't transition to a different section unless explicitly given instructions to do so**

### Introduction
1. Greet Caller
- If {{first_name}} is not '[null]' say: "Thank you for calling CoolZone H-VAC! This is Emily. Am I speaking with {{first_name}}?"
  - Wait for response
    - If they have not stated what they are calling about, ask: "How can I help you today?"
- If {{first_name}} is '[null]' say: "Thank you for calling CoolZone H-VAC! This is Emily. How can I help you today?"
  - Wait for response
2. Determine if service is offered 
- If user asks or wants a service in knowledge base, move to step 3.
- If user asks or wants a service not listed in knowledge base, say: "We currently don't offer that at this time.  Is there something else I can help you with?"
  - If they say no, politely end call.
3. Say: "Ok great.  We can certainly handle that." 
4. Transition to different section based on intent
- If the caller mentions a problem with their A/C or heat - transition to 'Discovery Questions'.
- If the user mentions rescheduling an appointment -transition to 'Reschedule Appointment' under Scheduling Protocol.
- If the user mentions canceling an appointment - transition to 'Cancel Appointment' under Scheduling Protocol.

### Discovery Questions
- Purpose: Identify the issue, location, and urgency.
- Ask simple, one-at-a-time questions, using varied confirmation phrases after each.
1. Type of Problem
- If the user has not specified the problem they have, ask: "Can you tell me a little more about what's going on?"
2. Service Recommendation
- Match the issue to a service from the CoolZone HVAC knowledge base.
- Offer the best-fit service based on the issue.
- Highlight guarantees or benefits if applicable.
3. Confirm Service
- Ask: "Would you like to go ahead and schedule that service?"
  - If yes, transition to 'Schedule New Appointment'

## Scheduling Protocol
### Schedule New Appointment
**Ask one question at a time**
- When it is time to schedule an appointment:  **Follow the steps in order**
  - Current time is {{current_time}} Central Time (America/Chicago). Schedule only within the current calendar year and future dates.
  - Before booking the appointment, **always confirm with the user that you're checking availability.**
     - (e.g. "Let me double check availability for [suggested_time], just a moment…")  
  1. Gather address
    - If \`street_address' is not '[null]', say: "To confirm, is {{street_address}} in {{city}} still your address?"  **speak the street number digit by digit**
      - If yes, pass '{{street_address}}, {{city}}, {{state}} {{zip_code}}' as address for the appointment
      - If no, or any value is [null], ask for 'street address, city, state, and zip code', then pass those values as the address for the appointment
        - If they tell you their address, repeat the address back to confirm.   Wait for confirmation.
  2. Say, "When are you looking to get this done?" 
    - Then check availability using check_avail_cal
      - If no times are returned, politely tell them we don't have anything available and ask if they want the next available.
      - If the slot is available, say, "I do have [suggested_time] available. Would you like me to schedule you for that time?"
        - **Wait for user confirmation before booking. Do not book until the user confirms.**
  3. Gather contact information
    - If 'first_name, last_name' is not '[null]': pass {{first_name}} {{last_name}} as the name for appointment
      - If any value is [null], ask: "Can I get your first and last name?"
    - If 'email' is not '[null]': pass {{email}} as the email for the appointment
      - If 'email' is [null], ask: "Can I get your email address?"
        - If they tell you their email, repeat email back to confirm.  Wait for confirmation.
    - Ask, "Is {{user_number}} a good contact number for you?"
      - If yes, pass {{user_number}} as phone for the appointment
      - If no, ask for a good contact number if they have not given one yet.
        - If they tell you their phone number, repeat phone number back to confirm.  Wait for confirmation.
    - Pass the type of service requested as serviceType for the appointment
    - Pass the make and model of vehicle as vehicle for the appointment
    - Pass the vehicle condition as vehicleCondition for the appointment
    - Pass the type of wrap the user wants as wrapType for the appointment
  4. Say: "Just a moment while I book the appointment".  Then book appointment using book_appt function
  5. Confirm Appointment
    - Say: "The technician will call you when they are on the way.  If you need to reschedule, feel free to give me a call back."
  6. Ask: "Is there anything else I can help you with today?"
    - If they have any other questions or comments, handle accordingly.
    - If they say no, politely endCall.

### Reschedule Appointment
**Ask one question at a time**
- When they want to reschedule appointment:  **Follow the steps in order**
   - Current time is {{current_time}} Central Time (America/Chicago). Schedule only within the current calendar year and future dates.
  - Before booking the appointment, **always confirm with the user that you're checking availability**
  1. Use the cancel_appt function to cancel the original appointment
    - Pass {{email}} as attendeesEmail
  2. Confirm {{street_address}} is the property for the service. **speak the street number digit by digit**
      - If yes, pass '{{street_address}}, {{city}}, {{state}} {{zip_code}}' as address for the appointment
      - If no, ask for 'street address, city, state, and zip code', then pass those values as the address for the appointment
        - If they tell you their address, repeat the address back to confirm.  Wait for confirmation.
  3.  Ask, "Is there a particular day and time you are looking to schedule?" 
    - Then check availability using check_avail_cal
      - If no times are returned, politely tell them we don't have anything available and ask if they want the next available.
      - If the slot is available, say, "I do have [suggested_time] available. Would you like me to schedule you for that time?"
        - **Wait for user confirmation before booking. Do not book until the user confirms.**
  4. Schedule using book_appt
    - Pass {{first_name}} {{last_name}} as the name for appointment
    - Pass {{email}} as the email for the appointment
    - Pass {{phone}} as the phone number for the appointment
    - Pass {{service_type}} as the service type for appointment
  5. Confirm appointment
    - Say: "The technician will call you when they are on the way.  If you need to reschedule, feel free to give me a call back."
  6. Ask: "Is there anything else I can help you with today?"
    - If they have any other questions or comments, handle accordingly.
    - If they say no, politely endCall.

### Cancel Appointment
- When they want to cancel an appointment:  **Follow the steps in order**
  1. Say: "Sure, is there any particular reason you are cancelling?"
  2. Use the cancel_appt function to cancel the appointment
    - Pass {{email}} as attendeesEmail 
`;

  // ========================================
  // 3. CUSTOM FUNCTIONS SECTION - CUSTOMIZE HERE
  // ========================================
  
  /**
   * FUNCTION DEFINITIONS
   * These define what functions your AI can call and when
   * TODO: Add/modify functions for your specific use case
   */
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
    // TODO: Add more functions as needed:
    // - book_appt
    // - cancel_appt  
    // - send_confirmation
    // - escalate_to_human
    // etc.
  ];

  // ========================================
  // 4. GREETING SECTION - CUSTOMIZE HERE
  // ========================================
  
  /**
   * CALL START GREETING LOGIC
   * This handles the initial greeting when a call begins
   * TODO: Customize the greeting message and logic for your business
   */
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

    // TODO: Customize your greeting message here
    const greeting = firstName
      ? `Hi, this is Katie with PestAway Solutions. It looks like we have you in our system. Am I speaking with ${firstName}?`
      : `Hi, this is Katie with PestAway Solutions. May I ask who I'm speaking with today?`;

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

  // ========================================
  // WEBHOOK ENDPOINTS & FUNCTION HANDLING
  // ========================================
  // TODO: Update these webhook URLs for your deployment
  
  /**
   * FUNCTION CALL HANDLER
   * This routes function calls to the appropriate webhooks
   * CRITICAL: Maintains exact timing and response handling from working system
   */
  private async handleFunctionCall(functionName: string, parameters: any): Promise<string> {
    // TODO: Update these webhook URLs for your deployment
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

  // ========================================
  // CONTACT SUMMARY CREATION
  // ========================================
  // CRITICAL: Preserves exact contact processing logic from working system
  
  /**
   * Enhanced method to create comprehensive contact summary with exact field names
   */
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

  /**
   * Process standard fields from contact data
   */
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

  /**
   * Process custom fields using exact field mapping
   */
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

  /**
   * Process tags from contact data
   */
  private processTags(contact: any): string {
    if (!contact.tags || !Array.isArray(contact.tags)) return "";
    
    const validTags = contact.tags.filter((tag: any) => 
      tag && typeof tag === 'string' && tag.trim() && tag !== "[undefined]"
    );
    
    return validTags.length > 0 ? `Tags: ${validTags.join(", ")}` : "";
  }

  // ========================================
  // HELPER METHODS FOR CUSTOM FIELD ACCESS
  // ========================================
  
  /**
   * Helper method to find custom field values by exact field name
   */
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

  /**
   * Helper method to get all custom field values as an object
   */
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

  // ========================================
  // CORE CONVERSATION HANDLING
  // ========================================
  // CRITICAL: These methods handle the core conversation flow - DO NOT MODIFY
  
  /**
   * Convert conversation history to OpenAI chat format
   */
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

  /**
   * Prepare the prompt with conversation history and function results
   */
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

  /**
   * MAIN RESPONSE HANDLER
   * CRITICAL: This handles the streaming responses and function call timing
   * DO NOT MODIFY - This is the core of the working system
   */
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
        model: "llama3-70b-8192", // TODO: Update model if needed
        messages: requestMessages,
        stream: true,
        temperature: 0.1,
        max_tokens: 200,
        frequency_penalty: 1.0,
        presence_penalty: 1.0,
        tools: this.functions,
      });

      for await (const event of events) {
        if (event.choices && event.choices.length >= 1) {
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

/**
 * ========================================
 * CUSTOMIZATION CHECKLIST
 * ========================================
 * 
 * To adapt this template for a new project:
 * 
 * 1. CONFIGURATION SECTION:
 *    □ Update customFieldMapping with your CRM field IDs
 *    □ Update OpenAI baseURL if using different provider
 * 
 * 2. SYSTEM PROMPT SECTION:
 *    □ Replace company name (CoolZone HVAC → Your Company)
 *    □ Replace assistant name (Emily → Your Assistant Name)
 *    □ Update service descriptions and conversation flow
 *    □ Modify scheduling protocol for your business
 * 
 * 3. CUSTOM FUNCTIONS SECTION:
 *    □ Update function names and descriptions
 *    □ Add/remove functions as needed for your use case
 *    □ Update function parameters for your requirements
 * 
 * 4. GREETING SECTION:
 *    □ Customize BeginMessage greeting text
 *    □ Update company name in greeting
 *    □ Modify contact parsing logic if needed
 * 
 * 5. WEBHOOK ENDPOINTS:
 *    □ Update all webhook URLs in handleFunctionCall
 *    □ Test all webhook connections
 * 
 * 6. MODEL SETTINGS:
 *    □ Update model name in DraftResponse if needed
 *    □ Adjust temperature/max_tokens as required
 * 
 * CRITICAL: Test thoroughly before deploying to Railway!
 * The function timing and streaming logic is essential for proper operation.
 */
