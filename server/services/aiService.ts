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
      
      // Check if web scraping is enabled (preferred) or AlterEstate (fallback)
      const { internalPropertyService } = await import('./internalPropertyService');
      const isScrapingEnabled = await internalPropertyService.isScrapingEnabled(userId);
      
      if (isScrapingEnabled || (context.alterEstateEnabled && context.alterEstateToken)) {
        const dataSource = isScrapingEnabled ? 'internal' : 'alterestate';
        console.log(`🏘️ [AI] Property integration enabled (${dataSource}), checking for property search intent`);
        
        // FIRST: Check if user is requesting property media (photos/videos) - this has priority
        if (this.isRequestingPropertyMedia(message)) {
          console.log('📸 [AI] Property media request detected');
          return await this.processPropertyMediaRequest(message, context, conversationId, dataSource);
        }
        
        // SECOND: Detect if user is searching for properties
        const intent = await this.detectIntent(message);
        
        if (intent.intent === 'search_property' && intent.confidence > 0.6) {
          console.log(`🔍 [AI] Property search intent detected, querying ${dataSource} data`);
          return await this.processPropertySearch(message, context, conversationId, dataSource);
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
- Si el cliente quiere hablar con una persona real, indica que puedes transferir la conversación${alterEstateEnabled ? '\n- ⚠️ IMPORTANTE: Cuando se requiera información sobre propiedades, SOLAMENTE proporciona datos que se encuentren en AlterEstate CRM. NO inventes ni uses información general sobre propiedades que no esté disponible en el sistema CRM.' : ''}

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

  /**
   * Procesar búsqueda de propiedades usando datos internos o AlterEstate
   */
  private async processPropertySearch(message: string, context: any, conversationId: string, dataSource: string = 'alterestate'): Promise<string> {
    try {
      let properties: any[] = [];
      let carouselData: any[] = [];
      
      if (dataSource === 'internal') {
        // Usar datos internos de web scraping Y propiedades manuales
        const { internalPropertyService } = await import('./internalPropertyService');
        const { manualPropertyService } = await import('./manualPropertyService');
        
        console.log('🔍 [AI] Searching properties in internal database + manual properties');
        
        // Buscar en propiedades scraped
        const scrapedProperties = await internalPropertyService.intelligentPropertySearch(
          context.userId,
          message,
          context.userLocation
        );
        
        // Buscar en propiedades manuales
        const manualProperties = await manualPropertyService.getActiveProperties(context.userId);
        
        // Combinar ambas fuentes - priorizar propiedades manuales
        properties = [
          ...manualProperties.map(prop => ({
            id: prop.id,
            title: prop.title,
            price: prop.price,
            priceText: prop.price,
            location: prop.location,
            propertyType: prop.propertyType,
            bedrooms: prop.bedrooms,
            bathrooms: prop.bathrooms,
            area: prop.area,
            description: prop.description,
            features: prop.features,
            images: prop.images ? JSON.parse(prop.images) : [],
            sourceUrl: '#manual-property', // Identificador para propiedades manuales
            isManual: true
          })),
          ...scrapedProperties
        ];
        
        console.log(`📊 [AI] Found ${manualProperties.length} manual + ${scrapedProperties.length} scraped = ${properties.length} total properties`);
        
        if (properties.length >= 2) {
          carouselData = internalPropertyService.formatPropertiesForCarousel(properties);
        }
      } else {
        // Fallback a AlterEstate
        const { alterEstateService } = await import('./alterEstateService');
        console.log('🔍 [AI] Searching real properties in AlterEstate');
        properties = await alterEstateService.intelligentPropertySearch(
          context.alterEstateToken,
          message,
          context.userLocation
        );
        
        if (properties.length >= 2) {
          carouselData = alterEstateService.formatPropertiesForCarousel(
            properties, 
            context.realEstateWebsiteUrl
          );
        }
      }
      
      if (properties.length === 0) {
        // No se encontraron propiedades, dar respuesta personalizada
        const conversationContext = this.conversationContexts.get(conversationId) || [];
        const dataSourceMessage = dataSource === 'internal' 
          ? 'en nuestra base de datos interna. ¿Te gustaría que configure más sitios web para extraer propiedades adicionales?'
          : 'que coincidan con los criterios. Sugiere ajustar la búsqueda o recomendar áreas alternativas.';
          
        const systemPrompt = this.buildSystemPrompt(context) + 
          `\n\nNOTA: No se encontraron propiedades ${dataSourceMessage}`;
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationContext,
          { role: "user", content: message }
        ];

        const response = await this.openaiClient.chat.completions.create({
          model: "gpt-4o",
          messages: messages as any,
          max_tokens: 300,
          temperature: 0.7,
        });

        return response.choices[0].message.content || `No encontré propiedades disponibles con esos criterios${dataSource === 'internal' ? ' en nuestra base de datos' : ''}. ¿Te gustaría ajustar tu búsqueda?`;
      }
      
      // Si hay múltiples propiedades (2 o más), usar carrusel interactivo
      if (properties.length >= 2) {
        console.log(`🎠 [AI] Found ${properties.length} properties, preparing carousel`);
        
        // Marcar que se debe enviar carrusel
        pendingMediaQueue.set(conversationId, {
          type: 'carousel',
          properties: carouselData,
          timestamp: Date.now()
        });
        
        const propertyNames = properties.map(p => p.title || p.name).join(', ');
        const sourceText = dataSource === 'internal' ? 'en nuestra base de datos' : 'disponibles';
        return `🏠 Encontré ${properties.length} propiedades ${sourceText} que podrían interesarte: ${propertyNames}. Te estoy preparando las tarjetas interactivas con toda la información...`;
      }
      
      // Para una sola propiedad, usar formato mejorado con enlace directo
      const property = properties[0];
      
      let formattedPrice: string;
      let categoryName: string;
      let enhancedPropertyInfo: string;
      
      if (dataSource === 'internal') {
        // Formato para propiedades internas
        formattedPrice = property.price && typeof property.price === 'number' 
          ? `${property.currency || 'RD$'} ${property.price.toLocaleString()}`
          : property.priceText || 'Precio a consultar';
        
        categoryName = property.propertyType || 'Tipo no especificado';
        
        enhancedPropertyInfo = `🏠 **${property.title || 'Propiedad sin nombre'}**

💰 **Precio**: ${formattedPrice}
🏢 **Tipo**: ${categoryName}
🏠 **Habitaciones**: ${property.bedrooms || 'N/A'}
🚿 **Baños**: ${property.bathrooms || 'N/A'}
📍 **Ubicación**: ${property.sector || property.city || 'Ubicación no especificada'}

🔗 **Ver publicación completa**: ${property.sourceUrl}

📝 **Descripción**: ${property.description ? property.description.substring(0, 200) + '...' : 'Ver más detalles en el enlace'}`;
      } else {
        // Formato para AlterEstate (mantener compatibilidad)
        const { alterEstateService } = await import('./alterEstateService');
        const propertyUrl = alterEstateService.getPropertyPublicUrl(
          property.slug, 
          context.realEstateWebsiteUrl
        );
        
        formattedPrice = property.sale_price && typeof property.sale_price === 'number' 
          ? `${property.currency_sale || 'RD$'} ${property.sale_price.toLocaleString()}`
          : 'Precio a consultar';
        
        categoryName = property.category && typeof property.category === 'object' 
          ? property.category.name 
          : property.category || 'Tipo no especificado';
        
        enhancedPropertyInfo = `🏠 **${property.name || 'Propiedad sin nombre'}**

💰 **Precio**: ${formattedPrice}
🏢 **Tipo**: ${categoryName}
🏠 **Habitaciones**: ${property.room || 'N/A'}
🚿 **Baños**: ${property.bathroom || 'N/A'}
📍 **Ubicación**: ${property.sector || 'Sector no especificado'}, ${property.city || 'Ciudad no especificada'}

🔗 **Ver publicación completa**: ${propertyUrl}

📝 **Descripción**: ${property.short_description || 'Información disponible en el enlace'}`;
      }
      
      // Generar respuesta contextual usando IA
      const conversationContext = this.conversationContexts.get(conversationId) || [];
      const dataSourceText = dataSource === 'internal' ? 'nuestra base de datos interna' : 'nuestro CRM';
      const systemPrompt = this.buildSystemPrompt(context) + 
        `\n\nINSTRUCCIONES ESPECIALES: Tienes acceso a propiedades reales de ${dataSourceText}. Presenta estas propiedades de manera natural y conversacional. SIEMPRE incluye el enlace directo a la publicación. Ofrece agendar visitas y crear leads si el cliente muestra interés.`;
      
      const propertyPrompt = `El usuario preguntó: "${message}"

He encontrado esta propiedad real disponible en ${dataSourceText}:

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
      
      console.log(`✅ [AI] Property search response generated with ${properties.length} real properties`);
      return aiResponse;
      
    } catch (error) {
      console.error('❌ [AI] Error in property search:', error);
      const errorMessage = dataSource === 'internal' 
        ? 'Disculpa, tuve un problema consultando nuestra base de datos de propiedades. ¿Podrías repetir tu búsqueda?'
        : 'Disculpa, tuve un problema consultando nuestro inventario de propiedades. ¿Podrías repetir tu búsqueda?';
      return errorMessage;
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
      /foto.*?(del?|de\s+la?)\s+(que|propiedad|casa|apartament)/i
    ];
    
    const hasMediaPattern = mediaPatterns.some(pattern => pattern.test(message));
    
    console.log(`🔍 [AI] Media detection for: "${message}"`);
    console.log(`📸 [AI] Has media keyword: ${hasMediaKeyword}, property keyword: ${hasPropertyKeyword}, pattern: ${hasMediaPattern}`);
    
    return hasMediaPattern || (hasMediaKeyword && hasPropertyKeyword);
  }

  /**
   * Procesar solicitud de medios de propiedades
   */
  private async processPropertyMediaRequest(message: string, context: any, conversationId: string, dataSource: string = 'alterestate'): Promise<string> {
    try {
      console.log('📸 [AI] Processing property media request');
      
      const { internalPropertyService } = await import('./internalPropertyService');
      const isScrapingEnabled = await internalPropertyService.isScrapingEnabled(context.userId);
      
      if (!isScrapingEnabled && (!context.alterEstateEnabled || !context.alterEstateToken)) {
        return 'Para poder enviarte fotos de propiedades, necesito que configures sitios web para extraer propiedades o que AlterEstate CRM esté configurado en las configuraciones.';
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
          
          if (dataSource === 'internal') {
            const { internalPropertyService } = await import('./internalPropertyService');
            const searchResult = await internalPropertyService.intelligentPropertySearch(
              context.userId,
              message,
              context.userLocation
            );
            
            if (searchResult.length > 0) {
              property = searchResult[0];
              propertySlug = property.id; // Use internal ID
              console.log(`🏠 [AI] Found property by search: ${propertySlug} (${property.title})`);
            }
          } else {
            const { alterEstateService } = await import('./alterEstateService');
            const searchResult = await alterEstateService.intelligentPropertySearch(
              context.alterEstateToken,
              message,
              context.userLocation
            );
            
            if (searchResult.length > 0) {
              property = searchResult[0];
              propertySlug = property.slug;
              console.log(`🏠 [AI] Found property by search: ${propertySlug} (${property.name})`);
            }
          }
        }
      }
      
      if (!propertySlug) {
        return 'Me gustaría enviarte las fotos, pero ¿de cuál propiedad específicamente? Por favor menciona el ID de la propiedad que te interesa, o hazme una búsqueda de propiedades primero.';
      }
      
      // Get property media from appropriate source
      let media: any;
      if (dataSource === 'internal') {
        const { internalPropertyService } = await import('./internalPropertyService');
        media = await internalPropertyService.getPropertyMedia(context.userId, propertySlug);
      } else {
        const { alterEstateService } = await import('./alterEstateService');
        media = await alterEstateService.getPropertyMedia(context.alterEstateToken, propertySlug);
      }
      
      // Send media through WhatsApp queue system
      await this.sendPropertyMedia(conversationId, propertySlug, media);
      
      if (media.images.length === 0 && !media.featuredImage) {
        return 'Esta propiedad no tiene fotos disponibles en este momento. ¿Te gustaría que coordine una visita para que puedas verla en persona?';
      }
      
      // This special message triggers the WhatsApp controller to send the actual photos
      let response = `Te estoy preparando las fotos de esta propiedad. Un momento por favor...`;
      
      if (media.images.length > 0) {
        response = `📸 Te estoy preparando ${media.images.length + (media.featuredImage ? 1 : 0)} fotos de esta propiedad. Un momento por favor...`;
      }
      
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

  clearConversationContext(conversationId: string) {
    this.conversationContexts.delete(conversationId);
  }
}

export const aiService = new AIService();
