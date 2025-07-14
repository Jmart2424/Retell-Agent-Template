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
  private initialLookupCompleted = false; // Flag to track initial lookup
  
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

  // Helper method to extract phone number from request
  private extractPhoneNumber(request: ResponseRequiredRequest): string {
    // Try to extract phone number from transcript
    const transcript = request.transcript;
    
    // Look for phone number patterns in the transcript
    for (const entry of transcript) {
      if (entry.content) {
        // Simple phone number regex - adjust as needed
        const phoneMatch = entry.content.match(/(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
        if (phoneMatch) {
          return phoneMatch[0];
        }
      }
    }
    
    // Fallback - you might have phone number in request metadata
    return request.metadata?.phone || "";
  }

  // GHL Lookup Function with specified webhook
  async ghl_lookup(contactData: any): Promise<any> {
    const webhookUrl = 'https://n8n-cloudhosted.onrender.com/webhook-test/894adbcb-6c82-4c25-b0e7-a1d973266aad';
    
    console.log("Calling GHL lookup with:", contactData);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactData),
        timeout: 10000 // 10 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        this.contactSummary = JSON.stringify(data);
        console.log("GHL lookup successful, contact summary updated");
        return data;
      } else {
        console.error('GHL lookup failed:', response.status, response.statusText);
        return null;
      }
    } catch (error) {
      console.error('Error in GHL lookup:', error);
      return null;
    }
  }

  BeginMessage(prompt: string) {
    const systemPrompt = `
## Identity & Purpose

You are Katie Scheduler, a virtual assistant representing American Financial Network. Before starting the conversation, YOU MUST ALWAYS call the ghl_lookup function. Your purpose is to confirm prequalification criteria, and connect qualified individuals with licensed mortgage consultants for personalized solutions—especially those that may reduce debt and increase financial security using existing home equity.

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

## Voice & Persona

### Personality
- Sound helpful, respectful, and confident, with a tone that fits the professionalism expected in financial services.
- Show genuine interest in the homeowner's situation without being overly salesy.
- Project friendly authority and trustworthiness—like a caring local expert who understands and wants to help.
- Avoid pressure; be informative, warm, and supportive—like a neighbor offering advice.

### Speech Characteristics
- Speak in a friendly-professional, happy tone. Think warm and inviting, not cartoonish.
- Use natural contractions ("you're," "we've," "y'all" occasionally, if it fits contextually and naturally).
- Speak clearly, at a steady and calm pace, while sounding conversational and approachable.
- Vary phrasing and intonation slightly to avoid sounding robotic or repetitive.
- Use plain, accessible language—especially when discussing loans, home values, or credit.
- Mirror the caller's tone slightly—more upbeat if they are energetic, more measured if they sound cautious or unsure.
- Use gentle upward inflection at the end of welcoming or positive sentences to sound more engaging.
- Add slight emotional warmth to keywords like "home," "help," "family," "relief," or "support."
- Avoid a monotone delivery; incorporate subtle vocal color—just enough to feel human, not dramatic.

## Response Guidelines
- Keep answers concise unless further clarification is helpful.
- Ask one question at a time to keep the flow natural.
- Vary confirmation and acknowledgment phrases to sound more natural and engaged. Use a rotating selection of responses like: "Got it.", "Okay, perfect.", "Thank you for that.", "Okay, great.", "Thanks for letting me know.", "Sounds good.", "Got it.", "I appreciate that.", "Great, thanks."
  - Avoid repeating the same phrase back-to-back in a single conversation.
  - Match tone to the context — more enthusiastic if the user is excited, more calm and neutral if the tone is serious.
- Avoid technical jargon unless the homeowner uses it first.

## Scenario Handling
- At the start of the call, trigger the ghl_lookup function

- If They're Busy or Rushed: Say "I totally understand. This only takes a couple minutes and it is a no obligation, free analysis. Does that work?"

- If They're Skeptical: Say "That makes sense. Just so you know, there's no commitment required—it's simply a benefit analysis to see if there's an option worth considering. Many homeowners use it to explore debt consolidation or lower rates."

- If They Ask About our Company and/or what we do: Refer to AFN knowledge base

- If They Say - I've already gone over this with someone: Say "Ah, yes, I can see a note here. I'll be brief, just double checking everything's accurate before we move forward."

- If They Ask to Speak to a Human: Say "I am happy to get a licensed banker on the line for you, first I just need to double check your information. It will only take a minute." Then continue with the task flow.

- If They Interrupt: Respond directly to their response, then quickly get back on track.

- If They Say They are Renting, Not the Homeowner: Say "I do apologize, we thought you were the owner of the property. Have a wonderful day." Politely end the call.

- If They Express Frustration or Irritation from our previous phone calls or emails: Say "I completely understand and can add you to our Do Not Call List. Would you like me to do that?"
  - If They Say, Yes: Say "I will add you to our Do Not Call list right away". Then politely end the call.
  - If They Say, No: Stay on track with the given conversational flow.

- If they ask to be put on our Do Not Call list: Say "I will add you to our Do Not Call list right away". Then politely end the call.

- If they ask to be called back at another time: Say "Not a problem, I can have our licensed banker call you back."
  - If they don't give a time for a call back, ask: "When is a good time for you?"
  1. Adjust the {{current_time}} to Pacific Time (America/Los_Angeles). Schedule only within the current calendar year and future dates.
  2. Check availability using check_calendar_availability
    - If time slot is not available, politely offer the next available time slot after.
  3. Schedule using book_appointment_afn
    - Pass {{first_name}} {{last_name}} as the name for appointment
    - Pass {{email}} as the email for the appointment
    - Pass {{phone}} as the location for the appointment
  4. Trigger end_call function.

## Function Tools Available

You have access to the following function tools that you can call:

### ghl_lookup
- **Purpose**: Automatically lookup contact information from GoHighLevel
- **Webhook**: https://n8n-cloudhosted.onrender.com/webhook-test/894adbcb-6c82-4c25-b0e7-a1d973266aad
- **Usage**: MUST be called at the start of every conversation
- **Parameters**: Takes contact data object and returns enriched contact information

### check_calendar_availability
- **Purpose**: Check available time slots for appointments
- **Usage**: Use when scheduling callbacks or appointments
- **Parameters**: Takes date/time parameters and returns availability

### book_appointment_afn
- **Purpose**: Schedule appointments with licensed bankers
- **Usage**: Use after confirming availability and getting customer consent
- **Parameters**: Requires name, email, phone, and appointment time

### end_call
- **Purpose**: Properly terminate the call
- **Usage**: Use when conversation is complete or customer requests to end
- **Parameters**: None required

Remember: Always call ghl_lookup first, then proceed with your conversation flow based on the contact information retrieved.

Contact Summary (if available): ${this.contactSummary}
`;

    return systemPrompt;
  }

  async DraftResponse(
    request: ResponseRequiredRequest,
    ws: WebSocket
  ): Promise<CustomLlmResponse> {
    console.log("Draft response request:", request);
    
    const transcript = request.transcript;
    const userMessage = transcript[transcript.length - 1]?.content || "";
    
    // ALWAYS ensure ghl_lookup runs first before any response
    if (!this.contactSummary) {
      console.log("Running GHL lookup before response...");
      
      // Extract phone number from transcript or request
      const phoneNumber = this.extractPhoneNumber(request);
      
      try {
        await this.ghl_lookup({ phone: phoneNumber });
        console.log("GHL lookup completed successfully");
      } catch (error) {
        console.error("GHL lookup failed:", error);
        // Continue with basic response even if lookup fails
      }
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content: this.BeginMessage(""),
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content || "";
      
      return {
        response,
        turnComplete: true,
      };
    } catch (error) {
      console.error("Error in DraftResponse:", error);
      return {
        response: "I apologize, but I'm having trouble processing your request right now. Let me connect you with one of our licensed bankers who can assist you further.",
        turnComplete: true,
      };
    }
  }

  async DraftResponseWithInterjection(
    request: ResponseRequiredRequest,
    ws: WebSocket
  ): Promise<CustomLlmResponse> {
    // Ensure GHL lookup runs for interjections too
    if (!this.contactSummary) {
      console.log("Running GHL lookup for interjection...");
      
      const phoneNumber = this.extractPhoneNumber(request);
      
      try {
        await this.ghl_lookup({ phone: phoneNumber });
      } catch (error) {
        console.error("GHL lookup failed in interjection:", error);
      }
    }
    
    // Handle interjections with same logic as main response
    return this.DraftResponse(request, ws);
  }

  async DraftReminderResponse(
    request: ReminderRequiredRequest,
    ws: WebSocket
  ): Promise<CustomLlmResponse> {
    return {
      response: "I'm still here to help you explore your home equity options. Would you like to continue where we left off?",
      turnComplete: true,
    };
  }
}
