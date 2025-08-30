import OpenAI from "openai";

export class AIService {
  private openaiClient: OpenAI;
  private conversationContexts = new Map<string, any[]>();

  constructor() {
    this.openaiClient = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || ''
    });
  }

  async processConversation(userId: string, conversationId: string, message: string, context: any = {}) {
    try {
      // Get conversation context
      const conversationContext = this.conversationContexts.get(conversationId) || [];
      
      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(context);
      
      // Prepare messages for OpenAI
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationContext,
        { role: "user", content: message }
      ];

      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-5",
        messages: messages as any,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = response.choices[0].message.content || '';

      // Update conversation context
      conversationContext.push(
        { role: "user", content: message },
        { role: "assistant", content: aiResponse }
      );

      // Keep only last 10 messages for context
      if (conversationContext.length > 20) {
        conversationContext.splice(0, conversationContext.length - 20);
      }

      this.conversationContexts.set(conversationId, conversationContext);

      return aiResponse;
    } catch (error) {
      console.error('Error processing conversation:', error);
      throw new Error('Failed to process conversation with AI');
    }
  }

  private buildSystemPrompt(context: any): string {
    const assistantName = context.assistantName || 'Asistente IA';
    
    return `Eres ${assistantName}, un asistente de ventas inmobiliarias experto. Tu objetivo es ayudar a los clientes a encontrar la propiedad perfecta de manera conversacional y humana.

PERSONALIDAD:
- Profesional pero amigable
- Empático y consultivo
- Orientado a soluciones
- Paciente y detallado

PROCESO DE CALIFICACIÓN:
1. Saludo personalizado
2. Determinar tipo de búsqueda (compra/alquiler)
3. Establecer presupuesto y moneda
4. Identificar ubicación preferida
5. Determinar características requeridas
6. Mostrar opciones relevantes
7. Agendar visita si hay interés

REGLAS:
- Siempre pregunta antes de mostrar propiedades
- Máximo 3 propiedades por respuesta
- Incluye detalles relevantes cuando muestres propiedades
- Usa información actualizada del CRM
- Ofrece agendar visitas cuando hay interés
- Si el cliente quiere hablar con una persona real, indica que puedes transferir la conversación

FORMATO DE RESPUESTA:
- Usa emojis apropiados pero con moderación
- Mantén un tono profesional pero cercano
- Haz preguntas específicas para entender mejor las necesidades
- Proporciona información valiosa en cada respuesta`;
  }

  async generatePropertyRecommendations(userPreferences: any, availableProperties: any[]) {
    try {
      const prompt = `Basándote en las siguientes preferencias del cliente:
${JSON.stringify(userPreferences, null, 2)}

Y las siguientes propiedades disponibles:
${JSON.stringify(availableProperties.slice(0, 10), null, 2)}

Recomienda las 3 mejores propiedades que mejor se ajusten a las necesidades del cliente. 
Responde en formato JSON con esta estructura:
{
  "recommendations": [
    {
      "propertyId": "string",
      "matchScore": number,
      "reasons": ["reason1", "reason2"],
      "highlights": "string"
    }
  ]
}`;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      return JSON.parse(response.choices[0].message.content || '{"recommendations": []}');
    } catch (error) {
      console.error('Error generating property recommendations:', error);
      throw new Error('Failed to generate property recommendations');
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Create a temporary file for the audio
      const tempFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
      
      const transcription = await this.openaiClient.audio.transcriptions.create({
        file: tempFile,
        model: "whisper-1",
      });

      return transcription.text;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error('Failed to transcribe audio');
    }
  }

  async analyzeImage(imageBase64: string): Promise<string> {
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analiza esta imagen en el contexto de bienes raíces. Describe lo que ves y si podría ser relevante para una búsqueda de propiedades."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ],
          },
        ],
        max_tokens: 300,
      });

      return response.choices[0].message.content || 'No pude analizar la imagen';
    } catch (error) {
      console.error('Error analyzing image:', error);
      throw new Error('Failed to analyze image');
    }
  }

  async detectIntent(message: string): Promise<{
    intent: string;
    confidence: number;
    entities?: any;
  }> {
    try {
      const prompt = `Analiza el siguiente mensaje de un cliente de bienes raíces y determina la intención principal:

Mensaje: "${message}"

Posibles intenciones:
- "search_property": buscar propiedades
- "schedule_appointment": agendar cita
- "ask_question": hacer pregunta general
- "request_info": solicitar información específica
- "escalate_human": hablar con persona real
- "greeting": saludo
- "complaint": queja o problema
- "goodbye": despedida

Responde en formato JSON:
{
  "intent": "string",
  "confidence": number (0-1),
  "entities": {
    "budget": number_or_null,
    "location": "string_or_null",
    "property_type": "string_or_null",
    "urgency": "low|medium|high"
  }
}`;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      return JSON.parse(response.choices[0].message.content || '{"intent": "ask_question", "confidence": 0.5}');
    } catch (error) {
      console.error('Error detecting intent:', error);
      return { intent: "ask_question", confidence: 0.5 };
    }
  }

  clearConversationContext(conversationId: string) {
    this.conversationContexts.delete(conversationId);
  }
}

export const aiService = new AIService();
