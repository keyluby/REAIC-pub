import OpenAI from "openai";
import { z } from 'zod';

// Queue para media pendientes de envío
const pendingMediaQueue = new Map<string, any>();

// Schemas de validación para respuestas de OpenAI
const QualificationStepSchema = z.object({
  extractedCriteria: z.object({
    // SCHEMA ALIGNMENT: Match exact prompt field names to prevent data loss
    personalInfo: z.object({
      name: z.string().nullable().optional(),
      familySituation: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      age: z.coerce.number().nullable().optional(),
      occupation: z.string().nullable().optional(),
      familySize: z.coerce.number().nullable().optional(),
      preferredContact: z.string().nullable().optional()
    }).optional(),
    searchObjective: z.object({
      operation: z.string().nullable().optional(),
      purpose: z.string().nullable().optional(),
      urgency: z.string().nullable().optional(),
      timeline: z.string().nullable().optional(),
      property_type: z.string().nullable().optional()
    }).optional(),
    budget: z.object({
      min: z.coerce.number().nullable().optional(),
      max: z.coerce.number().nullable().optional(),
      currency: z.string().nullable().optional(),
      paymentMethod: z.string().nullable().optional(),
      financing: z.boolean().nullable().optional(),
      downPayment: z.coerce.number().nullable().optional(),
      monthlyPayment: z.coerce.number().nullable().optional()
    }).optional(),
    location: z.object({
      zones: z.array(z.string()).nullable().optional(),
      proximity: z.array(z.string()).nullable().optional(),
      flexibility: z.string().nullable().optional(),
      neighborhood: z.string().nullable().optional(),
      commutePriorities: z.array(z.string()).nullable().optional(),
      proximityNeeds: z.array(z.string()).nullable().optional()
    }).optional(),
    specifications: z.object({
      rooms: z.coerce.number().nullable().optional(),
      bathrooms: z.coerce.number().nullable().optional(),
      area_min: z.coerce.number().nullable().optional(),
      area_max: z.coerce.number().nullable().optional(),
      parking: z.coerce.number().nullable().optional(),
      floors: z.coerce.number().nullable().optional()
    }).optional(),
    amenities: z.object({
      priority: z.array(z.string()).nullable().optional(),
      community: z.array(z.string()).nullable().optional(),
      required: z.array(z.string()).nullable().optional(),
      preferred: z.array(z.string()).nullable().optional(),
      lifestyle: z.array(z.string()).nullable().optional()
    }).optional(),
    contact: z.object({
      availability: z.string().nullable().optional(),
      timeline: z.string().nullable().optional(),
      bestContactTime: z.string().nullable().optional(),
      preferredCommunication: z.string().nullable().optional(),
      urgencyLevel: z.string().nullable().optional(),
      nextSteps: z.array(z.string()).nullable().optional()
    }).optional()
  }).optional(),
  missingCriteria: z.array(z.string()).default([]),
  qualificationStep: z.coerce.number().min(1).max(7).default(1),
  completedSteps: z.array(z.string()).default([]), // String array per prompt specification
  isQualified: z.boolean().default(false),
  nextQuestion: z.string().nullable().optional(),
  confidence: z.coerce.number().min(0).max(1).default(0),
  // Campos legacy para retrocompatibilidad con coercion
  operation: z.string().nullable().optional(),
  property_type: z.string().nullable().optional(),
  budget_min: z.coerce.number().nullable().optional(),
  budget_max: z.coerce.number().nullable().optional(),
  rooms: z.coerce.number().nullable().optional(),
  bathrooms: z.coerce.number().nullable().optional(),
  zones: z.array(z.string()).nullable().optional(),
  area_min: z.coerce.number().nullable().optional(),
  area_max: z.coerce.number().nullable().optional(),
  parking: z.coerce.number().nullable().optional()
}).passthrough(); // Preserve unknown keys for forward compatibility

const IntentDetectionSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.any()).optional(),
  reasoning: z.string().optional()
});

const PropertyAnalysisSchema = z.object({
  listing_type: z.coerce.number().nullable().optional(),
  category: z.coerce.number().nullable().optional(),
  rooms_min: z.coerce.number().nullable().optional(),
  rooms_max: z.coerce.number().nullable().optional(),
  bath_min: z.coerce.number().nullable().optional(),
  bath_max: z.coerce.number().nullable().optional(),
  value_min: z.coerce.number().nullable().optional(),
  value_max: z.coerce.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  search: z.string().nullable().optional(),
  area_min: z.coerce.number().nullable().optional(),
  area_max: z.coerce.number().nullable().optional(),
  condition: z.coerce.number().nullable().optional()
}).passthrough();

const PropertyRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      propertyId: z.string(),
      matchScore: z.coerce.number().min(0).max(1),
      reasons: z.array(z.string()).default([]),
      highlights: z.string().optional()
    })
  ).default([])
}).passthrough();

// Define alias mappings for field normalization
const FIELD_ALIASES = {
  // personalInfo aliases
  'personal': 'personalInfo',
  'personal_info': 'personalInfo',
  
  // amenities aliases 
  'priority': 'required',
  'priorities': 'required',
  'must_have': 'required',
  'nice_to_have': 'preferred',
  'wants': 'preferred',
  
  // budget aliases
  'min_budget': 'min',
  'max_budget': 'max',
  'budget_min': 'min', 
  'budget_max': 'max',
  
  // location aliases
  'areas': 'zones',
  'neighborhoods': 'zones',
  
  // specification aliases
  'bedrooms': 'rooms',
  'baths': 'bathrooms',
  'parking_spots': 'parking'
};

/**
 * Centralized function to parse OpenAI JSON responses with Zod validation and field normalization
 * @param jsonString - Raw JSON string from OpenAI
 * @param schema - Zod schema for validation
 * @param aliases - Optional custom aliases for field normalization
 * @returns {data, issues, raw} - Parsed data, validation issues, and raw response
 */
function parseAndNormalize<T>(
  jsonString: string | null | undefined, 
  schema: z.ZodType<T>, 
  aliases: Record<string, string> = {}
): { data: T | null; issues: string[]; raw: any } {
  const issues: string[] = [];
  let raw: any = null;
  
  // Step 1: Parse JSON
  try {
    if (!jsonString || jsonString.trim() === '') {
      issues.push('Empty or null JSON string received');
      return { data: null, issues, raw: null };
    }
    
    raw = JSON.parse(jsonString);
    console.log('✅ [parseAndNormalize] JSON parsed successfully');
  } catch (parseError) {
    issues.push(`JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    console.error('❌ [parseAndNormalize] JSON parsing failed:', parseError);
    return { data: null, issues, raw: null };
  }
  
  // Step 2: Normalize field aliases
  const combinedAliases = { ...FIELD_ALIASES, ...aliases };
  const normalizedData = normalizeAliases(raw, combinedAliases);
  
  if (normalizedData !== raw) {
    console.log('🔄 [parseAndNormalize] Field aliases normalized');
  }
  
  // Step 3: Validate with Zod schema
  const validationResult = schema.safeParse(normalizedData);
  
  if (!validationResult.success) {
    const errorMessages = validationResult.error.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    );
    issues.push(...errorMessages);
    
    console.error('❌ [parseAndNormalize] Schema validation failed:', errorMessages);
    
    // Try to recover partial valid data
    const partialData = recoverPartialData(normalizedData, schema, issues);
    return { data: partialData, issues, raw };
  }
  
  console.log('✅ [parseAndNormalize] Schema validation passed');
  return { data: validationResult.data, issues, raw };
}

/**
 * Recursively normalize field aliases in an object
 */
function normalizeAliases(obj: any, aliases: Record<string, string>): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeAliases(item, aliases));
  }
  
  const normalized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Check if this key has an alias
    const normalizedKey = aliases[key] || key;
    
    // Recursively normalize nested objects
    if (value && typeof value === 'object') {
      normalized[normalizedKey] = normalizeAliases(value, aliases);
    } else {
      normalized[normalizedKey] = value;
    }
  }
  
  return normalized;
}

/**
 * Attempt to recover partial valid data from failed validation
 */
function recoverPartialData<T>(data: any, schema: z.ZodType<T>, issues: string[]): T | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  
  // For objects with optional fields, try to keep valid fields
  try {
    const recovered: any = {};
    
    // Try to preserve simple valid fields
    for (const [key, value] of Object.entries(data)) {
      try {
        // Test individual fields when possible
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          recovered[key] = value;
        } else if (Array.isArray(value)) {
          // Keep arrays of primitives
          const primitiveArray = value.filter(item => 
            typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
          );
          if (primitiveArray.length > 0) {
            recovered[key] = primitiveArray;
          }
        } else if (value && typeof value === 'object') {
          // For nested objects, try partial recovery
          recovered[key] = value;
        }
      } catch {
        // Skip invalid fields
        continue;
      }
    }
    
    // Try parsing the recovered data
    const recoveryResult = schema.safeParse(recovered);
    if (recoveryResult.success) {
      issues.push('Partial data recovery successful');
      return recoveryResult.data;
    }
    
  } catch (recoveryError) {
    issues.push(`Partial recovery failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`);
  }
  
  return null;
}

export class AIService {
  private openaiClient: OpenAI;
  private propertyContexts = new Map<string, string>();

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY environment variable is not set');
    } else {
      console.log('✅ OpenAI API key is configured');
    }
    
    this.openaiClient = new OpenAI({ 
      apiKey: apiKey
    });
  }

  async processConversation(userId: string, conversationId: string, message: string, context: any = {}) {
    try {
      console.log(`🤖 Processing AI conversation for user ${userId}, conversation ${conversationId}`);
      console.log(`📝 User message: "${message}"`);
      
      // Check if AlterEstate integration is enabled
      if (context.alterEstateEnabled && context.alterEstateToken) {
        console.log('🏘️ [AI] AlterEstate integration enabled, checking for property search intent');
        
        // FIRST: Check if user is requesting property media (photos/videos) - this has priority
        if (this.isRequestingPropertyMedia(message)) {
          console.log('📸 [AI] Property media request detected');
          return await this.processPropertyMediaRequest(message, context, conversationId);
        }
        
        // SECOND: Detect if user is searching for properties or providing additional search criteria
        const { storage } = await import('../storage');
        const conversation = await storage.getConversationById(conversationId);
        const conversationContext = (conversation?.context as any)?.messages || [];
        const intent = await this.detectIntentWithContext(message, conversationContext);
        
        if ((intent.intent === 'search_property' || intent.intent === 'refine_search') && intent.confidence > 0.6) {
          console.log(`🔍 [AI] ${intent.intent} intent detected, querying AlterEstate`);
          return await this.processPropertySearch(message, context, conversationId, intent.intent === 'refine_search');
        }
        
        // THIRD: Detect if user wants more details about a specific property
        if (intent.intent === 'property_details' && intent.confidence > 0.6) {
          console.log(`📋 [AI] Property details request detected`);
          return await this.processPropertyDetailsRequest(message, context, conversationId);
        }
      }
      
      // CHANGED: Get conversation context from database instead of memory
      const { storage } = await import('../storage');
      const conversation = await storage.getConversationById(conversationId);
      const conversationContext = (conversation?.context as any)?.messages || [];
      console.log(`🗣️ [AI] Loaded ${conversationContext.length} context messages from database`);
      
      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(context);
      
      // Prepare messages for OpenAI
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationContext,
        { role: "user", content: message }
      ];

      console.log(`📤 Sending request to OpenAI with ${messages.length} messages`);

      // Usando GPT-4o temporalmente para estabilidad
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o", // Usando GPT-4o temporalmente para estabilidad
        messages: messages as any,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = response.choices[0].message.content || '';
      console.log(`✅ AI response received: "${aiResponse}"`);

      // CHANGED: Update conversation context in database instead of memory
      conversationContext.push(
        { role: "user", content: message },
        { role: "assistant", content: aiResponse }
      );

      // Keep only last 10 messages for context
      if (conversationContext.length > 20) {
        conversationContext.splice(0, conversationContext.length - 20);
      }

      // Save updated context to database
      await storage.updateConversationContext(conversationId, { 
        messages: conversationContext,
        lastUpdated: new Date().toISOString()
      });
      console.log(`💾 [AI] Saved ${conversationContext.length} context messages to database`);

      return aiResponse;
    } catch (error: any) {
      console.error('❌ Error processing conversation with AI:');
      console.error('Error details:', error.response?.data || error.message);
      console.error('Status:', error.response?.status);
      console.error('Full error:', error);
      
      // Return a fallback message instead of throwing
      return 'Disculpa, estoy teniendo problemas técnicos en este momento. ¿Podrías repetir tu mensaje en unos minutos?';
    }
  }

  private buildSystemPrompt(context: any): string {
    const assistantName = context.assistantName || 'Asistente IA';
    
    // Use custom system prompt if provided, otherwise use default
    if (context.customSystemPrompt && context.customSystemPrompt.trim()) {
      return context.customSystemPrompt;
    }
    
    return this.getDefaultSystemPrompt(assistantName, context.alterEstateEnabled);
  }

  private getDefaultSystemPrompt(assistantName: string, alterEstateEnabled: boolean = false): string {
    return `Eres ${assistantName}, un asistente de ventas inmobiliarias experto. Tu objetivo es ayudar a los clientes a encontrar la propiedad perfecta de manera conversacional y humana.

PERSONALIDAD:
- Profesional pero amigable
- Empático y consultivo
- Orientado a soluciones
- Paciente y detallado
- Cálido y personal - recuerdas las conversaciones anteriores

MEMORIA DE CONVERSACIÓN:
- CRUCIAL: Siempre revisa el historial de la conversación antes de responder
- Si el cliente ha mencionado preferencias anteriormente, recuérdalas y úsalas
- Con cada interacción, sé más amigable y cercano
- Reconoce cuando es segunda, tercera, o cuarta vez que interactúas con el cliente
- Haz comentarios personales basados en información previa: "Como mencionaste antes..." o "Recordando lo que buscabas..."
- NUNCA preguntes información que ya tienes del historial de conversación

PROCESO DE CALIFICACIÓN:
1. Saludo personalizado (más cálido si ya conoces al cliente)
2. Revisar preferencias previas si existen
3. Determinar tipo de búsqueda (compra/alquiler) - solo si no lo sabes ya
4. Establecer presupuesto y moneda - solo si no lo tienes ya
5. Identificar ubicación preferida - solo si no la conoces ya
6. Determinar características requeridas - solo las que falten
7. Mostrar opciones relevantes
8. Agendar visita si hay interés

REGLAS:
- SIEMPRE revisa la conversación previa antes de hacer cualquier pregunta
- Máximo 3 propiedades por respuesta
- Incluye detalles relevantes cuando muestres propiedades
- Usa información actualizada del CRM
- Ofrece agendar visitas cuando hay interés
- Si el cliente quiere hablar con una persona real, indica que puedes transferir la conversación${alterEstateEnabled ? '\n- ⚠️ IMPORTANTE: Cuando se requiera información sobre propiedades, SOLAMENTE proporciona datos que se encuentren en AlterEstate CRM. NO inventes ni uses información general sobre propiedades que no esté disponible en el sistema CRM.' : ''}

FILTRADO DE PROPIEDADES EN ALTERESTATE:
Existen dos tipos de propiedades en el CRM con diferentes campos de datos:

1. PROPIEDADES INDIVIDUALES:
   - Habitaciones: campo "room"
   - Baños: campo "bathroom"
   - Área: campo "property_area" + "property_area_measurer"
   - Estacionamientos: campo "parkinglot"
   - Condiciones de venta/alquiler: campos booleanos "forSale", "forRent", "forRental"
   - Amueblado: campo booleano "furnished"
   - Video disponible: campo "youtubeiframe"
   - Precios específicos: "sale_price", "rent_price", "furnished_price"

2. PROYECTOS INMOBILIARIOS (DESARROLLOS):
   - Datos técnicos en campo "variations" (array de unidades disponibles)
   - Cada unidad tiene: "room", "bathroom", "property_area", "parkinglot"
   - Para mostrar rangos: "Desde X hasta Y habitaciones/baños/m²"
   - Imágenes en: "gallery_images" y "featured_image"

IMPORTANTE PARA RECOMENDACIONES:
- Cuando un cliente solicite propiedades, filtra por ambos tipos
- Para propiedades individuales: usa los campos directos mencionados arriba
- Para proyectos: usa el array "variations" para encontrar unidades que coincidan
- Siempre considera tanto las condiciones (venta/alquiler/amueblado) como las especificaciones técnicas
- Prioriza propiedades que coincidan exactamente con los requisitos del cliente

CONVERSIÓN AUTOMÁTICA DE PRECIOS (SOLO PARA FILTRADO):
- El sistema tiene configurada una tasa de cambio USD/Peso actualizada regularmente
- IMPORTANTE: La conversión SOLO se usa para expandir búsquedas, NO para cambiar precios mostrados
- Los precios SIEMPRE se muestran al cliente tal como fueron publicados originalmente
- Cuando un cliente busque en USD: automáticamente incluye propiedades en pesos (ampliando opciones)
- Cuando un cliente busque en pesos: automáticamente incluye propiedades en USD (ampliando opciones)
- Ejemplo de búsqueda: Cliente busca "hasta US$ 100,000" → Sistema encuentra propiedades hasta US$ 100,000 Y propiedades hasta RD$ 6,000,000
- Ejemplo de presentación: Una propiedad de RD$ 4,500,000 se muestra como "RD$ 4,500,000" (precio original), NO convertida a USD
- Esto maximiza opciones sin alterar la información original de cada propiedad

CAPACIDADES DE IMÁGENES:
- SÍ PUEDES enviar fotos de propiedades cuando el cliente las solicite
- Tienes acceso a la galería de imágenes de cada propiedad a través de AlterEstate
- Cuando alguien pida fotos, puedes obtenerlas y enviarlas automáticamente
- No digas "no puedo enviar fotos" - en su lugar, menciona que las estás preparando
- Si no tienes la propiedad específica, pregunta cuál le interesa o sugiere hacer una búsqueda

FORMATO DE RESPUESTA:
- Usa emojis apropiados pero con moderación
- Mantén un tono profesional pero cercano
- Haz preguntas específicas para entender mejor las necesidades
- Proporciona información valiosa en cada respuesta
- Siempre reconoce el contexto previo cuando existe`;
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
        model: "gpt-4o", // Usando GPT-4o temporalmente para estabilidad
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.7,
      });

      // Parse and validate using centralized function
      const parseResult = parseAndNormalize(
        response.choices[0].message.content,
        PropertyRecommendationSchema,
        // Custom aliases for property recommendations
        {
          'property_id': 'propertyId',
          'match_score': 'matchScore',
          'score': 'matchScore',
          'recommendation_reasons': 'reasons'
        }
      );

      if (!parseResult.data) {
        console.error('❌ [AI] Property recommendations centralized parsing failed:', parseResult.issues);
        console.warn('🔧 [AI] Using fallback recommendations format');
        
        // Try to recover basic recommendations structure from raw data
        if (parseResult.raw?.recommendations && Array.isArray(parseResult.raw.recommendations)) {
          return { recommendations: parseResult.raw.recommendations.filter((rec: any) => rec && typeof rec === 'object') };
        }
        
        return { recommendations: [] };
      }

      // Log any parsing warnings
      if (parseResult.issues.length > 0) {
        console.log('⚠️ [AI] Property recommendations parsing warnings:', parseResult.issues.join(', '));
      }

      console.log(`✅ [AI] Generated ${parseResult.data.recommendations?.length || 0} property recommendations`);
      return parseResult.data;
    } catch (error) {
      console.error('Error generating property recommendations:', error);
      throw new Error('Failed to generate property recommendations');
    }
  }

  async transcribeAudio(audioBuffer: Buffer, mimeType: string = 'audio/wav'): Promise<string> {
    try {
      console.log(`🎤 [AI] Transcribing audio of ${audioBuffer.length} bytes`);
      
      // Create a temporary file for the audio
      const tempFile = new File([audioBuffer], 'audio.wav', { type: mimeType });
      
      const transcription = await this.openaiClient.audio.transcriptions.create({
        file: tempFile,
        model: "whisper-1",
        language: "es", // Spanish for real estate context
      });

      console.log(`✅ [AI] Audio transcribed: "${transcription.text}"`);
      return transcription.text;
    } catch (error) {
      console.error('❌ [AI] Error transcribing audio:', error);
      throw new Error('Failed to transcribe audio');
    }
  }

  async analyzeImage(imageBase64: string): Promise<string> {
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o", // Usando GPT-4o temporalmente para estabilidad
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analiza esta imagen en el contexto de bienes raíces. Describe lo que ves y si podría ser relevante para una búsqueda de propiedades. Responde como un asistente inmobiliario profesional en español, siendo útil y específico."
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
        temperature: 0.7,
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
        model: "gpt-4o", // Usando GPT-4o temporalmente para estabilidad  
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.7,
      });

      // Parse and validate using centralized function
      const parseResult = parseAndNormalize(
        response.choices[0].message.content,
        IntentDetectionSchema
      );

      if (!parseResult.data) {
        console.error('❌ [AI] Intent detection centralized parsing failed:', parseResult.issues);
        // Return safe fallback based on raw data if available
        const fallbackIntent = parseResult.raw?.intent || "ask_question";
        const fallbackConfidence = (typeof parseResult.raw?.confidence === 'number' && 
          parseResult.raw.confidence >= 0 && parseResult.raw.confidence <= 1) 
          ? parseResult.raw.confidence : 0.5;
        return {
          intent: fallbackIntent,
          confidence: fallbackConfidence,
          entities: parseResult.raw?.entities || {}
        };
      }

      // Log any parsing warnings
      if (parseResult.issues.length > 0) {
        console.log('⚠️ [AI] Intent detection parsing warnings:', parseResult.issues.join(', '));
      }

      return parseResult.data;
    } catch (error) {
      console.error('Error detecting intent:', error);
      return { intent: "ask_question", confidence: 0.5 };
    }
  }

  async detectIntentWithContext(message: string, conversationContext: any[]): Promise<{
    intent: string;
    confidence: number;
    entities?: any;
  }> {
    try {
      // Analizar el contexto de conversación para detectar búsquedas previas
      const contextSummary = conversationContext.slice(-6).map(msg => 
        `${msg.role}: ${msg.content}`
      ).join('\n');

      const prompt = `Analiza el siguiente mensaje de un cliente de bienes raíces considerando el contexto de la conversación anterior:

Contexto previo de la conversación:
${contextSummary}

Mensaje actual: "${message}"

Posibles intenciones:
- "search_property": buscar propiedades (nueva búsqueda)
- "refine_search": refinar o agregar información a una búsqueda anterior
- "property_details": solicitar más información/detalles sobre una propiedad específica ya mostrada
- "schedule_appointment": agendar cita
- "ask_question": hacer pregunta general
- "request_info": solicitar información específica
- "escalate_human": hablar con persona real
- "greeting": saludo
- "complaint": queja o problema
- "goodbye": despedida

IMPORTANTE: 
- Si el contexto muestra búsquedas previas de propiedades y el mensaje actual proporciona información adicional (presupuesto, preferencias, etc.), usa "refine_search".
- Si el mensaje solicita más información, detalles, descripción o características específicas de una propiedad ya mostrada, usa "property_details".
- Patrones para "property_details": "más información", "detalles", "descripción", "cuéntame más", "del que tiene", "de la que tiene", "información adicional"

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
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.7,
      });

      // Parse and validate using centralized function
      const parseResult = parseAndNormalize(
        response.choices[0].message.content,
        IntentDetectionSchema
      );

      if (!parseResult.data) {
        console.error('❌ [AI] Intent detection with context centralized parsing failed:', parseResult.issues);
        // Return safe fallback based on raw data if available
        const fallbackIntent = parseResult.raw?.intent || "ask_question";
        const fallbackConfidence = (typeof parseResult.raw?.confidence === 'number' && 
          parseResult.raw.confidence >= 0 && parseResult.raw.confidence <= 1) 
          ? parseResult.raw.confidence : 0.5;
        return {
          intent: fallbackIntent,
          confidence: fallbackConfidence,
          entities: parseResult.raw?.entities || {}
        };
      }

      // Log any parsing warnings
      if (parseResult.issues.length > 0) {
        console.log('⚠️ [AI] Intent detection with context parsing warnings:', parseResult.issues.join(', '));
      }

      return parseResult.data;
    } catch (error) {
      console.error('Error detecting intent with context:', error);
      return { intent: "ask_question", confidence: 0.5 };
    }
  }

  /**
   * Procesar búsqueda de propiedades usando AlterEstate
   */
  private async processPropertySearch(message: string, context: any, conversationId: string, isRefinement: boolean = false): Promise<string> {
    try {
      const { alterEstateService } = await import('./alterEstateService');
      const { getMCPClient } = await import('./mcpClient');
      
      let searchQuery = message;
      
      // Si es un refinamiento, combinar con contexto de búsquedas anteriores
      if (isRefinement) {
        const { storage } = await import('../storage');
        const conversation = await storage.getConversationById(conversationId);
        const conversationContext = (conversation?.context as any)?.messages || [];
        const previousSearches = conversationContext
          .filter((msg: any) => msg.role === 'user')
          .map((msg: any) => msg.content)
          .join(' ');
        
        searchQuery = `${previousSearches} ${message}`;
        console.log(`🔄 [AI] Refining previous search with new criteria: "${message}"`);
        console.log(`🔍 [AI] Combined search query: "${searchQuery}"`);
      } else {
        console.log('🔍 [AI] Starting new property search');
        
        // SISTEMA DE CALIFICACIÓN: Verificar si tenemos criterios suficientes para búsqueda
        const qualificationStatus = await this.assessClientQualification(searchQuery, conversationId);
        console.log(`🎯 [AI] Qualification status:`, qualificationStatus);
        
        // 🔒 HARD GATING: Block searches without mandatory budget, location, rooms, AND bathrooms
        const hasBudget = (qualificationStatus.extractedCriteria.budget_min || 
                          qualificationStatus.extractedCriteria.budget_max || 
                          qualificationStatus.extractedCriteria.budget?.min || 
                          qualificationStatus.extractedCriteria.budget?.max);
        const hasLocation = (qualificationStatus.extractedCriteria.zones || 
                           qualificationStatus.extractedCriteria.location?.zones);
        const hasRooms = (qualificationStatus.extractedCriteria.rooms || 
                         qualificationStatus.extractedCriteria.specifications?.rooms);
        const hasBathrooms = (qualificationStatus.extractedCriteria.bathrooms || 
                             qualificationStatus.extractedCriteria.specifications?.bathrooms);
        
        if (!hasBudget || !hasLocation || !hasRooms || !hasBathrooms) {
          console.log(`🔒 [AI] MANDATORY GATING: Blocking search - Budget: ${!!hasBudget}, Location: ${!!hasLocation}, Rooms: ${!!hasRooms}, Bathrooms: ${!!hasBathrooms}`);
          
          // Generate targeted request for missing mandatory data
          let missingItems = [];
          if (!hasBudget) missingItems.push("presupuesto");
          if (!hasLocation) missingItems.push("ubicación");
          if (!hasRooms) missingItems.push("habitaciones");
          if (!hasBathrooms) missingItems.push("baños");
          
          const mandatoryResponse = `Para ofrecerte las mejores opciones, necesito información esencial:\n\n` +
            (!hasBudget ? `💰 **Presupuesto**: ¿Cuál es tu rango de presupuesto? (ej: entre 150k-250k USD)\n\n` : '') +
            (!hasLocation ? `📍 **Ubicación**: ¿En qué zona te gustaría? (ej: Piantini, Naco, o toda Santo Domingo)\n\n` : '') +
            (!hasRooms ? `🛏️ **Habitaciones**: ¿Cuántas habitaciones necesitas? (ej: 2 o 3 habitaciones)\n\n` : '') +
            (!hasBathrooms ? `🚿 **Baños**: ¿Cuántos baños necesitas? (ej: 2 o 3 baños)\n\n` : '') +
            `¡Con esta información podré mostrarte propiedades que realmente se ajusten a lo que necesitas! 🎯`;
          
          // Update conversation context with mandatory request
          const { storage } = await import('../storage');
          const conversation = await storage.getConversationById(conversationId);
          const conversationContext = (conversation?.context as any)?.messages || [];
          conversationContext.push(
            { role: "user", content: message },
            { role: "assistant", content: mandatoryResponse }
          );
          
          if (conversationContext.length > 20) {
            conversationContext.splice(0, conversationContext.length - 20);
          }
          
          await storage.updateConversationContext(conversationId, { 
            messages: conversationContext,
            lastUpdated: new Date().toISOString()
          });
          
          console.log(`🔒 [AI] Blocked search and requested mandatory data: ${missingItems.join(', ')}`);
          return mandatoryResponse;
        }
        
        if (!qualificationStatus.isQualified) {
          console.log(`❓ [AI] Client not qualified yet, asking qualifying questions`);
          const qualifyingResponse = await this.askQualifyingQuestions(qualificationStatus, context);
          
          // CRÍTICO: Actualizar contexto de conversación con la pregunta de calificación
          const { storage } = await import('../storage');
          const conversation = await storage.getConversationById(conversationId);
          const conversationContext = (conversation?.context as any)?.messages || [];
          conversationContext.push(
            { role: "user", content: message },
            { role: "assistant", content: qualifyingResponse }
          );
          
          // Mantener solo últimos 20 mensajes
          if (conversationContext.length > 20) {
            conversationContext.splice(0, conversationContext.length - 20);
          }
          
          await storage.updateConversationContext(conversationId, { 
            messages: conversationContext,
            lastUpdated: new Date().toISOString()
          });
          console.log(`💾 [AI] Updated conversation context with qualifying question`);
          
          return qualifyingResponse;
        }
        
        console.log(`✅ [AI] Client qualified, proceeding with targeted search`);
      }
      
      // NUEVO: Buscar propiedades usando MCP con inteligencia mejorada
      console.log('🎯 [MCP-AI] Starting intelligent property search via MCP');
      
      // Inicializar cliente MCP con configuración del usuario
      const { storage } = await import('../storage');
      const userSettings = await storage.getUserSettings(context.userId);
      const mcpClient = getMCPClient(context.userId, context.alterEstateToken, userSettings);
      
      // Extraer criterios de la búsqueda usando la calificación existente
      const qualificationStatus = await this.assessClientQualification(searchQuery, conversationId);
      const criteria = qualificationStatus.extractedCriteria;
      
      console.log('🎯 [MCP-AI] Extracted criteria for MCP:', JSON.stringify(criteria, null, 2));
      
      // Convertir criterios al formato MCP
      const mcpCriteria: any = {};
      
      // Tipo de propiedad
      if (criteria.property_type) {
        mcpCriteria.propertyType = criteria.property_type.toLowerCase();
      }
      
      // Operación (venta/alquiler)
      if (criteria.operation || criteria.searchObjective?.operation) {
        const operation = criteria.operation || criteria.searchObjective?.operation;
        mcpCriteria.operation = operation.toLowerCase().includes('alquil') ? 'rent' : 'sale';
      }
      
      // Presupuesto con conversión automática de moneda
      if (criteria.budget_min || criteria.budget_max || criteria.budget?.min || criteria.budget?.max) {
        mcpCriteria.budget = {
          min: criteria.budget_min || criteria.budget?.min,
          max: criteria.budget_max || criteria.budget?.max,
          currency: criteria.currency || 'RD$' // Detectar automáticamente moneda
        };
      }
      
      // Ubicación
      if (criteria.zones || criteria.location?.zones || context.userLocation) {
        const zones = criteria.zones || criteria.location?.zones || [context.userLocation];
        mcpCriteria.location = {
          zones: Array.isArray(zones) ? zones : [zones],
          city: context.userLocation || 'Santo Domingo',
          flexibility: 'flexible'
        };
      }
      
      // Especificaciones técnicas
      if (criteria.rooms || criteria.bathrooms || criteria.area_min || criteria.area_max) {
        mcpCriteria.specifications = {
          rooms: criteria.rooms,
          bathrooms: criteria.bathrooms,
          areaMin: criteria.area_min,
          areaMax: criteria.area_max,
          parking: criteria.parking
        };
      }
      
      console.log('🚀 [MCP-AI] Calling MCP getRecommendations with criteria:', JSON.stringify(mcpCriteria, null, 2));
      
      let properties: any[] = [];
      
      try {
        // ESTRATEGIA PRIMARIA: Usar MCP para recomendaciones inteligentes
        const mcpResponse = await mcpClient.getRecommendations(mcpCriteria);
        
        console.log(`✅ [MCP-AI] MCP returned ${mcpResponse.recommendations.length} recommendations`);
        console.log(`🧠 [MCP-AI] MCP rationale: ${mcpResponse.rationale}`);
        
        // Convertir respuesta MCP al formato esperado por el código existente
        properties = mcpResponse.recommendations.map((rec: any, index: number) => ({
          cid: index + 1, // Campo requerido por AlterEstateProperty
          uid: rec.uid,
          slug: rec.slug,
          name: rec.title,
          sale_price: rec.priceUSD,
          currency_sale: 'USD',
          room: rec.specifications.rooms,
          bathroom: rec.specifications.bathrooms,
          property_area: rec.specifications.area,
          sector: rec.location.split(',')[0]?.trim(),
          city: rec.location.split(',')[1]?.trim() || rec.location,
          featured_image: rec.imageUrl,
          category: { id: rec.isProject ? 3 : 1, name: rec.isProject ? 'Proyecto' : 'Propiedad', name_en: rec.isProject ? 'Project' : 'Property' },
          listing_type: [{ id: mcpCriteria.operation === 'rent' ? 2 : 1, listing: mcpCriteria.operation === 'rent' ? 'Alquiler' : 'Venta' }], // Campo requerido
          short_description: `${rec.reasons.join(', ')} | Score: ${rec.score}`
        }));
        
      } catch (mcpError) {
        console.warn(`⚠️ [MCP-FALLBACK] MCP failed, using alterEstateService fallback:`, (mcpError as Error).message);
        
        // ESTRATEGIA FALLBACK: Usar alterEstateService original con conversión de moneda
        properties = await alterEstateService.intelligentPropertySearch(
          context.alterEstateToken,
          searchQuery,
          context.userLocation
        );
        
        console.log(`🔄 [FALLBACK] AlterEstateService returned ${properties.length} properties`);
        
        // Aplicar conversión de moneda automática si es necesario
        if (mcpCriteria.budget?.currency === 'RD$') {
          console.log(`💱 [FALLBACK] Applying currency conversion from RD$ to USD for fallback results`);
          properties = properties.map(prop => ({
            ...prop,
            sale_price: prop.sale_price ? Math.round(prop.sale_price / 62) : prop.sale_price, // Conversión RD$ a USD
            currency_sale: 'USD',
            short_description: prop.short_description ? 
              prop.short_description + ' | Precio convertido automáticamente a USD' : 
              'Precio convertido automáticamente de RD$ a USD'
          }));
        }
      }
      
      if (properties.length === 0) {
        console.log(`❌ [AI] No properties found, providing helpful suggestions`);
        
        // Analizar los criterios de búsqueda para dar sugerencias específicas
        const searchAnalysis = await this.analyzeFailedSearch(searchQuery, context);
        
        // Dar respuesta personalizada considerando el historial y sugerir alternativas específicas
        const { storage } = await import('../storage');
        const conversation = await storage.getConversationById(conversationId);
        const conversationContext = (conversation?.context as any)?.messages || [];
        
        const helpfulSuggestions = this.generateAlternativeSuggestions(searchQuery, searchAnalysis);
        
        const contextNote = isRefinement 
          ? '\n\nNOTA: El cliente está refinando una búsqueda anterior pero no hay propiedades que coincidan exactamente. Reconoce que recuerdas sus preferencias previas, explica por qué no hay coincidencias exactas, y sugiere alternativas útiles basadas en su historial. Mantén un tono cálido y personalizado. Ofrece opciones como: aumentar presupuesto, considerar áreas cercanas, o cambiar algunos criterios específicos.'
          : '\n\nNOTA: No se encontraron propiedades que coincidan exactamente con los criterios. Sé empático y específico sobre por qué no hay resultados, y proporciona sugerencias constructivas para encontrar opciones. Ofrece ajustar presupuesto, considerar áreas alternativas, o modificar criterios específicos. Siempre mantén esperanza de ayudar a encontrar algo.';
          
        const systemPrompt = this.buildSystemPrompt(context) + contextNote;
        
        const detailedPrompt = `El usuario busca: "${message}"
        
Los criterios de búsqueda analizados son:
${searchAnalysis}

Sugerencias específicas para el cliente:
${helpfulSuggestions}

Responde de manera empática y constructiva. Explica brevemente por qué no hay resultados exactos y ofrece alternativas específicas y útiles. Pregunta qué prefiere hacer: ajustar criterios, ver áreas alternativas, o cambiar el presupuesto.`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationContext,
          { role: "user", content: detailedPrompt }
        ];

        const response = await this.openaiClient.chat.completions.create({
          model: "gpt-4o",
          messages: messages as any,
          max_tokens: 400,
          temperature: 0.7,
        });

        const aiResponse = response.choices[0].message.content || 'No encontré propiedades disponibles con esos criterios exactos, pero puedo ayudarte a encontrar opciones similares. ¿Te gustaría ajustar algún criterio de tu búsqueda?';
        
        // Update conversation context
        conversationContext.push(
          { role: "user", content: message },
          { role: "assistant", content: aiResponse }
        );

        // Keep only last 20 messages for context
        if (conversationContext.length > 20) {
          conversationContext.splice(0, conversationContext.length - 20);
        }

        // Save updated context to database
        await storage.updateConversationContext(conversationId, { 
          messages: conversationContext,
          lastUpdated: new Date().toISOString()
        });
        
        return aiResponse;
      }
      
      // Para múltiples propiedades, usar formato carrusel
      if (properties.length >= 2) {
        console.log(`🎠 [AI] Found ${properties.length} properties, formatting as carousel`);
        
        // HUMANIZATION: Send initial search message before recommendations
        try {
          const { evolutionApiService } = await import('./evolutionApiService');
          let phoneNumber = context.phoneNumber;
          
          // Extract phone number from conversationId if not available
          if (!phoneNumber) {
            const phoneMatch = conversationId.match(/(\d{10,15})/);
            phoneNumber = phoneMatch ? phoneMatch[1] : null;
          }
          
          if (phoneNumber && context.instanceName) {
            console.log(`💬 [HUMANIZE] Sending initial search message to ${phoneNumber}`);
            
            const initialMessage = "Perfecto, déjame buscar algo ideal para ti. Dame unos minutos...";
            await evolutionApiService.sendMessage(context.instanceName, phoneNumber, initialMessage);
            
            // Wait 5 seconds before sending recommendations  
            console.log(`⏱️ [HUMANIZE] Waiting 5 seconds before sending recommendations`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 🎯 SEND CONVERSATIONAL MESSAGES FOR EACH PROPERTY
            const qualificationStatus = await this.assessClientQualification(message, conversationId);
            
            // Get detailed property information with descriptions
            const { alterEstateService } = await import('./alterEstateService');
            const { storage } = await import('../storage');
            const conversation = await storage.getConversationById(conversationId);
            const userSettings = conversation?.userId ? await storage.getUserSettings(conversation.userId) : null;
            
            if (userSettings?.alterEstateToken) {
              await this.sendConversationalPropertyIntros(
                properties.slice(0, 3), // Limit to first 3 properties
                userSettings.alterEstateToken,
                context.instanceName,
                phoneNumber,
                qualificationStatus.extractedCriteria
              );
            }
            
            // Brief pause before sending property cards
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (humanizeError) {
          console.warn(`⚠️ [HUMANIZE] Failed to send initial message:`, (humanizeError as Error).message);
          // Continue anyway - don't block recommendations
        }
        
        // Format properties for recommendations (limit to 6 as specified)
        const carouselProperties = alterEstateService.formatPropertiesForCarousel(
          properties.slice(0, 6), // Limit to 6 property recommendations
          context.realEstateWebsiteUrl
        );

        console.log(`🎠 [AI] Formatted ${carouselProperties.length} properties for carousel`);
        
        // Send properties as carousel via WhatsApp
        try {
          const { evolutionApiService } = await import('./evolutionApiService');
          
          // FIXED: Use proper instance resolution within AIService scope
          let carouselInstanceName = context.instanceName;
          if (!carouselInstanceName && context.userId) {
            // Attempt to resolve instance from user mapping or use default
            console.warn(`⚠️ [AI] No instanceName provided for user ${context.userId}, using fallback`);
            carouselInstanceName = null; // Will cause proper error handling below
          }
          const activeInstanceInfo = carouselInstanceName ? { instanceName: carouselInstanceName } : null;
          
          if (!activeInstanceInfo) {
            console.error(`❌ [AI] Cannot send property carousel - no active instance for user ${context.userId}`);
            throw new Error(`No active WhatsApp instance available for user ${context.userId}`);
          }
          
          const { instanceName } = activeInstanceInfo;
          
          // Extract phone number from conversationId - need to implement this properly
          let phoneNumber = context.phoneNumber;
          
          // Try to extract from various sources
          if (!phoneNumber) {
            // If conversationId contains phone number (like "18292639382@s.whatsapp.net")
            const phoneMatch = conversationId.match(/(\d{10,15})/);
            phoneNumber = phoneMatch ? phoneMatch[1] : null;
          }
          
          if (!phoneNumber) {
            console.error('❌ [AI] No phone number available for carousel');
            throw new Error('No phone number available');
          }
          
          console.log(`📱 [AI] Sending carousel via resolved instance ${instanceName} to ${phoneNumber}`);
          
          const result = await evolutionApiService.sendPropertyRecommendations(
            instanceName,
            phoneNumber,
            carouselProperties
          );
          
          if (result.success) {
            console.log(`✅ [AI] Property recommendations sent successfully: ${result.messageIds.length} messages`);
            
            // Update conversation context with enhanced property information
            const { storage } = await import('../storage');
            const conversation = await storage.getConversationById(conversationId);
            const conversationContext = (conversation?.context as any)?.messages || [];
            const contextSummary = `Se enviaron ${carouselProperties.length} propiedades recomendadas:
${carouselProperties.map((p, i) => `${i + 1}. "${p.title}" - ${p.price} - ${p.description} (ID: ${p.uid})`).join('\n')}`;
            
            conversationContext.push(
              { role: "user", content: message },
              { role: "assistant", content: contextSummary }
            );

            // Keep only last 20 messages for context
            if (conversationContext.length > 20) {
              conversationContext.splice(0, conversationContext.length - 20);
            }

            // Save updated context to database
            await storage.updateConversationContext(conversationId, { 
              messages: conversationContext,
              lastUpdated: new Date().toISOString()
            });
            
            // Return success message for internal tracking
            return `Propiedades enviadas como recomendaciones: ${carouselProperties.length} mensajes individuales con fotos`;
          } else {
            console.error('❌ [AI] Failed to send property recommendations, falling back to text format');
            throw new Error('Property recommendations send failed');
          }
          
        } catch (recommendationError) {
          console.error('❌ [AI] Error sending property recommendations:', recommendationError);
          console.log('🔄 [AI] FORCING individual recommendations - NO fallback to text...');
          
          // FORCE individual property sending - no fallback
          console.log('🔧 [AI] Attempting forced individual property sending...');
          
          // Import and setup required services
          const { evolutionApiService: evolutionService } = await import('./evolutionApiService');
          
          // FIXED: Use proper instance resolution within AIService scope
          let fallbackInstanceName = context.instanceName;
          if (!fallbackInstanceName && context.userId) {
            // Attempt to resolve instance from user mapping or use default
            console.warn(`⚠️ [AI] No instanceName provided for user ${context.userId}, using fallback`);
            fallbackInstanceName = null; // Will cause proper error handling below
          }
          const activeInstanceInfo = fallbackInstanceName ? { instanceName: fallbackInstanceName } : null;
          
          if (!activeInstanceInfo) {
            console.error(`❌ [AI] Cannot send forced individual properties - no active instance for user ${context.userId}`);
            return 'Error: No hay una instancia de WhatsApp activa disponible. Por favor verifica tu conexión de WhatsApp.';
          }
          
          const { instanceName } = activeInstanceInfo;
          
          // Extract phone number from conversationId
          let phoneNumber = context.phoneNumber;
          if (!phoneNumber) {
            const phoneMatch = conversationId.match(/(\d{10,15})/);
            phoneNumber = phoneMatch ? phoneMatch[1] : null;
          }
          
          if (!phoneNumber) {
            console.error('❌ [AI] No phone number available for forced sending');
            return `Error: No se pudo determinar el número de teléfono`;
          }
          
          console.log(`📱 [AI] Force sending to ${phoneNumber} via ${instanceName}`);
          
          for (let i = 0; i < Math.min(carouselProperties.length, 6); i++) {
            const property = carouselProperties[i];
            try {
              const caption = `🏠 *${property.title}*\n\n💰 ${property.price}\n🏠 ${property.description}\n📍 ID: ${property.uid}\n\n🔗 ${property.propertyUrl}`;
              
              console.log(`📤 [AI] Sending individual property ${i + 1}/${carouselProperties.length}`);
              
              // Force simple text message per property for now
              const result = await evolutionService.sendMessage(
                instanceName,
                phoneNumber,
                caption
              );
              
              if (result.success) {
                console.log(`✅ [AI] Property ${i + 1} sent successfully`);
              } else {
                console.log(`❌ [AI] Property ${i + 1} failed to send`);
              }
              
              // Small delay between properties
              if (i < carouselProperties.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            } catch (forceError) {
              console.error(`❌ [AI] Failed to force send property ${i + 1}:`, forceError);
            }
          }
          
          return `Propiedades enviadas individualmente: ${carouselProperties.length} mensajes separados`;
          
          // OLD FALLBACK CODE - Disabled to force individual sending
          /*
          const propertiesToShow = properties.slice(0, 5);
          const propertiesText = propertiesToShow.map((property, index) => {
            const salePrice = property.sale_price;
            const currency = property.currency_sale || 'USD';
            const formattedPrice = salePrice && typeof salePrice === 'number' 
              ? `${currency} ${salePrice.toLocaleString()}`
              : 'Precio a consultar';
            
            const propertyUrl = alterEstateService.getPropertyPublicUrl(
              property.slug, 
              context.realEstateWebsiteUrl
            );
            
            return `${index + 1}. 🏠 **${property.name}**
💰 ${formattedPrice}
🏠 ${property.room || 'N/A'} hab • 🚿 ${property.bathroom || 'N/A'} baños
📍 ${property.sector || 'Sector no especificado'}, ${property.city || 'Ciudad no especificada'}
🔗 Ver detalles: ${propertyUrl}`;
          }).join('\n\n');

          const moreProperties = properties.length > 5 ? `\n\n➕ *Tengo ${properties.length - 5} propiedades adicionales que podrían interesarte.*` : '';
          
          if (isRefinement) {
            return `Perfecto! 😊 Considerando tu presupuesto y las preferencias que me has mencionado, aquí tienes las mejores opciones:\n\n${propertiesText}${moreProperties}\n\n¿Te interesa alguna en particular? Puedo ayudarte con más información, fotos o para agendar una visita. 🗓️`;
          } else {
            return `🏠 ¡Encontré ${properties.length} excelentes opciones para ti!\n\n${propertiesText}${moreProperties}\n\n¿Cuál te llama más la atención? Puedo ayudarte con más información, fotos o para agendar una visita. 🗓️`;
          }
          */
        }
      }
      
      // Para una sola propiedad, también usar formato carrusel para consistencia
      console.log(`🎠 [AI] Found 1 property, formatting as single carousel card`);
      
      // HUMANIZATION: Send initial search message before single property recommendation
      try {
        const { evolutionApiService } = await import('./evolutionApiService');
        let phoneNumber = context.phoneNumber;
        
        // Extract phone number from conversationId if not available
        if (!phoneNumber) {
          const phoneMatch = conversationId.match(/(\d{10,15})/);
          phoneNumber = phoneMatch ? phoneMatch[1] : null;
        }
        
        if (phoneNumber && context.instanceName) {
          console.log(`💬 [HUMANIZE] Sending initial search message to ${phoneNumber}`);
          
          const initialMessage = "Perfecto, déjame buscar algo ideal para ti. Dame unos minutos...";
          await evolutionApiService.sendMessage(context.instanceName, phoneNumber, initialMessage);
          
          // Wait 5 seconds before sending recommendation  
          console.log(`⏱️ [HUMANIZE] Waiting 5 seconds before sending recommendation`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // 🎯 SEND CONVERSATIONAL MESSAGE FOR SINGLE PROPERTY
          const qualificationStatus = await this.assessClientQualification(message, conversationId);
          
          // Get detailed property information with descriptions
          const { alterEstateService } = await import('./alterEstateService');
          const { storage } = await import('../storage');
          const conversation = await storage.getConversationById(conversationId);
          const userSettings = conversation?.userId ? await storage.getUserSettings(conversation.userId) : null;
          
          if (userSettings?.alterEstateToken && context.instanceName) {
            await this.sendConversationalPropertyIntros(
              [properties[0]], // Single property
              userSettings.alterEstateToken,
              context.instanceName,
              phoneNumber,
              qualificationStatus.extractedCriteria
            );
          }
          
          // Brief pause before sending property card
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (humanizeError) {
        console.warn(`⚠️ [HUMANIZE] Failed to send initial message:`, (humanizeError as Error).message);
        // Continue anyway - don't block recommendations
      }
      
      // Format single property for carousel display
      const carouselProperties = alterEstateService.formatPropertiesForCarousel(
        [properties[0]], 
        context.realEstateWebsiteUrl
      );

      // Send single property as carousel via WhatsApp
      try {
        const { evolutionApiService } = await import('./evolutionApiService');
        
        // FIXED: Use proper instance resolution within AIService scope
        let singlePropInstanceName = context.instanceName;
        if (!singlePropInstanceName && context.userId) {
          // Attempt to resolve instance from user mapping or use default
          console.warn(`⚠️ [AI] No instanceName provided for user ${context.userId}, using fallback`);
          singlePropInstanceName = null; // Will cause proper error handling below
        }
        const activeInstanceInfo = singlePropInstanceName ? { instanceName: singlePropInstanceName } : null;
        
        if (!activeInstanceInfo) {
          console.error(`❌ [AI] Cannot send single property carousel - no active instance for user ${context.userId}`);
          throw new Error(`No active WhatsApp instance available for user ${context.userId}`);
        }
        
        const { instanceName } = activeInstanceInfo;
        
        // Extract phone number from conversationId
        let phoneNumber = context.phoneNumber;
        
        // Try to extract from various sources
        if (!phoneNumber) {
          // If conversationId contains phone number (like "18292639382@s.whatsapp.net")
          const phoneMatch = conversationId.match(/(\d{10,15})/);
          phoneNumber = phoneMatch ? phoneMatch[1] : null;
        }
        
        if (!phoneNumber) {
          console.error('❌ [AI] No phone number available for carousel');
          throw new Error('No phone number available');
        }
        
        console.log(`📱 [AI] Sending single property carousel via resolved instance ${instanceName} to ${phoneNumber}`);
        
        const result = await evolutionApiService.sendPropertyRecommendations(
          instanceName,
          phoneNumber,
          carouselProperties
        );
        
        if (result.success) {
          console.log(`✅ [AI] Single property carousel sent successfully`);
          
          // Update conversation context with a summary
          const { storage } = await import('../storage');
          const conversation = await storage.getConversationById(conversationId);
          const conversationContext = (conversation?.context as any)?.messages || [];
          const property = carouselProperties[0];
          const contextSummary = `Se envió 1 propiedad en formato carrusel con foto y botones interactivos: ${property.title} - ${property.price} (ID: ${property.uid})`;
          
          conversationContext.push(
            { role: "user", content: message },
            { role: "assistant", content: contextSummary }
          );

          // Keep only last 20 messages for context
          if (conversationContext.length > 20) {
            conversationContext.splice(0, conversationContext.length - 20);
          }

          // Save updated context to database
          await storage.updateConversationContext(conversationId, { 
            messages: conversationContext,
            lastUpdated: new Date().toISOString()
          });
          
          // Return success confirmation for internal tracking
          return ""; // Silent success - no message needed as properties are sent directly
        } else {
          console.error('❌ [AI] Failed to send single property carousel, falling back to text format');
          throw new Error('Single property carousel send failed');
        }
        
      } catch (carouselError) {
        console.error('❌ [AI] Error sending single property carousel:', carouselError);
        console.log('🔄 [AI] Falling back to text format for single property...');
        
        // Fallback to existing text format for single property
        const property = properties[0];
        const propertyUrl = alterEstateService.getPropertyPublicUrl(
          property.slug, 
          context.realEstateWebsiteUrl
        );
        
        // Formato mejorado para una sola propiedad con enlace directo
        const salePrice = property.sale_price;
        const currency = property.currency_sale || 'RD$';
        const formattedPrice = salePrice && typeof salePrice === 'number' 
          ? `${currency} ${salePrice.toLocaleString()}`
          : 'Precio a consultar';
        
        const categoryName = property.category && typeof property.category === 'object' 
          ? property.category.name 
          : property.category || 'Tipo no especificado';
        
        const enhancedPropertyInfo = `🏠 **${property.name || 'Propiedad sin nombre'}**

💰 **Precio**: ${formattedPrice}
🏢 **Tipo**: ${categoryName}
🏠 **Habitaciones**: ${property.room || 'N/A'}
🚿 **Baños**: ${property.bathroom || 'N/A'}
📍 **Ubicación**: ${property.sector || 'Sector no especificado'}, ${property.city || 'Ciudad no especificada'}

🔗 **Ver publicación completa**: ${propertyUrl}

📝 **Descripción**: ${property.short_description || 'Información disponible en el enlace'}`;
        
        // Generar respuesta contextual usando IA
        const { storage } = await import('../storage');
        const conversation = await storage.getConversationById(conversationId);
        const conversationContext = (conversation?.context as any)?.messages || [];
        const contextInstructions = isRefinement 
          ? '\n\nINSTRUCCIONES ESPECIALES: El cliente está refinando una búsqueda anterior. Reconoce que recuerdas sus preferencias previas y presenta esta propiedad como resultado de haber considerado toda su información. Sé cálido, personal y muestra que has estado atento a sus necesidades. Tienes acceso a propiedades reales del CRM. SIEMPRE incluye el enlace directo a la publicación. Ofrece agendar visitas y crear leads.'
          : '\n\nINSTRUCCIONES ESPECIALES: Tienes acceso a propiedades reales del CRM. Presenta estas propiedades de manera natural y conversacional. SIEMPRE incluye el enlace directo a la publicación. Ofrece agendar visitas y crear leads si el cliente muestra interés.';
          
        const systemPrompt = this.buildSystemPrompt(context) + contextInstructions;
        
        const propertyPrompt = isRefinement 
          ? `El usuario ha estado refinando su búsqueda y ahora dice: "${message}"

Basándome en toda nuestra conversación y sus criterios, he encontrado esta propiedad real que se ajusta perfectamente:

${enhancedPropertyInfo}

Presenta esta propiedad reconociendo que recuerdas sus preferencias anteriores. Destaca cómo esta propiedad cumple con los criterios que ha mencionado, menciona que puede ver la publicación completa en el enlace proporcionado, y pregunta si le gustaría agendar una visita o ver más fotos.`
          : `El usuario preguntó: "${message}"

He encontrado esta propiedad real disponible en nuestro CRM:

${enhancedPropertyInfo}

Presenta esta propiedad de manera natural y conversacional. Destaca las características más relevantes, menciona que puede ver la publicación completa en el enlace proporcionado, y pregunta si le gustaría agendar una visita o ver más fotos.`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationContext,
        { role: "user", content: propertyPrompt }
      ];

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: messages as any,
        max_tokens: 600,
        temperature: 0.7,
      });

      const aiResponse = response.choices[0].message.content || enhancedPropertyInfo;
      
      // Update conversation context
      conversationContext.push(
        { role: "user", content: message },
        { role: "assistant", content: aiResponse }
      );

      // Keep only last 20 messages for context
      if (conversationContext.length > 20) {
        conversationContext.splice(0, conversationContext.length - 20);
      }

      // Save updated context to database
      await storage.updateConversationContext(conversationId, { 
        messages: conversationContext,
        lastUpdated: new Date().toISOString()
      });
      
      return aiResponse;
    }
      
    } catch (error) {
      console.error('❌ [AI] Error in property search:', error);
      return 'Disculpa, tuve un problema consultando nuestro inventario de propiedades. ¿Podrías repetir tu búsqueda?';
    }
  }

  /**
   * Detectar si el usuario está solicitando fotos/videos de propiedades
   */
  private isRequestingPropertyMedia(message: string): boolean {
    const messageLower = message.toLowerCase();
    
    // Palabras clave relacionadas con solicitar ver contenido visual
    const mediaKeywords = [
      'foto', 'fotos', 'imagen', 'imágenes', 'video', 'videos',
      'ver', 'muestra', 'enseña', 'galería', 'picture', 'photo',
      'mira', 'envía', 'manda', 'comparte', 'visual', 'aspecto',
      'cómo se ve', 'que tal se ve', 'ver como es', 'podria ver',
      'puedes mostrar', 'me puedes enviar', 'tienes fotos'
    ];
    
    // Referencias a propiedades específicas
    const propertyKeywords = [
      'propiedad', 'apartament', 'casa', 'inmueble', 'villa',
      'penthouse', 'property', 'unit', 'building', 'lugar',
      'esa', 'esta', 'ese', 'este', 'del que', 'de la que',
      'que se encuentra', 'ubicado', 'ubicada', 'en la calle',
      'en el', 'en la', 'el de', 'la de'
    ];
    
    const hasMediaKeyword = mediaKeywords.some(keyword => messageLower.includes(keyword));
    const hasPropertyKeyword = propertyKeywords.some(keyword => messageLower.includes(keyword));
    
    // Detectar patrones específicos de solicitud de fotos
    const mediaPatterns = [
      /podria?\s+ver\s+(foto|imagen)/i,
      /puedes?\s+(mostrar|enviar|mandar)\s+(foto|imagen)/i,
      /ver\s+(foto|imagen).*?(del?|de\s+la?)\s+(que|propiedad|casa|apartament)/i,
      /foto.*?(del?|de\s+la?)\s+(que|propiedad|casa|apartament)/i,
      // NUEVOS PATRONES más flexibles para solicitudes en contexto
      /puedes?\s+(enviar|mandar|mostrar).*?(foto|imagen)/i,
      /tienes?\s+(foto|imagen)/i,
      /^(foto|imagen|ver)/i, // Mensajes que empiezan con foto/imagen/ver
      /(enviar|mandar|mostrar).*?(foto|imagen)/i,
      /ver\s+como\s+(es|está|se\s+ve)/i
    ];
    
    const hasMediaPattern = mediaPatterns.some(pattern => pattern.test(message));
    
    console.log(`🔍 [AI] Media detection for: "${message}"`);
    console.log(`📸 [AI] Has media keyword: ${hasMediaKeyword}, property keyword: ${hasPropertyKeyword}, pattern: ${hasMediaPattern}`);
    
    // LÓGICA MEJORADA: También considerar solicitudes genéricas cuando existe contexto
    // Si hay una palabra clave de media Y el mensaje es corto (sugiere que está en contexto)
    const isShortMediaRequest = hasMediaKeyword && message.trim().length <= 30;
    
    // Si es una solicitud específica con patrón O si tiene keywords relevantes
    const isMediaRequest = hasMediaPattern || (hasMediaKeyword && hasPropertyKeyword) || isShortMediaRequest;
    
    console.log(`📸 [AI] Short media request: ${isShortMediaRequest}, Final result: ${isMediaRequest}`);
    
    return isMediaRequest;
  }

  /**
   * Procesar solicitud de medios de propiedades
   */
  private async processPropertyMediaRequest(message: string, context: any, conversationId: string): Promise<string> {
    try {
      console.log('📸 [AI] Processing property media request');
      
      if (!context.alterEstateEnabled || !context.alterEstateToken) {
        return 'Para poder enviarte fotos de propiedades, necesito que AlterEstate CRM esté configurado en las configuraciones.';
      }
      
      // Extract property ID from message if mentioned
      const propertyIdMatch = message.match(/([A-Z0-9]{8,12})/); // AlterEstate UIDs are typically 8-12 chars
      
      let propertySlug: string | null = null;
      let property: any = null;
      
      if (propertyIdMatch) {
        propertySlug = propertyIdMatch[1];
        console.log(`🏠 [AI] Property ID extracted from message: ${propertySlug}`);
      } else {
        // Try to get property from recent conversation context first
        propertySlug = await this.extractPropertyFromContext(conversationId);
        console.log(`🏠 [AI] Property extracted from context: ${propertySlug}`);
        
        // If no property in context, search for property by location/description
        if (!propertySlug) {
          console.log('🔍 [AI] No property ID found, searching by location/description');
          const { alterEstateService } = await import('./alterEstateService');
          
          // Search for properties matching the description
          const searchResult = await alterEstateService.intelligentPropertySearch(
            context.alterEstateToken,
            message,
            context.userLocation
          );
          
          if (searchResult.length > 0) {
            property = searchResult[0]; // Take the first match
            propertySlug = property.slug;
            console.log(`🏠 [AI] Found property by search: ${propertySlug} (${property.name})`);
          }
        }
      }
      
      if (!propertySlug) {
        return 'Me gustaría enviarte las fotos, pero ¿de cuál propiedad específicamente? Por favor menciona el ID de la propiedad que te interesa, o hazme una búsqueda de propiedades primero.';
      }
      
      // Get property media from AlterEstate
      const { alterEstateService } = await import('./alterEstateService');
      const media = await alterEstateService.getPropertyMedia(context.alterEstateToken, propertySlug);
      
      // Send media through WhatsApp queue system
      await this.sendPropertyMedia(conversationId, propertySlug, media);
      
      if (media.images.length === 0 && !media.featuredImage) {
        return 'Esta propiedad no tiene fotos disponibles en este momento. ¿Te gustaría que coordine una visita para que puedas verla en persona?';
      }
      
      // Send media through queue and return a simple confirmation
      console.log(`📸 [AI] Media queued successfully for property ${propertySlug}`);
      
      // Return a simple response without promising specific number of photos
      let response = `📸 Te envío las fotos de esta propiedad.`;
      
      if (media.virtualTour) {
        response += `\n\n🎥 También incluiré el tour virtual.`;
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ [AI] Error processing media request:', error);
      return 'Disculpa, tuve un problema obteniendo las fotos de la propiedad. ¿Podrías intentar de nuevo o especificar qué propiedad te interesa?';
    }
  }

  /**
   * Procesar solicitud de detalles adicionales de una propiedad
   */
  private async processPropertyDetailsRequest(message: string, context: any, conversationId: string): Promise<string> {
    try {
      console.log('📋 [AI] Processing property details request');
      
      if (!context.alterEstateEnabled || !context.alterEstateToken) {
        return 'Para poder obtener información detallada de propiedades, necesito que AlterEstate CRM esté configurado en las configuraciones.';
      }
      
      // Try to extract property ID from message or context
      const propertyIdMatch = message.match(/([A-Z0-9]{8,12})/);
      let propertySlug: string | null = null;
      
      if (propertyIdMatch) {
        propertySlug = propertyIdMatch[1];
        console.log(`🏠 [AI] Property ID extracted from message: ${propertySlug}`);
      } else {
        // Try to get property from recent conversation context
        propertySlug = await this.extractPropertyFromContext(conversationId);
        console.log(`🏠 [AI] Property extracted from context: ${propertySlug}`);
      }
      
      if (!propertySlug) {
        // Check if user is referring to a property by description/feature from context
        const matchResult = await this.findPropertiesByDescription(message, conversationId, context);
        
        if (matchResult.matches.length === 1) {
          propertySlug = matchResult.matches[0].slug;
          console.log(`🏠 [AI] Single property found by contextual description: ${propertySlug}`);
        } else if (matchResult.matches.length > 1) {
          console.log(`⚠️ [AI] Multiple properties match the description, asking for clarification`);
          return this.buildClarificationResponse(matchResult.matches, matchResult.feature);
        } else {
          return 'Para darte más información específica, ¿podrías mencionar el ID de la propiedad que te interesa? O puedo hacer una nueva búsqueda si me das algunos criterios.';
        }
      }
      
      // Get detailed property information from AlterEstate
      const { alterEstateService } = await import('./alterEstateService');
      
      try {
        if (!propertySlug) {
          return 'No pude identificar la propiedad específica. ¿Podrías proporcionar el ID de la propiedad?';
        }
        const propertyDetails = await alterEstateService.getPropertyDetail(context.alterEstateToken, propertySlug);
        
        if (!propertyDetails) {
          return 'No pude encontrar información detallada de esa propiedad. ¿Podrías verificar el ID o hacer una nueva búsqueda?';
        }
        
        // Build detailed response using description and agent information
        const propertyUrl = alterEstateService.getPropertyPublicUrl(
          propertySlug, 
          context.realEstateWebsiteUrl || ''
        );
        
        let detailedResponse = `🏠 **${propertyDetails.name || 'Propiedad'}**\n\n`;
        
        // Add price and basic info
        const salePrice = propertyDetails.sale_price;
        const currency = propertyDetails.currency_sale || 'RD$';
        const formattedPrice = salePrice && typeof salePrice === 'number' 
          ? `${currency} ${salePrice.toLocaleString()}`
          : 'Precio a consultar';
        
        detailedResponse += `💰 **Precio**: ${formattedPrice}\n`;
        detailedResponse += `🏢 **Tipo**: ${propertyDetails.category || 'No especificado'}\n`;
        detailedResponse += `🏠 **Habitaciones**: ${propertyDetails.room || 'N/A'}\n`;
        detailedResponse += `🚿 **Baños**: ${propertyDetails.bathroom || 'N/A'}\n`;
        detailedResponse += `📍 **Ubicación**: ${propertyDetails.sector || ''}, ${propertyDetails.city || ''}\n\n`;
        
        // Add description if available
        if (propertyDetails.description && propertyDetails.description.trim()) {
          detailedResponse += `📝 **Descripción completa**:\n${propertyDetails.description}\n\n`;
        } else if (propertyDetails.short_description && propertyDetails.short_description.trim()) {
          detailedResponse += `📝 **Descripción**:\n${propertyDetails.short_description}\n\n`;
        }
        
        // Add agent contact information if available
        const agentInfo = propertyDetails.agents && propertyDetails.agents.length > 0 ? propertyDetails.agents[0] : null;
        if (agentInfo && (agentInfo.full_name || agentInfo.phone || agentInfo.email)) {
          detailedResponse += `👤 **Contacto del agente**:\n`;
          if (agentInfo.full_name) {
            detailedResponse += `📞 **Agente**: ${agentInfo.full_name}\n`;
          }
          if (agentInfo.phone) {
            detailedResponse += `📱 **Teléfono**: ${agentInfo.phone}\n`;
          }
          if (agentInfo.email) {
            detailedResponse += `📧 **Email**: ${agentInfo.email}\n`;
          }
          detailedResponse += '\n';
        }
        
        detailedResponse += `🔗 **Ver publicación completa**: ${propertyUrl}\n\n`;
        detailedResponse += `¿Te gustaría agendar una visita, ver las fotos o tienes alguna otra pregunta específica sobre esta propiedad?`;
        
        return detailedResponse;
        
      } catch (error) {
        console.error('❌ [AI] Error getting property details:', error);
        return 'Disculpa, tuve un problema obteniendo los detalles de la propiedad. ¿Podrías intentar de nuevo?';
      }
      
    } catch (error) {
      console.error('❌ [AI] Error processing property details request:', error);
      return 'Disculpa, tuve un problema procesando tu solicitud. ¿Podrías intentar de nuevo?';
    }
  }

  /**
   * Analizar una búsqueda fallida para entender por qué no hay resultados
   */
  private async analyzeFailedSearch(searchQuery: string, context: any): Promise<string> {
    try {
      console.log(`🔍 [AI] Analyzing failed search: "${searchQuery}"`);
      
      // Extraer criterios específicos de la búsqueda
      const analysis = [];
      
      // Analizar ubicación
      const locationKeywords = ['santiago', 'santo domingo', 'punta cana', 'zona colonial', 'bella vista', 'cacique'];
      const mentionedLocation = locationKeywords.find(loc => searchQuery.toLowerCase().includes(loc));
      if (mentionedLocation) {
        analysis.push(`📍 Ubicación solicitada: ${mentionedLocation}`);
      }
      
      // Analizar presupuesto
      const budgetMatches = searchQuery.match(/(\d+)\s*(dolar|dollar|usd|rd\$|peso)/i);
      if (budgetMatches) {
        analysis.push(`💰 Presupuesto mencionado: ${budgetMatches[0]}`);
      }
      
      // Analizar habitaciones
      const roomMatches = searchQuery.match(/(\d+)\s*(hab|habitacion|bedroom)/i);
      if (roomMatches) {
        analysis.push(`🏠 Habitaciones solicitadas: ${roomMatches[0]}`);
      }
      
      // Analizar tipo de operación
      const isRental = searchQuery.toLowerCase().includes('alquil') || searchQuery.toLowerCase().includes('rent');
      const isSale = searchQuery.toLowerCase().includes('compr') || searchQuery.toLowerCase().includes('venta') || searchQuery.toLowerCase().includes('sale');
      if (isRental) {
        analysis.push(`🔑 Tipo: Alquiler`);
      } else if (isSale) {
        analysis.push(`🏷️ Tipo: Venta`);
      }
      
      return analysis.length > 0 ? analysis.join('\n') : 'Criterios de búsqueda generales';
      
    } catch (error) {
      console.error('❌ [AI] Error analyzing failed search:', error);
      return 'Búsqueda específica solicitada';
    }
  }

  /**
   * Generar sugerencias alternativas específicas
   */
  private generateAlternativeSuggestions(searchQuery: string, analysis: string): string {
    const suggestions = [];
    
    // Sugerencias basadas en ubicación
    if (searchQuery.toLowerCase().includes('santiago')) {
      suggestions.push('• Considera también áreas cercanas como Licey o Tamboril');
      suggestions.push('• Explora sectores populares como Gurabo o Villa Bisonó');
    }
    
    if (searchQuery.toLowerCase().includes('santo domingo')) {
      suggestions.push('• Revisa sectores adyacentes como Bella Vista, Cacique, o Hidalgos');
      suggestions.push('• Considera el Distrito Nacional o zonas como Gazcue');
    }
    
    // Sugerencias basadas en presupuesto
    const budgetMatch = searchQuery.match(/(\d+)/);
    if (budgetMatch) {
      const budget = parseInt(budgetMatch[1]);
      if (budget < 1000) {
        suggestions.push(`• Considera incrementar el presupuesto ligeramente para más opciones`);
        suggestions.push(`• Revisa propiedades en sectores emergentes con mejor precio`);
      }
    }
    
    // Sugerencias basadas en habitaciones
    const roomMatch = searchQuery.match(/(\d+)\s*hab/);
    if (roomMatch) {
      const rooms = parseInt(roomMatch[1]);
      if (rooms >= 3) {
        suggestions.push(`• Considera propiedades de ${rooms - 1} habitaciones más espaciosas`);
        suggestions.push(`• Revisa casas en lugar de apartamentos para más espacio`);
      }
    }
    
    // Sugerencias generales
    suggestions.push('• Amplía el rango de precios para ver más opciones');
    suggestions.push('• Considera propiedades en diferentes sectores de la misma ciudad');
    suggestions.push('• Revisa tanto apartamentos como casas para más variedad');
    
    return suggestions.slice(0, 4).join('\n'); // Limitar a 4 sugerencias para no saturar
  }

  /**
   * Construir respuesta de clarificación cuando hay múltiples propiedades que coinciden
   */
  private buildClarificationResponse(matches: any[], feature: string): string {
    console.log(`🔍 [AI] Building clarification response for ${matches.length} matches with feature: ${feature}`);
    
    let response = `Encontré ${matches.length} propiedades que tienen ${feature}. ¿Podrías ser más específico sobre cuál te interesa?\n\n`;
    
    matches.forEach((match, index) => {
      // Extract basic info from the property context
      const locationMatch = match.content.match(/(santo domingo|punta cana|santiago|[^,\n]+),?\s+([^,\n]+)/i);
      const priceMatch = match.content.match(/(us\$|rd\$|\$)\s*[\d,]+/i);
      const roomMatch = match.content.match(/(\d+)\s*(hab|habitacion)/i);
      
      let description = `${index + 1}. `;
      if (locationMatch) {
        description += `📍 ${locationMatch[0]}`;
      }
      if (priceMatch) {
        description += ` - 💰 ${priceMatch[0]}`;
      }
      if (roomMatch) {
        description += ` - 🏠 ${roomMatch[0]}`;
      }
      description += ` (ID: ${match.slug})`;
      
      response += description + '\n';
    });
    
    response += '\nPuedes responder con el número de la propiedad o mencionando alguna característica específica adicional.';
    
    return response;
  }

  /**
   * Buscar propiedades por descripción/características en el contexto de la conversación
   */
  private async findPropertiesByDescription(message: string, conversationId: string, context: any): Promise<{matches: any[], feature: string}> {
    try {
      const { storage } = await import('../storage');
      const conversation = await storage.getConversationById(conversationId);
      const conversationContext = (conversation?.context as any)?.messages || [];
      console.log(`🔍 [AI] Searching for property by description: "${message}"`);
      
      // Extract properties mentioned in recent conversation context
      const recentProperties: any[] = [];
      
      for (let i = conversationContext.length - 1; i >= 0 && i >= conversationContext.length - 10; i--) {
        const msg = conversationContext[i];
        if (msg.role === 'assistant' && msg.content) {
          // Look for property IDs in multiple formats and associated information
          const propertyPatterns = [
            /\(ID:\s*([A-Z0-9]{8,12})\)/g,  // (ID: ABC123)
            /\*\*ID\*\*:\s*([A-Z0-9]{8,12})/g,  // **ID**: ABC123
            /ID:\s*([A-Z0-9]{8,12})/g  // ID: ABC123
          ];
          
          for (const pattern of propertyPatterns) {
            const matches = [...msg.content.matchAll(pattern)];
            for (const match of matches) {
              const propertyId = match[1];
              // Get fuller context around the property ID
              const startPos = Math.max(0, match.index! - 200);
              const endPos = Math.min(msg.content.length, match.index! + 300);
              const fullContext = msg.content.substring(startPos, endPos);
              
              recentProperties.push({
                slug: propertyId,
                content: fullContext.toLowerCase(),
                position: recentProperties.length + 1
              });
            }
          }
          
          // Also look for properties in URLs (as backup)
          const urlMatches = msg.content.match(/https:\/\/[^\s]+\/propiedad\/([^\/\s]+)/g);
          if (urlMatches) {
            for (const urlMatch of urlMatches) {
              const slugMatch = urlMatch.match(/\/propiedad\/([^\/\s]+)/);
              if (slugMatch) {
                const slug = slugMatch[1];
                const contextAround = this.getContextAroundUrl(msg.content, urlMatch);
                recentProperties.push({
                  slug: slug,
                  content: contextAround.toLowerCase()
                });
              }
            }
          }
        }
      }
      
      console.log(`🏠 [AI] Found ${recentProperties.length} recent properties in context`);
      
      if (recentProperties.length === 0) {
        return { matches: [], feature: '' };
      }
      
      // Extract key features from user's message
      const messageLower = message.toLowerCase();
      const features = this.extractPropertyFeatures(messageLower);
      
      console.log(`🔍 [AI] Extracted features from message:`, features);
      
      // Find matching properties with smart contextual matching
      const matches = this.smartPropertyMatching(recentProperties, features, message);
      
      console.log(`🎯 [AI] Found ${matches.length} matching properties`);
      
      const mainFeature = features.length > 0 ? features[0] : 'la característica mencionada';
      
      return {
        matches: matches,
        feature: mainFeature
      };
      
    } catch (error) {
      console.error('❌ [AI] Error finding property by description:', error);
      return { matches: [], feature: '' };
    }
  }

  /**
   * Extraer características/features de un mensaje incluyendo referencias contextuales
   */
  private extractPropertyFeatures(message: string): string[] {
    const features: string[] = [];
    
    // Referencias por posición/orden
    const positionalRefs = [
      'primera', 'primero', 'primer', 'first', '1', 'uno',
      'segunda', 'segundo', 'second', '2', 'dos', 
      'tercera', 'tercero', 'third', '3', 'tres',
      'última', 'último', 'last', 'final'
    ];
    
    for (const ref of positionalRefs) {
      if (message.includes(ref)) {
        features.push(ref);
      }
    }
    
    // Referencias demostrativas
    const demonstrativeRefs = ['este', 'esta', 'esa', 'ese', 'aquel', 'aquella', 'la de', 'el de', 'this', 'that'];
    for (const ref of demonstrativeRefs) {
      if (message.includes(ref)) {
        features.push(ref);
      }
    }
    
    // Features relacionadas con espacios exteriores
    if (message.includes('terraza') || message.includes('terrace')) {
      features.push('terraza', 'terrace');
    }
    if (message.includes('balcon') || message.includes('balcón')) {
      features.push('balcon', 'balcón');
    }
    if (message.includes('jardín') || message.includes('jardin')) {
      features.push('jardín', 'jardin');
    }
    if (message.includes('piscina') || message.includes('pool')) {
      features.push('piscina', 'pool');
    }
    if (message.includes('parqueo') || message.includes('parking') || message.includes('garaje')) {
      features.push('parqueo', 'parking', 'garaje');
    }
    
    // Features relacionadas con número de habitaciones
    const roomMatches = message.match(/(\d+)\s*(hab|habitacion|habitaciones|bedroom)/);
    if (roomMatches) {
      features.push(`${roomMatches[1]} hab`, `${roomMatches[1]} habitacion`);
    }
    
    // Features relacionadas con precio
    const priceMatches = message.match(/(us\$|rd\$|\$)\s*[\d,]+/);
    if (priceMatches) {
      features.push(priceMatches[0]);
    }
    
    // Features relacionadas con ubicación específica
    const locations = [
      'santo domingo', 'punta cana', 'santiago', 'zona colonial', 'bella vista', 'cacique', 
      'hidalgos', 'monumenta', 'naco', 'piantini', 'gazcue', 'ensanche', 'el millón', 'millon'
    ];
    for (const location of locations) {
      if (message.includes(location)) {
        features.push(location);
      }
    }
    
    // Features relacionadas con tipo
    if (message.includes('apartamento') || message.includes('apartment')) {
      features.push('apartamento', 'apartment');
    }
    if (message.includes('casa') || message.includes('house')) {
      features.push('casa', 'house');
    }
    if (message.includes('penthouse') || message.includes('ático')) {
      features.push('penthouse', 'ático');
    }
    
    // Features relacionadas con características específicas
    if (message.includes('más caro') || message.includes('más costoso') || message.includes('expensive')) {
      features.push('precio_alto');
    }
    if (message.includes('más barato') || message.includes('económico') || message.includes('cheap')) {
      features.push('precio_bajo');
    }
    if (message.includes('más grande') || message.includes('bigger') || message.includes('larger')) {
      features.push('tamaño_grande');
    }
    if (message.includes('más pequeño') || message.includes('smaller')) {
      features.push('tamaño_pequeño');
    }
    if (message.includes('villa')) {
      features.push('villa');
    }
    
    return features;
  }

  /**
   * Smart property matching que considera posición, referencias y características
   */
  private smartPropertyMatching(recentProperties: any[], features: string[], message: string): any[] {
    const messageLower = message.toLowerCase();
    let matches: any[] = [];

    // 1. Prioridad: Referencias posicionales específicas
    const positionalMatch = this.matchByPosition(recentProperties, messageLower);
    if (positionalMatch) {
      return [positionalMatch];
    }

    // 2. Referencias demostrativas con contexto
    const demonstrativeMatch = this.matchByDemonstrative(recentProperties, messageLower, features);
    if (demonstrativeMatch.length > 0) {
      return demonstrativeMatch;
    }

    // 3. Características específicas (precio, ubicación, tipo)
    matches = recentProperties.filter(property => {
      return features.some(feature => {
        // Match exacto para características importantes
        if (['precio_alto', 'precio_bajo', 'tamaño_grande', 'tamaño_pequeño'].includes(feature)) {
          return this.matchByComparative(property, feature, recentProperties);
        }
        return property.content.includes(feature);
      });
    });

    // 4. Si no hay matches específicos, buscar por características generales
    if (matches.length === 0) {
      matches = recentProperties.filter(property => {
        return features.some(feature => property.content.includes(feature));
      });
    }

    return matches;
  }

  /**
   * Matching por posición ordinal (primera, segunda, última, etc.)
   */
  private matchByPosition(properties: any[], message: string): any | null {
    const positionMap: { [key: string]: number } = {
      'primera': 1, 'primero': 1, 'primer': 1, 'first': 1, '1': 1, 'uno': 1,
      'segunda': 2, 'segundo': 2, 'second': 2, '2': 2, 'dos': 2,
      'tercera': 3, 'tercero': 3, 'third': 3, '3': 3, 'tres': 3,
      'cuarta': 4, 'cuarto': 4, 'fourth': 4, '4': 4, 'cuatro': 4,
      'quinta': 5, 'quinto': 5, 'fifth': 5, '5': 5, 'cinco': 5
    };

    for (const [keyword, position] of Object.entries(positionMap)) {
      if (message.includes(keyword)) {
        const property = properties.find(p => p.position === position);
        if (property) {
          console.log(`🎯 [AI] Found property by position: ${keyword} -> position ${position}`);
          return property;
        }
      }
    }

    // Manejar "última" / "last"
    if (message.includes('última') || message.includes('último') || message.includes('last') || message.includes('final')) {
      const lastProperty = properties[properties.length - 1];
      if (lastProperty) {
        console.log(`🎯 [AI] Found last property`);
        return lastProperty;
      }
    }

    return null;
  }

  /**
   * Matching por referencias demostrativas (este, esa, etc.)
   */
  private matchByDemonstrative(properties: any[], message: string, features: string[]): any[] {
    const demonstratives = ['este', 'esta', 'esa', 'ese', 'aquel', 'aquella', 'la de', 'el de'];
    
    const hasDemonstrative = demonstratives.some(dem => message.includes(dem));
    if (!hasDemonstrative) return [];

    // Si hay demostrativo + característica específica, buscar la combinación
    if (features.length > 1) {
      const specificFeatures = features.filter(f => !demonstratives.includes(f));
      return properties.filter(property => {
        return specificFeatures.some(feature => property.content.includes(feature));
      });
    }

    // Si solo hay demostrativo, devolver la más reciente
    return properties.length > 0 ? [properties[0]] : [];
  }

  /**
   * Matching por comparaciones (más caro, más grande, etc.)
   */
  private matchByComparative(property: any, feature: string, allProperties: any[]): boolean {
    // Extraer precios para comparación
    const prices = allProperties.map(p => {
      const priceMatch = p.content.match(/(us\$|usd)\s*([\d,]+)/i);
      return priceMatch ? parseFloat(priceMatch[2].replace(/,/g, '')) : 0;
    });

    const currentPriceMatch = property.content.match(/(us\$|usd)\s*([\d,]+)/i);
    const currentPrice = currentPriceMatch ? parseFloat(currentPriceMatch[2].replace(/,/g, '')) : 0;

    switch (feature) {
      case 'precio_alto':
        const maxPrice = Math.max(...prices);
        return currentPrice === maxPrice;
      case 'precio_bajo':
        const minPrice = Math.min(...prices.filter(p => p > 0));
        return currentPrice === minPrice;
      case 'tamaño_grande':
        // Buscar área en m²
        const areas = allProperties.map(p => {
          const areaMatch = p.content.match(/(\d+)\s*m²/i);
          return areaMatch ? parseInt(areaMatch[1]) : 0;
        });
        const currentAreaMatch = property.content.match(/(\d+)\s*m²/i);
        const currentArea = currentAreaMatch ? parseInt(currentAreaMatch[1]) : 0;
        const maxArea = Math.max(...areas);
        return currentArea === maxArea;
      case 'tamaño_pequeño':
        const areasSmall = allProperties.map(p => {
          const areaMatch = p.content.match(/(\d+)\s*m²/i);
          return areaMatch ? parseInt(areaMatch[1]) : 0;
        });
        const currentAreaSmallMatch = property.content.match(/(\d+)\s*m²/i);
        const currentAreaSmall = currentAreaSmallMatch ? parseInt(currentAreaSmallMatch[1]) : 0;
        const minArea = Math.min(...areasSmall.filter(a => a > 0));
        return currentAreaSmall === minArea;
      default:
        return false;
    }
  }

  /**
   * Set property context for focused questions
   */
  setPropertyContext(conversationId: string, propertyId: string): void {
    this.propertyContexts.set(conversationId, propertyId);
    console.log(`🎯 [AI] Property context set for conversation ${conversationId}: ${propertyId}`);
  }

  /**
   * Get property context for conversation
   */
  getPropertyContext(conversationId: string): string | undefined {
    return this.propertyContexts.get(conversationId);
  }

  /**
   * Clear property context for conversation
   */
  clearPropertyContext(conversationId: string): void {
    this.propertyContexts.delete(conversationId);
    console.log(`🗑️ [AI] Property context cleared for conversation ${conversationId}`);
  }

  /**
   * Obtener contexto alrededor de una URL en un texto
   */
  private getContextAroundUrl(content: string, url: string): string {
    const urlIndex = content.indexOf(url);
    if (urlIndex === -1) return content;
    
    const start = Math.max(0, urlIndex - 200);
    const end = Math.min(content.length, urlIndex + url.length + 200);
    
    return content.substring(start, end);
  }

  /**
   * Extraer ID de propiedad del contexto de conversación reciente
   */
  private async extractPropertyFromContext(conversationId: string): Promise<string | null> {
    try {
      const { storage } = await import('../storage');
      const conversation = await storage.getConversationById(conversationId);
      const conversationContext = (conversation?.context as any)?.messages || [];
      
      // Buscar mensajes del asistente que contengan IDs de propiedades
      for (let i = conversationContext.length - 1; i >= 0; i--) {
        const msg = conversationContext[i];
        if (msg.role === 'assistant' && msg.content) {
          const propertyIdMatch = msg.content.match(/\*\*ID\*\*:\s*([A-Z0-9]{8,12})/);
          if (propertyIdMatch) {
            return propertyIdMatch[1];
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ [AI] Error extracting property from context:', error);
      return null;
    }
  }

  /**
   * Enviar fotos/videos de propiedad a través de WhatsApp
   */
  private async sendPropertyMedia(conversationId: string, propertySlug: string, media: any): Promise<void> {
    try {
      // Marcar que se deben enviar medios para esta conversación
      // Esto será manejado por el controlador de WhatsApp después del mensaje de texto
      const mediaQueue = {
        conversationId,
        propertySlug,
        images: media.images,
        featuredImage: media.featuredImage,
        virtualTour: media.virtualTour,
        timestamp: Date.now()
      };
      
      // Guardar en memoria temporal para que el controlador pueda acceder
      pendingMediaQueue.set(conversationId, mediaQueue);
      
      console.log(`📸 [AI] Media queued for conversation: ${conversationId}`);
    } catch (error) {
      console.error('❌ [AI] Error queuing media:', error);
    }
  }

  /**
   * Obtener y limpiar media pendiente para una conversación
   */
  static getPendingMedia(conversationId: string): any {
    const media = pendingMediaQueue.get(conversationId);
    if (media) {
      pendingMediaQueue.delete(conversationId);
    }
    return media;
  }

  /**
   * Crear lead automáticamente en AlterEstate cuando hay interés
   */
  async createLeadFromConversation(
    context: any,
    clientPhone: string,
    clientName: string,
    propertyUid?: string,
    notes?: string
  ): Promise<boolean> {
    try {
      if (!context.alterEstateEnabled || !context.alterEstateApiKey) {
        console.log('⚠️ [AI] AlterEstate not configured for lead creation');
        return false;
      }
      
      const { alterEstateService } = await import('./alterEstateService');
      
      const leadData = {
        full_name: clientName || 'Cliente WhatsApp',
        phone: clientPhone,
        email: `${clientPhone}@whatsapp.com`, // Temporal email
        property_uid: propertyUid,
        notes: notes || 'Lead generado automáticamente desde WhatsApp',
        via: 'WhatsApp Bot',
      };
      
      console.log('📝 [AI] Creating lead in AlterEstate:', leadData);
      
      const result = await alterEstateService.createLead(context.alterEstateApiKey, leadData);
      
      console.log('✅ [AI] Lead created successfully:', result);
      return true;
      
    } catch (error) {
      console.error('❌ [AI] Error creating lead:', error);
      return false;
    }
  }

  /**
   * Evaluar calificación del cliente usando sistema de 7 pasos (Sección 2 especificaciones)
   * 1. Información Personal 2. Objetivo 3. Presupuesto 4. Ubicación 
   * 5. Especificaciones 6. Amenidades 7. Contacto
   */
  private async assessClientQualification(message: string, conversationId: string): Promise<{
    isQualified: boolean;
    missingCriteria: string[];
    extractedCriteria: any;
    qualificationStep: number;
    completedSteps: string[];
  }> {
    try {
      const { storage } = await import('../storage');
      const conversation = await storage.getConversationById(conversationId);
      const conversationContext = (conversation?.context as any)?.messages || [];
      const fullConversation = conversationContext.map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`).join('\n');
      
      const prompt = `Analiza la conversación completa para evaluar la calificación del cliente según los 7 pasos del sistema AlterEstate:

Conversación completa:
${fullConversation}
Mensaje actual: "${message}"

SISTEMA DE CALIFICACIÓN DE 7 PASOS:

1. INFORMACIÓN PERSONAL:
   - Nombre o forma de dirigirse al cliente
   - Situación familiar (soltero, familia, pareja)
   - Contexto personal básico

2. OBJETIVO DE LA BÚSQUEDA:
   - Tipo de operación: compra/alquiler/inversión
   - Propósito: vivienda propia, inversión, Airbnb, familia
   - Urgencia: inmediata, flexible, exploratoria

3. PRESUPUESTO Y FINANCIACIÓN:
   - Rango de presupuesto (mínimo/máximo)
   - Moneda (USD/DOP)
   - Método de pago (contado, financiamiento)

4. UBICACIÓN PREFERIDA:
   - Zonas específicas o sectores
   - Proximidad a servicios (escuelas, trabajo, transporte)
   - Flexibilidad geográfica

5. ESPECIFICACIONES TÉCNICAS:
   - Número de habitaciones
   - Número de baños
   - Área aproximada
   - Parqueos necesarios

6. AMENIDADES Y SERVICIOS:
   - Amenidades prioritarias (piscina, gym, seguridad)
   - Servicios comunitarios
   - Características especiales

7. CONTACTO Y SEGUIMIENTO:
   - Disponibilidad para visitas
   - Método de contacto preferido
   - Timeline para decisión

CALIFICACIÓN:
- CALIFICADO: Pasos 2, 3, 4, 5 completados (mínimo para búsqueda efectiva) + PRESUPUESTO Y UBICACIÓN OBLIGATORIOS
- PARCIALMENTE CALIFICADO: 2-3 pasos completados
- NO CALIFICADO: 0-1 pasos completados

REGLAS CRÍTICAS OBLIGATORIAS:
- PRESUPUESTO: Debe tener budget.min O budget.max definido (no null)
- UBICACIÓN: Debe tener location.zones definido (puede ser ["cualquier_zona"] pero NO null)
- NO permitir búsquedas sin ambos campos definidos

Responde en JSON:
{
  "isQualified": boolean,
  "qualificationStep": number_1_to_7,
  "completedSteps": ["step1", "step2", "step3"],
  "missingCriteria": ["criterio1", "criterio2"],
  "extractedCriteria": {
    "personalInfo": {
      "name": "string_or_null",
      "familySituation": "soltero|familia|pareja|null"
    },
    "searchObjective": {
      "operation": "compra|alquiler|inversion|null",
      "purpose": "vivienda_propia|inversion|airbnb|familiar|null",
      "urgency": "inmediata|flexible|exploratoria|null"
    },
    "budget": {
      "min": number_or_null,
      "max": number_or_null,
      "currency": "USD|DOP|null",
      "paymentMethod": "contado|financiamiento|null"
    },
    "location": {
      "zones": ["zona1", "zona2"] or ["cualquier_zona"] or null,
      "proximity": ["escuelas", "trabajo"] or null,
      "flexibility": "especifica|flexible|null"
    },
    "specifications": {
      "rooms": number_or_null,
      "bathrooms": number_or_null,
      "area_min": number_or_null,
      "area_max": number_or_null,
      "parking": number_or_null
    },
    "amenities": {
      "priority": ["piscina", "gym", "seguridad"] or null,
      "community": ["parque", "centro_comercial"] or null
    },
    "contact": {
      "availability": "mananas|tardes|fines_semana|null",
      "timeline": "inmediato|semanas|meses|null"
    }
  }
}

IMPORTANTE:
- isQualified=true solo si completedSteps incluye al menos: "step2", "step3", "step4", "step5" Y tiene presupuesto Y ubicación definidos
- qualificationStep = próximo paso a completar (1-7)
- SIEMPRE requerir presupuesto (budget.min/max) y ubicación (location.zones) antes de calificar como listo
- Extraer información específica de toda la conversación, no solo el mensaje actual
- Si el cliente dice "cualquier zona de [ciudad]", "en toda la ciudad", "cualquier zona", "no importa la zona", etc., extraer como zones: ["cualquier_zona"] 
- Ejemplos de zonas válidas: "Piantini", "Naco", "cualquier zona de Santo Domingo", "toda la ciudad", "cualquier zona", "no importa donde"
- Pero SIEMPRE verificar que también tenga presupuesto antes de considerar calificado`;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1200,
        temperature: 0.2,
      });

      // Parse and validate JSON response using centralized function
      const parseResult = parseAndNormalize(
        response.choices[0].message.content,
        QualificationStepSchema,
        // Custom aliases specific to qualification
        {
          'personal': 'personalInfo',
          'personal_info': 'personalInfo',
          'objective': 'searchObjective',
          'search_objective': 'searchObjective'
        }
      );

      let result: any;
      if (!parseResult.data) {
        console.error('❌ [AI] Centralized parsing failed:', parseResult.issues);
        console.log('🔧 [AI] Using fallback qualification result');
        result = this.createFallbackQualificationResult();
        
        // Log parsing issues for debugging
        if (parseResult.issues.length > 0) {
          console.log('🔍 [AI] Parsing issues:', parseResult.issues.join(', '));
        }
      } else {
        result = parseResult.data;
        console.log('✅ [AI] Centralized parsing and validation passed');
        
        // Log any normalization issues if present
        if (parseResult.issues.length > 0) {
          console.log('⚠️ [AI] Parsing warnings:', parseResult.issues.join(', '));
        }
      }
      
      // RETROCOMPATIBILIDAD: Crear mapping plano para código existente con campos correctos
      const legacyExtractedCriteria = {
        operation: result.extractedCriteria?.searchObjective?.operation || null,
        property_type: result.extractedCriteria?.searchObjective?.property_type || null,
        budget_min: result.extractedCriteria?.budget?.min || null,
        budget_max: result.extractedCriteria?.budget?.max || null,
        currency: result.extractedCriteria?.budget?.currency || null,
        rooms: result.extractedCriteria?.specifications?.rooms || null,
        bathrooms: result.extractedCriteria?.specifications?.bathrooms || null,
        zones: result.extractedCriteria?.location?.zones || null,
        area_min: result.extractedCriteria?.specifications?.area_min || null,
        area_max: result.extractedCriteria?.specifications?.area_max || null,
        parking: result.extractedCriteria?.specifications?.parking || null
      };

      // VERIFICACIÓN OBLIGATORIA: PRESUPUESTO Y UBICACIÓN SIEMPRE REQUERIDOS
      const hasBudget = (legacyExtractedCriteria.budget_min || legacyExtractedCriteria.budget_max || 
                        result.extractedCriteria?.budget?.min || result.extractedCriteria?.budget?.max);
      const hasLocation = (legacyExtractedCriteria.zones || result.extractedCriteria?.location?.zones);
      
      if (!hasBudget) {
        if (!result.missingCriteria.includes("presupuesto")) {
          result.missingCriteria.push("presupuesto");
        }
        result.isQualified = false;
        console.log('❌ [AI] Missing mandatory budget - search not allowed');
      }
      
      if (!hasLocation) {
        if (!result.missingCriteria.includes("ubicacion")) {
          result.missingCriteria.push("ubicacion");
        }
        result.isQualified = false;
        console.log('❌ [AI] Missing mandatory location - search not allowed');
      }
      
      console.log(`🔒 [AI] Mandatory check - Budget: ${hasBudget}, Location: ${hasLocation}, Qualified: ${result.isQualified}`);

      // Fusionar datos nuevos y legacy para compatibilidad completa
      result.extractedCriteria = {
        ...result.extractedCriteria,
        ...legacyExtractedCriteria // Campos legacy para retrocompatibilidad
      };
      
      console.log(`🎯 [AI] Qualification assessment: Step ${result.qualificationStep}/7, Qualified: ${result.isQualified}, Completed: ${result.completedSteps.join(', ')}`);
      
      return result;
    } catch (error) {
      console.error('❌ [AI] Error assessing client qualification:', error);
      return this.createFallbackQualificationResult();
    }
  }

  /**
   * Crear resultado de calificación con valores fallback seguros
   */
  private createFallbackQualificationResult(): any {
    return {
      isQualified: false,
      qualificationStep: 1,
      completedSteps: [],
      missingCriteria: ["objetivo", "presupuesto", "ubicacion", "especificaciones"],
      extractedCriteria: {
        // Estructura nueva (nested) - usando nombres correctos del prompt
        personalInfo: {},
        searchObjective: {},
        budget: {},
        location: {},
        specifications: {},
        amenities: {},
        contact: {},
        // Campos legacy para retrocompatibilidad
        operation: null,
        property_type: null,
        budget_min: null,
        budget_max: null,
        currency: null,
        rooms: null,
        bathrooms: null,
        zones: null,
        area_min: null,
        area_max: null,
        parking: null
      }
    };
  }

  /**
   * Generar preguntas de calificación inteligentes según el paso actual del sistema de 7 pasos
   */
  private async askQualifyingQuestions(qualificationStatus: any, context: any): Promise<string> {
    const { qualificationStep, completedSteps, missingCriteria, extractedCriteria } = qualificationStatus;
    
    console.log(`🎯 [AI] Generating qualification questions for step ${qualificationStep}, completed: ${completedSteps.join(', ')}`);
    
    // Construir reconocimiento de información ya proporcionada
    let acknowledgment = "";
    let questions = [];
    
    // RECONOCIMIENTO DE INFORMACIÓN COMPLETADA (usando campos correctos del schema)
    if (completedSteps.includes("step1") && extractedCriteria.personalInfo?.name) {
      acknowledgment = `¡Hola ${extractedCriteria.personalInfo.name}! `;
    } else if (completedSteps.length > 0) {
      acknowledgment = "¡Perfecto! ";
    }
    
    // Usar campos legacy para compatibilidad con código existente
    if (extractedCriteria.operation || extractedCriteria.searchObjective?.operation) {
      const operation = extractedCriteria.operation || extractedCriteria.searchObjective?.operation;
      acknowledgment += `Veo que buscas una propiedad para ${operation}`;
      if (extractedCriteria.property_type) {
        acknowledgment += ` (${extractedCriteria.property_type})`;
      }
      acknowledgment += ". ";
    }
    
    // GENERAR PREGUNTAS SEGÚN EL PASO ACTUAL
    switch (qualificationStep) {
      case 1: // Información Personal
        questions = [
          "👋 ¿Cómo te gusta que te llame?",
          "👨‍👩‍👧‍👦 ¿Buscas para ti solo/a, en pareja, o para la familia?"
        ];
        break;
        
      case 2: // Objetivo de la Búsqueda  
        if (!extractedCriteria.operation && !extractedCriteria.searchObjective?.operation) {
          questions.push("🎯 ¿Estás buscando para comprar, alquilar, o es una inversión?");
        }
        if (!extractedCriteria.searchObjective?.purpose) {
          questions.push("🏡 ¿Es para vivienda propia, inversión, o tienes algún propósito específico?");
        }
        if (!extractedCriteria.searchObjective?.urgency) {
          questions.push("⏰ ¿Qué tan urgente es? ¿Necesitas algo inmediato o puedes tomarte tiempo?");
        }
        break;
        
      case 3: // Presupuesto y Financiación
        if (!extractedCriteria.budget_max && !extractedCriteria.budget?.max) {
          questions.push("💰 ¿Cuál es tu presupuesto aproximado? (puedes darme un rango, ej: entre 150k-250k USD)");
        }
        if (!extractedCriteria.currency && !extractedCriteria.budget?.currency) {
          questions.push("💵 ¿Prefieres manejar el presupuesto en USD o pesos dominicanos?");
        }
        if (!extractedCriteria.budget?.paymentMethod) {
          questions.push("🏦 ¿Planeas pagar de contado o necesitarías financiamiento?");
        }
        break;
        
      case 4: // Ubicación Preferida
        if (!extractedCriteria.zones && !extractedCriteria.location?.zones) {
          questions.push("📍 ¿En qué zona o sector te gustaría? (ej: Piantini, Naco, Evaristo Morales, o dime si tienes flexibilidad)");
        }
        if (!extractedCriteria.location?.proximity) {
          questions.push("🎯 ¿Es importante estar cerca de algún lugar específico? (trabajo, escuelas, centros comerciales)");
        }
        break;
        
      case 5: // Especificaciones Técnicas
        if (!extractedCriteria.rooms && !extractedCriteria.specifications?.rooms) {
          questions.push("🛏️ ¿Cuántas habitaciones necesitas?");
        }
        if (!extractedCriteria.bathrooms && !extractedCriteria.specifications?.bathrooms) {
          questions.push("🚿 ¿Cuántos baños prefieres?");
        }
        if (!extractedCriteria.area_min && !extractedCriteria.specifications?.area_min) {
          questions.push("📐 ¿Tienes alguna preferencia de área en m²? (ej: mínimo 80m², entre 100-150m²)");
        }
        if (!extractedCriteria.parking && !extractedCriteria.specifications?.parking) {
          questions.push("🚗 ¿Necesitas parqueo? ¿Cuántos espacios?");
        }
        break;
        
      case 6: // Amenidades y Servicios
        questions = [
          "🏊‍♀️ ¿Qué amenidades son importantes para ti? (piscina, gym, área social, seguridad 24/7)",
          "🏪 ¿Te interesa estar cerca de servicios específicos? (supermercados, farmacias, restaurantes)"
        ];
        break;
        
      case 7: // Contacto y Seguimiento
        questions = [
          "📅 ¿Cuándo tienes disponibilidad para ver propiedades? (mañanas, tardes, fines de semana)",
          "⏳ ¿En qué timeframe te gustaría tomar una decisión? (días, semanas, meses)"
        ];
        break;
        
      default:
        // Preguntas generales si no hay paso específico
        if (missingCriteria.includes("presupuesto")) {
          questions.push("💰 ¿Cuál es tu presupuesto aproximado?");
        }
        if (missingCriteria.includes("especificaciones")) {
          questions.push("🏠 ¿Cuántas habitaciones y baños necesitas?");
        }
        if (missingCriteria.includes("ubicacion")) {
          questions.push("📍 ¿En qué zona te gustaría?");
        }
        break;
    }
    
    // CONSTRUIR RESPUESTA FINAL
    const greeting = acknowledgment || "¡Excelente! Me encanta ayudarte a encontrar la propiedad perfecta. ";
    
    let explanation = "";
    if (qualificationStep <= 3) {
      explanation = "Para ofrecerte las mejores opciones, necesito conocer algunos detalles importantes:\n\n";
    } else if (qualificationStep <= 5) {
      explanation = "Vamos por buen camino. Ahora necesito algunos detalles técnicos:\n\n";
    } else {
      explanation = "Ya casi terminamos. Solo faltan algunos detalles finales:\n\n";
    }
    
    const questionsList = questions.slice(0, 3).map((q, i) => `${i + 1}. ${q}`).join('\n');
    
    let closing = "";
    if (qualificationStep <= 3) {
      closing = "\n\n¡Con esta información podré mostrarte propiedades que realmente valgan la pena! 😊";
    } else {
      closing = "\n\n¡Ya casi estamos listos para encontrar tu propiedad ideal! 🎯";
    }
    
    return greeting + explanation + questionsList + closing;
  }

  async clearConversationContext(conversationId: string) {
    // Clear conversation context in database
    try {
      const { storage } = await import('../storage');
      await storage.updateConversationContext(conversationId, { 
        messages: [],
        lastUpdated: new Date().toISOString()
      });
      console.log(`🗑️ [AI] Cleared conversation context for ${conversationId}`);
    } catch (error) {
      console.error('❌ [AI] Error clearing conversation context:', error);
    }
  }

  /**
   * Generar mensaje explicativo de por qué las propiedades son ideales para el cliente
   */
  private async generateWhyIdealMessage(extractedCriteria: any, propertyCount: number): Promise<string> {
    try {
      console.log(`💡 [WHY IDEAL] Generating context for ${propertyCount} properties based on criteria:`, extractedCriteria);
      
      const criteria = [];
      
      // Analizar presupuesto
      if (extractedCriteria.budget_min || extractedCriteria.budget_max || extractedCriteria.budget?.min || extractedCriteria.budget?.max) {
        const budgetMin = extractedCriteria.budget_min || extractedCriteria.budget?.min;
        const budgetMax = extractedCriteria.budget_max || extractedCriteria.budget?.max;
        const currency = extractedCriteria.currency || extractedCriteria.budget?.currency || 'USD';
        
        if (budgetMin && budgetMax) {
          criteria.push(`tu presupuesto de ${currency} ${budgetMin.toLocaleString()}-${budgetMax.toLocaleString()}`);
        } else if (budgetMax) {
          criteria.push(`tu presupuesto máximo de ${currency} ${budgetMax.toLocaleString()}`);
        } else if (budgetMin) {
          criteria.push(`tu presupuesto desde ${currency} ${budgetMin.toLocaleString()}`);
        }
      }
      
      // Analizar ubicación
      if (extractedCriteria.zones || extractedCriteria.location?.zones) {
        const zones = extractedCriteria.zones || extractedCriteria.location?.zones;
        if (zones && zones.length > 0) {
          if (zones.includes("cualquier_zona")) {
            criteria.push("tu flexibilidad de ubicación");
          } else if (zones.length === 1) {
            criteria.push(`tu preferencia por la zona de ${zones[0]}`);
          } else {
            criteria.push(`tus zonas preferidas: ${zones.join(', ')}`);
          }
        }
      }
      
      // Analizar especificaciones
      if (extractedCriteria.rooms || extractedCriteria.specifications?.rooms) {
        const rooms = extractedCriteria.rooms || extractedCriteria.specifications?.rooms;
        criteria.push(`tu necesidad de ${rooms} habitaciones`);
      }
      
      if (extractedCriteria.bathrooms || extractedCriteria.specifications?.bathrooms) {
        const bathrooms = extractedCriteria.bathrooms || extractedCriteria.specifications?.bathrooms;
        criteria.push(`${bathrooms} baños`);
      }
      
      // Analizar tipo de operación
      const operation = extractedCriteria.operation || extractedCriteria.searchObjective?.operation;
      let operationText = "";
      if (operation === "compra") {
        operationText = "para comprar";
      } else if (operation === "alquiler") {
        operationText = "para alquilar";
      } else if (operation === "inversion") {
        operationText = "como inversión";
      }
      
      // Analizar situación familiar
      const familySituation = extractedCriteria.personalInfo?.familySituation;
      let familyContext = "";
      if (familySituation === "familia") {
        familyContext = "perfectas para tu familia";
      } else if (familySituation === "pareja") {
        familyContext = "ideales para ti y tu pareja";
      } else if (familySituation === "soltero") {
        familyContext = "perfectas para ti";
      }
      
      // Construir mensaje personalizado
      let message = "";
      
      if (propertyCount === 1) {
        message = "✨ **Encontré la propiedad perfecta para ti**\n\n";
      } else {
        message = `✨ **Seleccioné estas ${propertyCount} propiedades especialmente para ti**\n\n`;
      }
      
      message += "🎯 **¿Por qué son ideales?**\n";
      
      if (criteria.length > 0) {
        message += `Consideré ${criteria.join(', ')}`;
        if (operationText) {
          message += ` ${operationText}`;
        }
        if (familyContext) {
          message += ` - ${familyContext}`;
        }
        message += ".\n\n";
      } else {
        message += "Basándome en el perfil que construimos juntos, estas opciones se ajustan perfectamente a lo que necesitas.\n\n";
      }
      
      if (propertyCount === 1) {
        message += "📋 **Te comparto los detalles:**";
      } else {
        message += "📋 **Te comparto las mejores opciones:**";
      }
      
      console.log(`💡 [WHY IDEAL] Generated message: "${message}"`);
      return message;
      
    } catch (error) {
      console.error('❌ [WHY IDEAL] Error generating context message:', error);
      // Fallback message
      if (propertyCount === 1) {
        return "✨ **Encontré una propiedad perfecta que se ajusta a lo que buscas**\n\n📋 **Te comparto los detalles:**";
      } else {
        return `✨ **Seleccioné estas ${propertyCount} propiedades especialmente para ti**\n\n📋 **Te comparto las mejores opciones:**`;
      }
    }
  }

  /**
   * Send conversational property introductions with variations and descriptions
   */
  private async sendConversationalPropertyIntros(
    properties: any[],
    aeToken: string,
    instanceName: string,
    phoneNumber: string,
    criteria: any
  ): Promise<void> {
    try {
      const { alterEstateService } = await import('./alterEstateService');
      const { evolutionApiService } = await import('./evolutionApiService');
      
      console.log(`💬 [CONVERSATIONAL] Creating personalized intros for ${properties.length} properties`);
      
      const messageVariations = {
        first: [
          "Tengo {propertyType} en {location}. {description} {ideal_reason}",
          "Encontré {propertyType} en {location} que me parece perfecto para ti. {description} {ideal_reason}",
          "Te tengo {propertyType} en {location}. {description} {ideal_reason}"
        ],
        second: [
          "También tengo {propertyType} en {location}, que es posible que te guste. {description}",
          "Además, hay {propertyType} en {location} que podría interesarte. {description}",
          "También encontré {propertyType} en {location}. {description}"
        ],
        third: [
          "Adicionalmente, puedo ofrecerte {propertyType} en {location}, que tiene {description}",
          "Por último, tengo {propertyType} en {location}. {description}",
          "Y también está {propertyType} en {location}, con {description}"
        ]
      };

      for (let i = 0; i < Math.min(properties.length, 3); i++) {
        const property = properties[i];
        
        try {
          // Get detailed property information
          const propertyDetail = await alterEstateService.getPropertyDetail(aeToken, property.slug);
          
          // Extract key information
          const propertyType = this.getPropertyTypeInSpanish(property);
          const location = this.getFormattedLocation(property);
          const description = this.createPropertyDescription(propertyDetail, criteria);
          const idealReason = i === 0 ? this.createIdealReason(criteria) : '';
          
          // Select message template based on position
          let templates;
          if (i === 0) templates = messageVariations.first;
          else if (i === 1) templates = messageVariations.second;
          else templates = messageVariations.third;
          
          // Pick a random variation
          const template = templates[Math.floor(Math.random() * templates.length)];
          
          // Fill template with property information
          let message = template
            .replace('{propertyType}', propertyType)
            .replace('{location}', location)
            .replace('{description}', description)
            .replace('{ideal_reason}', idealReason);
          
          // Add call-to-action
          message += ". Aquí te envío los detalles.";
          
          console.log(`💬 [CONVERSATIONAL] Sending intro ${i + 1}: "${message.substring(0, 100)}..."`);
          
          // Send the conversational message
          await evolutionApiService.sendMessage(instanceName, phoneNumber, message);
          
          // Staggered timing for natural conversation flow
          if (i < properties.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000 + (i * 1000)));
          }
          
        } catch (propertyError) {
          console.warn(`⚠️ [CONVERSATIONAL] Failed to get details for property ${property.slug}:`, (propertyError as Error).message);
          
          // Fallback to basic message
          const basicMessage = i === 0 
            ? `Tengo una propiedad en ${property.sector || 'excelente ubicación'} que podría interesarte. Aquí te envío los detalles.`
            : `También tengo otra opción en ${property.sector || 'buena zona'}. Te comparto la información.`;
          
          await evolutionApiService.sendMessage(instanceName, phoneNumber, basicMessage);
          
          if (i < properties.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      console.log(`✅ [CONVERSATIONAL] Successfully sent ${Math.min(properties.length, 3)} conversational intros`);
      
    } catch (error) {
      console.error('❌ [CONVERSATIONAL] Error sending property intros:', error);
      // Don't throw - allow carousel to continue
    }
  }

  /**
   * Get property type in Spanish for conversational messages
   */
  private getPropertyTypeInSpanish(property: any): string {
    const category = property.category?.name || property.category || '';
    const categoryLower = category.toLowerCase();
    
    if (categoryLower.includes('apartment') || categoryLower.includes('apartamento')) {
      return Math.random() > 0.5 ? 'un apartamento' : 'un apartamento nuevo';
    }
    if (categoryLower.includes('house') || categoryLower.includes('casa')) {
      return Math.random() > 0.5 ? 'una casa' : 'una casa hermosa';
    }
    if (categoryLower.includes('penthouse')) {
      return 'un penthouse';
    }
    if (categoryLower.includes('studio') || categoryLower.includes('estudio')) {
      return 'un estudio';
    }
    
    return 'una propiedad';
  }

  /**
   * Format location for conversational messages
   */
  private getFormattedLocation(property: any): string {
    if (property.is_project_v2 && property.development_name) {
      return `el ${property.development_name}`;
    }
    
    const sector = property.sector?.name || property.sector || '';
    if (sector) {
      return sector;
    }
    
    const city = property.city?.name || property.city || '';
    if (city) {
      return city;
    }
    
    return 'excelente ubicación';
  }

  /**
   * Create property description from AlterEstate details
   */
  private createPropertyDescription(propertyDetail: any, criteria: any): string {
    const parts = [];
    
    // Basic specs
    if (propertyDetail.technical?.rooms && propertyDetail.technical.rooms > 0) {
      parts.push(`${propertyDetail.technical.rooms} habitaciones`);
    }
    
    if (propertyDetail.technical?.bathrooms && propertyDetail.technical.bathrooms > 0) {
      const bathroomText = propertyDetail.technical.bathrooms === 1 ? 'baño' : 'baños';
      
      // Check for master bathroom
      if (propertyDetail.technical.rooms >= 2 && propertyDetail.technical.bathrooms >= 2) {
        parts.push(`${propertyDetail.technical.bathrooms} ${bathroomText} (1 de ellos en la habitación principal)`);
      } else {
        parts.push(`${propertyDetail.technical.bathrooms} ${bathroomText}`);
      }
    }
    
    // Use property description if available
    if (propertyDetail.basic?.description) {
      const cleanDescription = propertyDetail.basic.description
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);
      
      if (cleanDescription.length > 50) {
        return `Tiene ${parts.join(' y ')}. ${cleanDescription}`;
      }
    }
    
    // Location benefits
    const locationBenefits = [
      'Esta ubicado en una zona de fácil acceso a comercios, supermercados, colegios y vías principales',
      'La zona tiene excelente conectividad y servicios cercanos',
      'Está en una ubicación estratégica con fácil acceso a todo',
      'La zona es muy tranquila y con buena valorización'
    ];
    
    const selectedBenefit = locationBenefits[Math.floor(Math.random() * locationBenefits.length)];
    
    if (parts.length > 0) {
      return `Tiene ${parts.join(' y ')}. ${selectedBenefit}`;
    } else {
      return selectedBenefit;
    }
  }

  /**
   * Create ideal reason for first property
   */
  private createIdealReason(criteria: any): string {
    const reasons = [];
    
    // Budget match
    if (criteria.budget_min || criteria.budget_max) {
      reasons.push('se ajusta a tu presupuesto');
    }
    
    // Family-oriented
    if (criteria.rooms >= 2 || criteria.specifications?.rooms >= 2) {
      reasons.push('ideal para tu familia');
    }
    
    // Location match
    if (criteria.zones || criteria.location?.zones) {
      reasons.push('está en la zona que buscas');
    }
    
    if (reasons.length > 0) {
      return `. ${reasons[0].charAt(0).toUpperCase() + reasons[0].slice(1)}`;
    }
    
    return '. Ideal para lo que necesitas';
  }
}

export const aiService = new AIService();
