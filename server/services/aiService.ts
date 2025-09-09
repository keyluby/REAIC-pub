import OpenAI from "openai";

// Queue para media pendientes de envío
const pendingMediaQueue = new Map<string, any>();

export class AIService {
  private openaiClient: OpenAI;
  private conversationContexts = new Map<string, any[]>();

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
        const conversationContext = this.conversationContexts.get(conversationId) || [];
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

      return JSON.parse(response.choices[0].message.content || '{"recommendations": []}');
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

      return JSON.parse(response.choices[0].message.content || '{"intent": "ask_question", "confidence": 0.5}');
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

      return JSON.parse(response.choices[0].message.content || '{"intent": "ask_question", "confidence": 0.5}');
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
      
      let searchQuery = message;
      
      // Si es un refinamiento, combinar con contexto de búsquedas anteriores
      if (isRefinement) {
        const conversationContext = this.conversationContexts.get(conversationId) || [];
        const previousSearches = conversationContext
          .filter(msg => msg.role === 'user')
          .map(msg => msg.content)
          .join(' ');
        
        searchQuery = `${previousSearches} ${message}`;
        console.log(`🔄 [AI] Refining previous search with new criteria: "${message}"`);
        console.log(`🔍 [AI] Combined search query: "${searchQuery}"`);
      } else {
        console.log('🔍 [AI] Starting new property search');
        
        // SISTEMA DE CALIFICACIÓN: Verificar si tenemos criterios suficientes para búsqueda
        const qualificationStatus = await this.assessClientQualification(searchQuery, conversationId);
        console.log(`🎯 [AI] Qualification status:`, qualificationStatus);
        
        if (!qualificationStatus.isQualified) {
          console.log(`❓ [AI] Client not qualified yet, asking qualifying questions`);
          const qualifyingResponse = await this.askQualifyingQuestions(qualificationStatus, context);
          
          // CRÍTICO: Actualizar contexto de conversación con la pregunta de calificación
          const conversationContext = this.conversationContexts.get(conversationId) || [];
          conversationContext.push(
            { role: "user", content: message },
            { role: "assistant", content: qualifyingResponse }
          );
          
          // Mantener solo últimos 20 mensajes
          if (conversationContext.length > 20) {
            conversationContext.splice(0, conversationContext.length - 20);
          }
          
          this.conversationContexts.set(conversationId, conversationContext);
          console.log(`💾 [AI] Updated conversation context with qualifying question`);
          
          return qualifyingResponse;
        }
        
        console.log(`✅ [AI] Client qualified, proceeding with targeted search`);
      }
      
      // Buscar propiedades reales usando AlterEstate
      console.log('🔍 [AI] Searching real properties in AlterEstate');
      const properties = await alterEstateService.intelligentPropertySearch(
        context.alterEstateToken,
        searchQuery,
        context.userLocation
      );
      
      if (properties.length === 0) {
        console.log(`❌ [AI] No properties found, providing helpful suggestions`);
        
        // Analizar los criterios de búsqueda para dar sugerencias específicas
        const searchAnalysis = await this.analyzeFailedSearch(searchQuery, context);
        
        // Dar respuesta personalizada considerando el historial y sugerir alternativas específicas
        const conversationContext = this.conversationContexts.get(conversationId) || [];
        
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

        this.conversationContexts.set(conversationId, conversationContext);
        
        return aiResponse;
      }
      
      // Para múltiples propiedades, usar formato carrusel
      if (properties.length >= 2) {
        console.log(`🎠 [AI] Found ${properties.length} properties, formatting as carousel`);
        
        // Format properties for recommendations (limit to 6 as specified)
        const carouselProperties = alterEstateService.formatPropertiesForCarousel(
          properties.slice(0, 6), // Limit to 6 property recommendations
          context.realEstateWebsiteUrl
        );

        console.log(`🎠 [AI] Formatted ${carouselProperties.length} properties for carousel`);
        
        // Send properties as carousel via WhatsApp
        try {
          const { evolutionApiService } = await import('./evolutionApiService');
          const instanceName = `instance_${context.userId}`;
          
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
          
          console.log(`📱 [AI] Sending carousel via ${instanceName} to ${phoneNumber}`);
          
          const result = await evolutionApiService.sendPropertyRecommendations(
            instanceName,
            phoneNumber,
            carouselProperties
          );
          
          if (result.success) {
            console.log(`✅ [AI] Property recommendations sent successfully: ${result.messageIds.length} messages`);
            
            // Update conversation context with a summary
            const conversationContext = this.conversationContexts.get(conversationId) || [];
            const contextSummary = `Se enviaron ${carouselProperties.length} propiedades recomendadas (una por mensaje con foto):
${carouselProperties.map((p, i) => `${i + 1}. ${p.title} - ${p.price} (ID: ${p.uid})`).join('\n')}`;
            
            conversationContext.push(
              { role: "user", content: message },
              { role: "assistant", content: contextSummary }
            );

            // Keep only last 20 messages for context
            if (conversationContext.length > 20) {
              conversationContext.splice(0, conversationContext.length - 20);
            }

            this.conversationContexts.set(conversationId, conversationContext);
            
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
          const instanceName = `instance_${context.userId}`;
          
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
      
      // Format single property for carousel display
      const carouselProperties = alterEstateService.formatPropertiesForCarousel(
        [properties[0]], 
        context.realEstateWebsiteUrl
      );

      // Send single property as carousel via WhatsApp
      try {
        const { evolutionApiService } = await import('./evolutionApiService');
        const instanceName = `instance_${context.userId}`;
        
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
        
        console.log(`📱 [AI] Sending single property carousel via ${instanceName} to ${phoneNumber}`);
        
        const result = await evolutionApiService.sendPropertyRecommendations(
          instanceName,
          phoneNumber,
          carouselProperties
        );
        
        if (result.success) {
          console.log(`✅ [AI] Single property carousel sent successfully`);
          
          // Update conversation context with a summary
          const conversationContext = this.conversationContexts.get(conversationId) || [];
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

          this.conversationContexts.set(conversationId, conversationContext);
          
          // Return success message for internal tracking
          return `Propiedad enviada en formato carrusel con foto y botones`;
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
        const conversationContext = this.conversationContexts.get(conversationId) || [];
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

      // Keep only last 10 messages for context
      if (conversationContext.length > 20) {
        conversationContext.splice(0, conversationContext.length - 20);
      }

      this.conversationContexts.set(conversationId, conversationContext);
      
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
      const conversationContext = this.conversationContexts.get(conversationId) || [];
      console.log(`🔍 [AI] Searching for property by description: "${message}"`);
      
      // Extract properties mentioned in recent conversation context
      const recentProperties: any[] = [];
      
      for (let i = conversationContext.length - 1; i >= 0 && i >= conversationContext.length - 10; i--) {
        const msg = conversationContext[i];
        if (msg.role === 'assistant' && msg.content) {
          // Look for property IDs and associated information
          const propertyMatches = msg.content.match(/\*\*ID\*\*:\s*([A-Z0-9]{8,12})[^]*?(?=\*\*ID\*\*|$)/g);
          if (propertyMatches) {
            for (const match of propertyMatches) {
              const idMatch = match.match(/\*\*ID\*\*:\s*([A-Z0-9]{8,12})/);
              if (idMatch) {
                const propertyId = idMatch[1];
                recentProperties.push({
                  slug: propertyId,
                  content: match.toLowerCase()
                });
              }
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
      
      // Find matching properties
      const matches = recentProperties.filter(property => {
        return features.some(feature => property.content.includes(feature));
      });
      
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
   * Extraer características/features de un mensaje
   */
  private extractPropertyFeatures(message: string): string[] {
    const features: string[] = [];
    
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
    
    // Features relacionadas con ubicación
    const locations = ['santo domingo', 'punta cana', 'santiago', 'zona colonial', 'bella vista', 'cacique', 'hidalgos', 'monumenta'];
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
    if (message.includes('villa')) {
      features.push('villa');
    }
    
    return features;
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
      const conversationContext = this.conversationContexts.get(conversationId) || [];
      
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
   * Evaluar si el cliente ha proporcionado criterios suficientes para una búsqueda dirigida
   */
  private async assessClientQualification(message: string, conversationId: string): Promise<{
    isQualified: boolean;
    missingCriteria: string[];
    extractedCriteria: any;
  }> {
    try {
      const conversationContext = this.conversationContexts.get(conversationId) || [];
      const fullConversation = conversationContext.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      
      const prompt = `Analiza la conversación de este cliente de bienes raíces para determinar si tiene criterios suficientes para una búsqueda dirigida:

Conversación completa:
${fullConversation}
Mensaje actual: "${message}"

Criterios ESENCIALES para búsqueda dirigida:
1. Presupuesto aproximado (rango mínimo/máximo)
2. Número de habitaciones (preferido)
3. Zona específica o sectores preferidos
4. Tipo de operación (compra/alquiler) - si no está claro asumir compra

Criterios ADICIONALES útiles:
- Número de baños
- Área aproximada en m²
- Amenidades específicas
- Urgencia de la búsqueda

Responde en JSON:
{
  "isQualified": boolean,
  "missingCriteria": ["criterio1", "criterio2"],
  "extractedCriteria": {
    "operation": "compra|alquiler|null",
    "property_type": "apartamento|casa|local|null",
    "budget_min": number_or_null,
    "budget_max": number_or_null,
    "currency": "USD|DOP|null",
    "rooms": number_or_null,
    "bathrooms": number_or_null,
    "zones": ["zona1", "zona2"] or ["cualquier_zona"] or null,
    "area_min": number_or_null,
    "area_max": number_or_null
  }
}

IMPORTANTE: 
- Solo marcar isQualified=true si tiene al menos: presupuesto, habitaciones Y zona específica.
- Si el cliente dice "cualquier zona de [ciudad]" o "en toda la ciudad", extraer como zones: ["cualquier_zona"] y considerar como zona válida.
- Ejemplos de zonas válidas: "Piantini", "Naco", "cualquier zona de Santo Domingo", "toda la ciudad"`;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content || '{"isQualified": false, "missingCriteria": ["presupuesto", "habitaciones", "zona"], "extractedCriteria": {}}');
    } catch (error) {
      console.error('Error assessing client qualification:', error);
      return {
        isQualified: false,
        missingCriteria: ["presupuesto", "habitaciones", "zona"],
        extractedCriteria: {}
      };
    }
  }

  /**
   * Hacer preguntas de calificación profesionales basadas en lo que falta
   */
  private async askQualifyingQuestions(qualificationStatus: any, context: any): Promise<string> {
    const { missingCriteria, extractedCriteria } = qualificationStatus;
    
    // Construir preguntas inteligentes basadas en lo que ya tenemos
    let questions = [];
    let currentInfo = "";
    
    // Mostrar lo que ya sabemos
    if (extractedCriteria.property_type) {
      currentInfo += `Perfecto, veo que buscas ${extractedCriteria.property_type}`;
      if (extractedCriteria.operation) {
        currentInfo += ` para ${extractedCriteria.operation}`;
      }
      currentInfo += ". ";
    }
    
    // Preguntar por presupuesto si falta
    if (missingCriteria.includes("presupuesto")) {
      questions.push("💰 ¿Cuál es tu presupuesto aproximado? (puedes darme un rango, ej: entre 100k-200k USD)");
    }
    
    // Preguntar por habitaciones si falta
    if (missingCriteria.includes("habitaciones")) {
      questions.push("🏠 ¿Cuántas habitaciones necesitas?");
    }
    
    // Preguntar por zona si falta
    if (missingCriteria.includes("zona")) {
      questions.push(`📍 ¿En qué zona o sector específico te gustaría? (ej: Evaristo Morales, Piantini, Arroyo Hondo, etc.)`);
    }
    
    // Preguntar por baños si no se ha mencionado
    if (!extractedCriteria.bathrooms && questions.length < 3) {
      questions.push("🚿 ¿Cuántos baños prefieres?");
    }
    
    // Respuesta profesional y cálida
    const greeting = currentInfo || "¡Excelente! Me encanta ayudarte a encontrar la propiedad perfecta. ";
    const explanation = "Para mostrarte las mejores opciones que realmente se ajusten a tus necesidades, necesito conocer algunos detalles importantes:\n\n";
    const questionsList = questions.slice(0, 3).map((q, i) => `${i + 1}. ${q}`).join('\n');
    const closing = "\n\nCon esta información podré ofrecerte propiedades que realmente valgan la pena tu tiempo. 😊";
    
    return greeting + explanation + questionsList + closing;
  }

  clearConversationContext(conversationId: string) {
    this.conversationContexts.delete(conversationId);
  }
}

export const aiService = new AIService();
