import { evolutionApiService } from './evolutionApiService';
import { aiService } from './aiService';
import { messageBufferService } from './messageBufferService';
import { storage } from '../storage';
import { instanceResolver } from './instanceResolver';

class InternalWebhookService {
  private activeInstances = new Map<string, boolean>();

  constructor() {
    console.log('🔄 Internal Webhook Service initialized');
  }

  // Inicializar todas las instancias existentes al arrancar la aplicación
  async initializeExistingInstances() {
    try {
      console.log('🚀 [STARTUP] Initializing existing WhatsApp instances...');
      
      // Obtener todas las instancias de la base de datos
      const allInstances = await storage.getAllWhatsappInstances();
      console.log(`📊 [STARTUP] Found ${allInstances.length} instances in database`);
      
      let reconnectedCount = 0;
      
      for (const dbInstance of allInstances) {
        try {
          console.log(`🔌 [STARTUP] Processing instance: ${dbInstance.instanceName} for user: ${dbInstance.userId}`);
          
          // Verificar si la instancia ya está activa en Evolution API
          const instanceStatus = await evolutionApiService.getInstanceStatus(dbInstance.instanceName);
          
          if (instanceStatus && instanceStatus.status === 'CONNECTED') {
            console.log(`✅ [STARTUP] Instance ${dbInstance.instanceName} is already connected`);
            
            // Configurar eventos si no están ya configurados
            if (!this.activeInstances.get(dbInstance.instanceName)) {
              await this.setupInstanceEvents(dbInstance.instanceName, dbInstance.userId);
              reconnectedCount++;
            }
          } else {
            console.log(`🔄 [STARTUP] Instance ${dbInstance.instanceName} is not connected, attempting reconnection...`);
            
            try {
              // Intentar reconectar la instancia
              const reconnectResult = await evolutionApiService.createInstance(dbInstance.instanceName);
              if (reconnectResult.success) {
                console.log(`✅ [STARTUP] Successfully reconnected instance: ${dbInstance.instanceName}`);
                
                // Configurar eventos
                await this.setupInstanceEvents(dbInstance.instanceName, dbInstance.userId);
                reconnectedCount++;
                
                // Actualizar estado en la base de datos
                await storage.updateWhatsappInstanceStatus(dbInstance.instanceName, 'CONNECTING');
              }
            } catch (reconnectError) {
              console.error(`❌ [STARTUP] Failed to reconnect instance ${dbInstance.instanceName}:`, reconnectError);
              // Actualizar estado como desconectado
              await storage.updateWhatsappInstanceStatus(dbInstance.instanceName, 'DISCONNECTED');
            }
          }
        } catch (error) {
          console.error(`❌ [STARTUP] Error processing instance ${dbInstance.instanceName}:`, error);
        }
      }
      
      console.log(`🎉 [STARTUP] Initialization complete. Successfully configured ${reconnectedCount} instances.`);
      
    } catch (error) {
      console.error('❌ [STARTUP] Error initializing existing instances:', error);
    }
  }

  // Simular mensaje entrante para pruebas
  async simulateIncomingMessage(instanceName: string, phoneNumber: string, message: string) {
    try {
      console.log(`🧪 [SIMULATE] Simulating incoming message for ${instanceName} from ${phoneNumber}: "${message}"`);
      
      // Crear datos simulados del mensaje
      const simulatedMessageData = {
        instanceName,
        messageKey: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        remoteJid: phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`,
        message: message || 'Mensaje de prueba',
        messageType: 'text',
        timestamp: Date.now(),
        fromMe: false,
        senderName: 'Test User'
      };

      // Verificar que la instancia esté configurada
      const dbInstance = await storage.getWhatsappInstance(instanceName);
      if (!dbInstance) {
        throw new Error(`Instance ${instanceName} not found in database`);
      }

      // Verificar que los eventos estén activos
      if (!this.activeInstances.get(instanceName)) {
        throw new Error(`Instance ${instanceName} events are not configured`);
      }

      console.log(`🧪 [SIMULATE] Triggering handleIncomingMessage for ${instanceName}`);
      
      // Llamar directamente al manejador de mensajes
      await this.handleIncomingMessage(instanceName, simulatedMessageData, dbInstance.userId);
      
      return { success: true, messageData: simulatedMessageData };
      
    } catch (error) {
      console.error('❌ [SIMULATE] Error simulating message:', error);
      throw error;
    }
  }

  // Configurar eventos internos para una instancia
  async setupInstanceEvents(instanceName: string, userId: string) {
    try {
      console.log(`⚡ Setting up internal events for instance: ${instanceName}`);
      
      const events = evolutionApiService.getInstanceEvents(instanceName);
      if (!events) {
        throw new Error(`Instance ${instanceName} not found`);
      }

      // Evitar configurar eventos múltiples veces
      if (this.activeInstances.get(instanceName)) {
        console.log(`⚠️ Events already configured for ${instanceName}`);
        return;
      }

      // Manejar mensajes entrantes
      events.on('message.received', async (messageData) => {
        await this.handleIncomingMessage(instanceName, messageData, userId);
      });

      // Manejar actualizaciones de conexión
      events.on('connection.open', async () => {
        await this.handleConnectionUpdate(instanceName, 'CONNECTED', userId);
      });

      // Manejar QR code actualizado
      events.on('qr.updated', async (qrData) => {
        await this.handleQRUpdate(instanceName, qrData.qrCode, userId);
      });

      this.activeInstances.set(instanceName, true);
      console.log(`✅ Internal events configured for ${instanceName}`);
      
    } catch (error) {
      console.error(`Error setting up events for ${instanceName}:`, error);
    }
  }

  private async handleIncomingMessage(instanceName: string, messageData: any, userId: string) {
    try {
      console.log(`📨 [INTERNAL] Processing message for ${instanceName}:`, {
        from: messageData.remoteJid,
        message: messageData.message,
        type: messageData.messageType,
        fromMe: messageData.fromMe
      });

      // 🎯 RESOLVER: Resolve incoming instance and handle migration
      const resolution = await instanceResolver.resolveForIncoming(instanceName);
      if (!resolution) {
        console.error(`❌ [RESOLVER] Failed to resolve incoming instance: ${instanceName}`);
        return;
      }

      const { userId: resolvedUserId, effectiveInstance, wasUpdated } = resolution;
      
      if (wasUpdated) {
        console.log(`🔄 [RESOLVER] Instance ${instanceName} was auto-activated for user ${resolvedUserId}`);
      }

      // Get database instance for the effective instance
      const dbInstance = await storage.getWhatsappInstance(effectiveInstance);
      if (!dbInstance) {
        console.error(`❌ [INTERNAL] Effective instance ${effectiveInstance} not found`);
        return;
      }
      console.log(`✅ [INTERNAL] Using effective instance: ${effectiveInstance} (ID: ${dbInstance.id})`);

      // CHANGED: Use user-scoped conversation resolution instead of instance-scoped
      const phoneNumber = messageData.remoteJid.replace('@s.whatsapp.net', '');
      let conversation = await storage.getConversationByUserAndPhone(resolvedUserId, phoneNumber);
      
      if (!conversation) {
        console.log(`🆕 [INTERNAL] Creating new conversation for phone: ${phoneNumber}`);
        conversation = await storage.createConversation({
          userId: resolvedUserId,
          whatsappInstanceId: dbInstance.id,
          clientPhone: phoneNumber,
          clientName: messageData.senderName || 'Unknown',
        });
        console.log(`✅ [INTERNAL] New conversation created: ${conversation.id}`);
      } else {
        console.log(`✅ [INTERNAL] Existing conversation found: ${conversation.id}`);
        
        // CHANGED: Always update conversation to use effective instance
        if (conversation.whatsappInstanceId !== dbInstance.id) {
          console.log(`🔄 [RESOLVER] Migrating conversation to effective instance: ${effectiveInstance}`);
          await storage.updateConversationInstance(conversation.id, dbInstance.id);
        }
      }

      await storage.createMessage({
        conversationId: conversation.id,
        whatsappInstanceId: dbInstance.id,
        messageId: messageData.messageKey,
        fromMe: messageData.fromMe,
        messageType: messageData.messageType || 'text',
        content: messageData.message,
        timestamp: new Date(messageData.timestamp),
      });
      console.log(`💾 [INTERNAL] Message stored in database`);

      // Procesar con IA solo si no es de nosotros
      if (!messageData.fromMe && messageData.message && messageData.message.trim()) {
        console.log(`🤖 [INTERNAL] Starting AI processing for conversation ${conversation.id}`);
        console.log(`📝 [INTERNAL] Message content: "${messageData.message}"`);
        console.log(`📊 [INTERNAL] Message type: ${messageData.messageType}`);
        
        // Check if this is a button response first
        const isButtonResponse = await this.handleButtonResponse(
          messageData, 
          instanceName, 
          conversation, 
          dbInstance
        );
        
        if (!isButtonResponse) {
          // Procesar contenido multimedia si existe
          let processedMessage = messageData.message;
          
          if (messageData.mediaBuffer && messageData.messageType) {
            processedMessage = await this.processMultimediaMessage(
              messageData.message, 
              messageData.mediaBuffer,
              messageData.messageType,
              messageData.mimeType
            );
          }
          
          // Usar el buffer de mensajes con el contenido procesado
          await messageBufferService.addMessageToBuffer(
            conversation.id,
            processedMessage,
            messageData.messageKey,
            resolvedUserId,
            async (combinedMessage: string) => {
              await this.processWithAI(messageData.remoteJid, combinedMessage, conversation.id, resolvedUserId, effectiveInstance);
            }
          );
        }
      } else {
        console.log(`⏭️ [INTERNAL] Skipping AI processing - fromMe: ${messageData.fromMe}, message: "${messageData.message}"`);
      }

    } catch (error) {
      console.error('❌ [INTERNAL] Error handling incoming message:', error);
    }
  }

  // Helper method to resolve active instance for user
  private async resolveActiveInstance(userId: string, preferredInstanceName?: string): Promise<{instanceName: string, instanceId: string} | null> {
    try {
      // Step 1: Try to get the current active instance
      const activeInstance = await storage.getActiveWhatsappInstance(userId);
      if (activeInstance) {
        // Verify instance is still connected
        const instanceStatus = await evolutionApiService.getInstanceStatus(activeInstance.instanceName);
        if (instanceStatus && instanceStatus.status === 'CONNECTED') {
          return {
            instanceName: activeInstance.instanceName,
            instanceId: activeInstance.id
          };
        }
        console.log(`⚠️ [DYNAMIC] Active instance ${activeInstance.instanceName} is not connected, looking for fallback`);
      }
      
      // Step 2: If no active instance or it's not connected, try preferred instance
      if (preferredInstanceName) {
        const preferredInstance = await storage.getWhatsappInstance(preferredInstanceName);
        if (preferredInstance && preferredInstance.userId === userId) {
          const instanceStatus = await evolutionApiService.getInstanceStatus(preferredInstanceName);
          if (instanceStatus && instanceStatus.status === 'CONNECTED') {
            console.log(`🔄 [DYNAMIC] Setting preferred instance ${preferredInstanceName} as active for user ${userId}`);
            await storage.setActiveWhatsappInstance(userId, preferredInstanceName);
            return {
              instanceName: preferredInstanceName,
              instanceId: preferredInstance.id
            };
          }
        }
      }
      
      // Step 3: Find any connected instance for the user
      const userInstances = await storage.getUserWhatsappInstances(userId);
      for (const instance of userInstances) {
        const instanceStatus = await evolutionApiService.getInstanceStatus(instance.instanceName);
        if (instanceStatus && instanceStatus.status === 'CONNECTED') {
          console.log(`🔄 [DYNAMIC] Auto-setting instance ${instance.instanceName} as active for user ${userId}`);
          await storage.setActiveWhatsappInstance(userId, instance.instanceName);
          return {
            instanceName: instance.instanceName,
            instanceId: instance.id
          };
        }
      }
      
      console.error(`❌ [DYNAMIC] No connected WhatsApp instance found for user ${userId}`);
      return null;
    } catch (error) {
      console.error(`❌ [DYNAMIC] Error resolving active instance for user ${userId}:`, error);
      return null;
    }
  }

  private async processWithAI(remoteJid: string, message: string, conversationId: string, userId: string, preferredInstanceName?: string) {
    try {
      console.log(`🚀 [INTERNAL AI] Starting AI processing`);
      console.log(`🚀 [INTERNAL AI] RemoteJid: ${remoteJid}`);
      console.log(`🚀 [INTERNAL AI] Message: "${message}"`);
      console.log(`🚀 [INTERNAL AI] ConversationId: ${conversationId}`);
      
      // 🎯 RESOLVER: Use new InstanceResolver instead of old resolveActiveInstance
      const effectiveInstanceName = await instanceResolver.resolveForOutgoing(userId, preferredInstanceName);
      if (!effectiveInstanceName) {
        throw new Error(`No active WhatsApp instance available for user ${userId}`);
      }
      
      console.log(`🎯 [RESOLVER] Resolved outgoing instance: ${effectiveInstanceName}`);
      
      // Get database instance
      const dbInstance = await storage.getWhatsappInstance(effectiveInstanceName);
      if (!dbInstance) {
        throw new Error(`Instance ${effectiveInstanceName} not found in database`);
      }
      
      // Get conversation to verify user ownership
      const conversation = await storage.getConversationById(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }
      
      // Update conversation to use resolved instance if different
      if (conversation.whatsappInstanceId !== dbInstance.id) {
        console.log(`🔄 [RESOLVER] Updating conversation to use resolved instance: ${effectiveInstanceName}`);
        await storage.updateConversationInstance(conversationId, dbInstance.id);
      }

      // Obtener configuración del usuario
      const settings = await storage.getUserSettings(conversation.userId);
      console.log(`⚙️ [INTERNAL AI] User settings loaded for user: ${conversation.userId}`);
      
      // Obtener configuración de IA del usuario
      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
      console.log(`📞 [INTERNAL AI] Phone number: ${phoneNumber}`);
      
      // Build proper context with AlterEstate integration using resolved instance
      const context = {
        assistantName: settings?.assistantName || 'Asistente Inmobiliario',
        assistantPersonality: settings?.assistantPersonality,
        customSystemPrompt: settings?.systemPrompt,
        language: settings?.language || 'es',
        // WhatsApp instance details for AI service (using resolved instance)
        instanceName: effectiveInstanceName,
        phoneNumber: phoneNumber,
        userId: userId,
        // AlterEstate integration
        alterEstateEnabled: settings?.alterEstateEnabled || false,
        alterEstateToken: settings?.alterEstateToken,
        alterEstateApiKey: settings?.alterEstateApiKey,
        userLocation: phoneNumber?.includes('1829') ? 'Santo Domingo' : undefined,
        realEstateWebsiteUrl: settings?.realEstateWebsiteUrl,
      };

      console.log('🎯 [INTERNAL AI] Context:', context);
      
      console.log(`🤖 [INTERNAL AI] Calling aiService.processConversation...`);
      const aiResponse = await aiService.processConversation(
        conversation.userId,
        conversationId,
        message,
        context
      );

      console.log(`📤 [INTERNAL AI] AI response received: "${aiResponse}"`);

      // Check if there are pending media files or carousels to send
      const { AIService } = await import('./aiService');
      const pendingMedia = AIService.getPendingMedia(conversationId);
      
      if (pendingMedia && context.alterEstateToken) {
        // 🎯 RESOLVER: Use InstanceResolver for pending media
        const resolvedInstanceName = await instanceResolver.resolveForOutgoing(userId, effectiveInstanceName);
        if (!resolvedInstanceName) {
          console.error(`❌ [RESOLVER] Cannot send pending media - no active instance for user ${userId}, skipping media but continuing with text response`);
        } else {
          const resolvedInstance = await storage.getWhatsappInstance(resolvedInstanceName);
          if (!resolvedInstance) {
            console.error(`❌ [RESOLVER] Resolved instance ${resolvedInstanceName} not found in database`);
          } else {
            if (pendingMedia.type === 'carousel') {
              console.log('🎠 [INTERNAL AI] Pending carousel detected, sending property cards...');
              await this.sendPropertyCarousel(pendingMedia.properties, resolvedInstanceName, phoneNumber, conversationId, resolvedInstance.id);
            } else {
              console.log('📸 [INTERNAL AI] Pending media detected, processing...');
              await this.sendPropertyMediaFromQueue(pendingMedia, resolvedInstanceName, phoneNumber, conversationId, resolvedInstance.id);
            }
          }
        }
      }

      if (aiResponse && aiResponse.trim()) {
        console.log(`📱 [INTERNAL AI] Attempting to send message via ${effectiveInstanceName} to ${phoneNumber}`);

        // Usar respuestas humanizadas
        await messageBufferService.humanizeResponse(
          aiResponse,
          userId,
          async (chunk: string) => {
            try {
              // 🎯 RESOLVER: Use InstanceResolver for each chunk
              const resolvedInstanceName = await instanceResolver.resolveForOutgoing(userId, effectiveInstanceName);
              if (!resolvedInstanceName) {
                console.error(`❌ [RESOLVER] Cannot resolve active instance for user ${userId}, using fallback ${effectiveInstanceName}`);
                // Fallback to the effective instance
                const sendResult = await evolutionApiService.sendMessage(effectiveInstanceName, phoneNumber, chunk);
                console.log(`📤 [INTERNAL AI] Chunk sent via fallback instance ${effectiveInstanceName}:`, sendResult);
                
                // Save with fallback instance
                await storage.createMessage({
                  conversationId,
                  whatsappInstanceId: dbInstance.id,
                  messageId: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  fromMe: true,
                  messageType: 'text',
                  content: chunk,
                  timestamp: new Date(),
                });
                return;
              }
              
              const resolvedInstance = await storage.getWhatsappInstance(resolvedInstanceName);
              if (!resolvedInstance) {
                console.error(`❌ [RESOLVER] Resolved instance ${resolvedInstanceName} not found in database`);
                return;
              }

              const sendResult = await evolutionApiService.sendMessage(resolvedInstanceName, phoneNumber, chunk);
              console.log(`📤 [INTERNAL AI] Chunk sent via resolved instance ${resolvedInstanceName}:`, sendResult);
              
              // Guardar cada chunk en la base de datos
              await storage.createMessage({
                conversationId,
                whatsappInstanceId: resolvedInstance.id,
                messageId: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                fromMe: true,
                messageType: 'text',
                content: chunk,
                timestamp: new Date(),
              });
            } catch (chunkError) {
              console.error(`❌ [INTERNAL AI] Error sending chunk: "${chunk.substring(0, 50)}...":`, chunkError);
              // Log error but don't throw to prevent disrupting other chunks
            }
          }
        );

        console.log(`✅ [INTERNAL AI] AI response sent and saved via ${effectiveInstanceName} to ${phoneNumber}`);
      } else {
        console.log(`⚠️ [INTERNAL AI] Empty or invalid AI response received`);
      }

    } catch (error: any) {
      console.error('❌ [INTERNAL AI] Error processing AI response:', error);
      console.error('❌ [INTERNAL AI] Error stack:', error.stack);
    }
  }

  /**
   * Handle button responses from interactive messages
   */
  private async handleButtonResponse(
    messageData: any, 
    instanceName: string, 
    conversation: any, 
    dbInstance: any
  ): Promise<boolean> {
    try {
      // Check multiple possible formats for button responses
      const buttonId = this.extractButtonId(messageData);
      
      if (!buttonId) {
        return false; // Not a button response
      }

      console.log(`🔘 [INTERNAL] Button response detected: ${buttonId}`);
      
      // Parse button ID format: action_propertyId (e.g., "details_ABC123XYZ" or "question_ABC123XYZ")
      const buttonParts = buttonId.split('_');
      if (buttonParts.length !== 2) {
        console.log(`⚠️ [INTERNAL] Invalid button ID format: ${buttonId}`);
        return false;
      }

      const [action, propertyId] = buttonParts;
      console.log(`🎯 [INTERNAL] Button action: ${action}, Property ID: ${propertyId}`);

      // Get user settings for AlterEstate integration
      const settings = await storage.getUserSettings(conversation.userId);
      
      if (!settings?.alterEstateEnabled || !settings.alterEstateToken) {
        await this.sendErrorMessage(
          conversation.userId,
          messageData.remoteJid,
          'Para acceder a los detalles de propiedades, necesitas configurar AlterEstate CRM en tu cuenta.'
        );
        return true;
      }

      // Handle different button actions
      switch (action) {
        case 'details':
          await this.handleDetailsButton(conversation.userId, messageData.remoteJid, propertyId, settings);
          break;
        
        case 'question':
          await this.handleQuestionButton(conversation.userId, messageData.remoteJid, propertyId, conversation.id, settings);
          break;
        
        default:
          console.log(`⚠️ [INTERNAL] Unknown button action: ${action}`);
          return false;
      }

      return true; // Button response was handled
      
    } catch (error) {
      console.error('❌ [INTERNAL] Error handling button response:', error);
      return false;
    }
  }

  /**
   * Extract button ID from various message formats
   */
  private extractButtonId(messageData: any): string | null {
    // Check different possible locations for button ID
    if (messageData.buttonResponseMessage?.selectedButtonId) {
      return messageData.buttonResponseMessage.selectedButtonId;
    }
    
    if (messageData.listResponseMessage?.singleSelectReply?.selectedRowId) {
      return messageData.listResponseMessage.singleSelectReply.selectedRowId;
    }
    
    if (messageData.selectedButtonId) {
      return messageData.selectedButtonId;
    }
    
    // Check if the message text contains our button patterns
    const message = messageData.message || '';
    if (message.includes('details_') || message.includes('question_')) {
      const match = message.match(/(details|question)_([A-Z0-9]+)/);
      if (match) {
        return match[0];
      }
    }
    
    return null;
  }

  /**
   * Handle "Ver más detalles" button click
   */
  private async handleDetailsButton(
    userId: string, 
    remoteJid: string, 
    propertyId: string,
    settings: any
  ): Promise<void> {
    try {
      console.log(`🔗 [INTERNAL] Processing details request for property: ${propertyId}`);
      
      // CHANGED: Resolve active instance dynamically
      const activeInstanceInfo = await this.resolveActiveInstance(userId);
      if (!activeInstanceInfo) {
        await this.sendErrorMessage(userId, remoteJid, 'No hay una instancia de WhatsApp activa disponible.');
        return;
      }
      const { instanceName } = activeInstanceInfo;
      
      // Import AlterEstate service
      const { alterEstateService } = await import('./alterEstateService');
      
      // Get property details from AlterEstate
      const propertyDetails = await alterEstateService.getPropertyDetail(
        propertyId,
        settings.alterEstateToken,
        settings.alterEstateApiKey
      );

      if (!propertyDetails) {
        await this.sendErrorMessage(
          userId, 
          remoteJid,
          'No pude encontrar los detalles de esa propiedad. El enlace puede haber expirado.'
        );
        return;
      }

      // Send detailed property information
      const detailsMessage = this.formatPropertyDetailsMessage(propertyDetails);
      
      // Import evolution API service  
      const { evolutionApiService } = await import('./evolutionApiService');
      
      await evolutionApiService.sendMessage(
        instanceName,
        remoteJid.replace('@s.whatsapp.net', ''),
        detailsMessage
      );

      // Send property URL if available
      if (settings.realEstateWebsiteUrl && propertyDetails.uid) {
        const baseUrl = settings.realEstateWebsiteUrl.endsWith('/') ? settings.realEstateWebsiteUrl : settings.realEstateWebsiteUrl + '/';
        const propertyUrl = `${baseUrl}propiedad/${propertyDetails.uid}/`;
        
        await evolutionApiService.sendMessage(
          instanceName,
          remoteJid.replace('@s.whatsapp.net', ''),
          `🔗 Ver propiedad completa: ${propertyUrl}`
        );
      }
      
      console.log(`✅ [INTERNAL] Property details sent for: ${propertyId}`);
      
    } catch (error) {
      console.error('❌ [INTERNAL] Error handling details button:', error);
      await this.sendErrorMessage(
        userId, 
        remoteJid,
        'Hubo un error al obtener los detalles de la propiedad. Por favor intenta de nuevo.'
      );
    }
  }

  /**
   * Handle "Tengo una Pregunta" button click
   */
  private async handleQuestionButton(
    userId: string, 
    remoteJid: string, 
    propertyId: string,
    conversationId: string,
    settings: any
  ): Promise<void> {
    try {
      console.log(`❓ [INTERNAL] Processing question request for property: ${propertyId}`);
      
      // CHANGED: Resolve active instance dynamically
      const activeInstanceInfo = await this.resolveActiveInstance(userId);
      if (!activeInstanceInfo) {
        await this.sendErrorMessage(userId, remoteJid, 'No hay una instancia de WhatsApp activa disponible.');
        return;
      }
      const { instanceName } = activeInstanceInfo;
      
      // Get AI service for context-aware response
      const { aiService } = await import('./aiService');
      
      // Set property context for future questions
      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
      const context = {
        assistantName: settings?.assistantName || 'Asistente Inmobiliario',
        assistantPersonality: settings?.assistantPersonality,
        customSystemPrompt: settings?.customSystemPrompt,
        language: settings?.language || 'es',
        instanceName: instanceName,
        phoneNumber: phoneNumber,
        userId: userId,
        alterEstateEnabled: settings?.alterEstateEnabled || false,
        alterEstateToken: settings?.alterEstateToken,
        alterEstateApiKey: settings?.alterEstateApiKey,
        userLocation: phoneNumber?.includes('1829') ? 'Santo Domingo' : undefined,
        realEstateWebsiteUrl: settings?.realEstateWebsiteUrl,
        focusedPropertyId: propertyId // Set the property as focus for questions
      };

      // Send a contextual prompt
      const questionPrompt = `¡Perfecto! Estoy aquí para responder cualquier pregunta sobre la propiedad ${propertyId}. 

¿Qué te gustaría saber? Puedo ayudarte con:
• 📍 Ubicación y zona
• 💰 Financiamiento y precios
• 🏠 Características del inmueble
• 📋 Documentación y trámites
• 📅 Disponibilidad para visitar

¡Pregúntame lo que necesites!`;

      // Import evolution API service
      const { evolutionApiService } = await import('./evolutionApiService');
      
      await evolutionApiService.sendMessage(
        instanceName,
        phoneNumber,
        questionPrompt
      );
      
      // Store the property context for future AI responses
      aiService.setPropertyContext(conversationId, propertyId);
      
      console.log(`✅ [INTERNAL] Question context set for property: ${propertyId}`);
      
    } catch (error) {
      console.error('❌ [INTERNAL] Error handling question button:', error);
      await this.sendErrorMessage(
        userId, 
        remoteJid,
        'Estoy listo para responder tus preguntas. ¿Qué te gustaría saber sobre esta propiedad?'
      );
    }
  }

  /**
   * Send error message to user with dynamic instance resolution
   */
  private async sendErrorMessage(userId: string, remoteJid: string, message: string): Promise<void> {
    try {
      // FIXED: Already uses dynamic instance resolution correctly
      const activeInstanceInfo = await this.resolveActiveInstance(userId);
      if (!activeInstanceInfo) {
        console.error(`❌ [ERROR] Cannot send error message - no active instance for user ${userId}`);
        return;
      }
      
      const { instanceName } = activeInstanceInfo;
      const { evolutionApiService } = await import('./evolutionApiService');
      await evolutionApiService.sendMessage(
        instanceName,
        remoteJid.replace('@s.whatsapp.net', ''),
        message
      );
    } catch (error) {
      console.error('❌ Error sending error message:', error);
    }
  }

  /**
   * Format property details for message display
   */
  private formatPropertyDetailsMessage(property: any): string {
    let message = `🏠 *DETALLES DE LA PROPIEDAD*\n\n`;
    
    message += `🏷️ *${property.title}*\n`;
    message += `💰 *Precio:* ${property.price}\n`;
    
    if (property.description) {
      message += `📋 *Descripción:* ${property.description}\n`;
    }
    
    if (property.location) {
      message += `📍 *Ubicación:* ${property.location}\n`;
    }
    
    if (property.area) {
      message += `📐 *Área:* ${property.area}m²\n`;
    }
    
    if (property.rooms) {
      message += `🛏️ *Habitaciones:* ${property.rooms}\n`;
    }
    
    if (property.bathrooms) {
      message += `🚿 *Baños:* ${property.bathrooms}\n`;
    }
    
    if (property.features && property.features.length > 0) {
      message += `✨ *Características:*\n`;
      property.features.forEach((feature: string) => {
        message += `• ${feature}\n`;
      });
    }
    
    return message;
  }

  /**
   * Procesa mensajes multimedia (audio e imágenes) usando OpenAI
   */
  private async processMultimediaMessage(
    originalMessage: string,
    mediaBuffer: Buffer,
    messageType: string,
    mimeType?: string
  ): Promise<string> {
    try {
      console.log(`🎯 [MULTIMEDIA] Processing ${messageType} with ${mediaBuffer.length} bytes`);

      switch (messageType) {
        case 'audioMessage':
          try {
            console.log(`🎤 [MULTIMEDIA] Transcribing audio message`);
            const transcription = await aiService.transcribeAudio(mediaBuffer, mimeType);
            console.log(`✅ [MULTIMEDIA] Audio transcribed: "${transcription}"`);
            
            // Si hay caption/texto adicional, combinarlo
            const finalMessage = originalMessage && !originalMessage.includes('[Nota de voz')
              ? `${originalMessage}\n\nTranscripción de audio: ${transcription}`
              : `Transcripción de audio: ${transcription}`;
            
            return finalMessage;
          } catch (error) {
            console.error(`❌ [MULTIMEDIA] Error transcribing audio:`, error);
            return originalMessage || 'No pude procesar la nota de voz. ¿Podrías escribir tu mensaje?';
          }

        case 'imageMessage':
          try {
            console.log(`🖼️ [MULTIMEDIA] Analyzing image message`);
            const imageBase64 = mediaBuffer.toString('base64');
            const imageAnalysis = await aiService.analyzeImage(imageBase64);
            console.log(`✅ [MULTIMEDIA] Image analyzed: "${imageAnalysis}"`);
            
            // Si hay caption/texto adicional, combinarlo
            const finalMessage = originalMessage && !originalMessage.includes('[Imagen')
              ? `${originalMessage}\n\nAnálisis de imagen: ${imageAnalysis}`
              : `Análisis de imagen: ${imageAnalysis}`;
            
            return finalMessage;
          } catch (error) {
            console.error(`❌ [MULTIMEDIA] Error analyzing image:`, error);
            return originalMessage || 'Recibí una imagen pero no pude analizarla. ¿Podrías describirme qué contiene?';
          }

        default:
          console.log(`⚠️ [MULTIMEDIA] Unsupported media type: ${messageType}`);
          return originalMessage;
      }
    } catch (error) {
      console.error(`❌ [MULTIMEDIA] Error processing multimedia message:`, error);
      return originalMessage || 'No pude procesar este tipo de mensaje multimedia.';
    }
  }

  private async handleConnectionUpdate(instanceName: string, status: string, userId: string) {
    try {
      console.log(`🔗 Connection update for ${instanceName}: ${status}`);
      
      // Actualizar estado en la base de datos
      await storage.updateWhatsappInstanceStatus(instanceName, status);
      
      console.log(`✅ Updated instance ${instanceName} status to ${status}`);
      
      // Auto-activate instance if user has no active instance and this one is connected
      if (status === 'CONNECTED') {
        const activeInstance = await storage.getActiveWhatsappInstance(userId);
        if (!activeInstance) {
          console.log(`🔄 [AUTO-ACTIVATE] No active instance for user ${userId}, setting ${instanceName} as active`);
          await storage.setActiveWhatsappInstance(userId, instanceName);
          console.log(`✅ [AUTO-ACTIVATE] Instance ${instanceName} is now active for user ${userId}`);
        }
      }
      
    } catch (error) {
      console.error('Error handling connection update:', error);
    }
  }

  private async handleQRUpdate(instanceName: string, qrCode: string, userId: string) {
    try {
      console.log(`📱 QR code updated for ${instanceName}`);
      
      // Aquí podrías emitir a WebSockets si tienes clientes conectados
      // o actualizar la base de datos con el nuevo QR
      
    } catch (error) {
      console.error('Error handling QR update:', error);
    }
  }

  private async sendPropertyCarousel(
    properties: Array<{
      imageUrl: string;
      title: string;
      price: string;
      description: string;
      propertyUrl: string;
      uid: string;
      slug: string;
    }>,
    instanceName: string,
    phoneNumber: string,
    conversationId: string,
    whatsappInstanceId: string
  ): Promise<void> {
    try {
      console.log(`🎠 [INTERNAL AI] Sending property carousel with ${properties.length} properties`);
      
      // FIXED: Use the passed instanceName (already resolved by caller)
      await evolutionApiService.sendMessage(
        instanceName,
        phoneNumber,
        `🏠 Encontré ${properties.length} propiedades perfectas para ti:`
      );
      
      // Guardar mensaje introductorio
      await storage.createMessage({
        conversationId,
        whatsappInstanceId,
        messageId: `intro_${Date.now()}`,
        fromMe: true,
        messageType: 'text',
        content: `🏠 Encontré ${properties.length} propiedades perfectas para ti:`,
        timestamp: new Date(),
      });
      
      // Esperar un momento antes de enviar las tarjetas
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Enviar carrusel usando Evolution API
      const { whatsappService } = await import('./whatsappService');
      await whatsappService.sendPropertyCarousel(
        instanceName,
        phoneNumber,
        properties
      );
      
      // Mensaje de seguimiento
      await new Promise(resolve => setTimeout(resolve, 2000));
      const followUpMessage = '💡 Toca los botones de las tarjetas para ver más detalles o fotos de cada propiedad. ¿Alguna te llama la atención?';
      
      await evolutionApiService.sendMessage(
        instanceName,
        phoneNumber,
        followUpMessage
      );
      
      // Guardar mensaje de seguimiento
      await storage.createMessage({
        conversationId,
        whatsappInstanceId,
        messageId: `followup_${Date.now()}`,
        fromMe: true,
        messageType: 'text',
        content: followUpMessage,
        timestamp: new Date(),
      });
      
    } catch (error) {
      console.error('❌ [INTERNAL AI] Error sending property carousel:', error);
      // Fallback: enviar como texto
      const textSummary = properties.map((p, i) => 
        `${i + 1}. ${p.title}\n💰 ${p.price}\n📍 ${p.description}\n🔗 ${p.propertyUrl}`
      ).join('\n\n');
      
      await evolutionApiService.sendMessage(
        instanceName,
        phoneNumber,
        `🏠 Propiedades encontradas:\n\n${textSummary}`
      );
    }
  }

  private async sendPropertyMediaFromQueue(
    mediaQueue: any,
    instanceName: string,
    phoneNumber: string,
    conversationId: string,
    whatsappInstanceId: string
  ): Promise<void> {
    try {
      console.log(`📸 [INTERNAL AI] Sending queued media for property: ${mediaQueue.propertySlug}`);
      
      const mediaToSend: string[] = [];
      
      // Agregar imagen destacada si existe
      if (mediaQueue.featuredImage) {
        mediaToSend.push(mediaQueue.featuredImage);
      }
      
      // Agregar imágenes de galería
      if (mediaQueue.images && mediaQueue.images.length > 0) {
        mediaToSend.push(...mediaQueue.images.slice(0, 4)); // Máximo 4 imágenes adicionales
      }
      
      if (mediaToSend.length === 0) {
        console.log('📷 [INTERNAL AI] No media available for this property');
        return;
      }
      
      console.log(`📸 [INTERNAL AI] Sending ${mediaToSend.length} media files`);
      
      // Enviar cada imagen con un delay
      for (let i = 0; i < mediaToSend.length; i++) {
        const mediaUrl = mediaToSend[i];
        console.log(`📤 [INTERNAL AI] Sending media ${i + 1}/${mediaToSend.length}: ${mediaUrl}`);
        
        try {
          const { whatsappService } = await import('./whatsappService');
          await whatsappService.sendMedia(
            instanceName,
            phoneNumber,
            mediaUrl,
            'image',
            i === 0 ? `📸 Propiedad ${mediaQueue.propertySlug}` : ''
          );
          
          // Store media message in database
          await storage.createMessage({
            conversationId,
            whatsappInstanceId,
            messageId: `media_${Date.now()}_${i}`,
            fromMe: true,
            messageType: 'IMAGE',
            content: mediaUrl,
            timestamp: new Date(),
          });
          
          // Delay entre imágenes para evitar spam
          if (i < mediaToSend.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2500));
          }
        } catch (mediaError) {
          console.error(`❌ [INTERNAL AI] Error sending media ${i + 1}:`, mediaError);
        }
      }
      
      // Enviar tour virtual si existe
      if (mediaQueue.virtualTour) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await evolutionApiService.sendMessage(
          instanceName,
          phoneNumber,
          `🎥 Tour Virtual: ${mediaQueue.virtualTour}`
        );
      }
      
    } catch (error) {
      console.error('❌ [INTERNAL AI] Error sending queued media:', error);
    }
  }

  // Remover eventos cuando se desconecte una instancia
  removeInstanceEvents(instanceName: string) {
    const events = evolutionApiService.getInstanceEvents(instanceName);
    if (events) {
      events.removeAllListeners();
    }
    this.activeInstances.delete(instanceName);
    console.log(`🗑️ Removed internal events for ${instanceName}`);
  }

  // Obtener estado de eventos de una instancia
  isInstanceActive(instanceName: string): boolean {
    return this.activeInstances.get(instanceName) || false;
  }

  // Listar todas las instancias activas
  getActiveInstances(): string[] {
    return Array.from(this.activeInstances.keys()).filter(key => this.activeInstances.get(key));
  }

  // Obtener estadísticas de inicialización
  getInitializationStats() {
    return {
      totalActiveInstances: this.activeInstances.size,
      activeInstanceNames: this.getActiveInstances()
    };
  }
}

export const internalWebhookService = new InternalWebhookService();