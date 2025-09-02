import { evolutionApiService } from './evolutionApiService';
import { aiService } from './aiService';
import { messageBufferService } from './messageBufferService';
import { storage } from '../storage';

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

      // Verificar que la instancia pertenece al usuario
      const dbInstance = await storage.getWhatsappInstance(instanceName);
      if (!dbInstance) {
        console.error(`❌ [INTERNAL] Instance ${instanceName} not found for user ${userId}`);
        return;
      }
      console.log(`✅ [INTERNAL] Database instance found: ${dbInstance.id}`);

      // Buscar o crear conversación
      const phoneNumber = messageData.remoteJid.replace('@s.whatsapp.net', '');
      let conversation = await storage.getConversationByPhone(dbInstance.id, phoneNumber);
      
      if (!conversation) {
        console.log(`🆕 [INTERNAL] Creating new conversation for phone: ${phoneNumber}`);
        conversation = await storage.createConversation({
          userId,
          whatsappInstanceId: dbInstance.id,
          clientPhone: phoneNumber,
          clientName: messageData.senderName || 'Unknown',
        });
        console.log(`✅ [INTERNAL] New conversation created: ${conversation.id}`);
      } else {
        console.log(`✅ [INTERNAL] Existing conversation found: ${conversation.id}`);
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
          userId,
          async (combinedMessage: string) => {
            await this.processWithAI(instanceName, messageData.remoteJid, combinedMessage, conversation.id, dbInstance.id);
          }
        );
      } else {
        console.log(`⏭️ [INTERNAL] Skipping AI processing - fromMe: ${messageData.fromMe}, message: "${messageData.message}"`);
      }

    } catch (error) {
      console.error('❌ [INTERNAL] Error handling incoming message:', error);
    }
  }

  private async processWithAI(instanceName: string, remoteJid: string, message: string, conversationId: string, whatsappInstanceId: string) {
    try {
      console.log(`🚀 [INTERNAL AI] Starting AI processing`);
      console.log(`🚀 [INTERNAL AI] Instance: ${instanceName}`);
      console.log(`🚀 [INTERNAL AI] RemoteJid: ${remoteJid}`);
      console.log(`🚀 [INTERNAL AI] Message: "${message}"`);
      console.log(`🚀 [INTERNAL AI] ConversationId: ${conversationId}`);
      
      // Obtener conversación para obtener userId
      const conversation = await storage.getConversationById(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Obtener configuración del usuario
      const settings = await storage.getUserSettings(conversation.userId);
      console.log(`⚙️ [INTERNAL AI] User settings loaded for user: ${conversation.userId}`);
      
      // Obtener configuración de IA del usuario
      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
      console.log(`📞 [INTERNAL AI] Phone number: ${phoneNumber}`);
      
      // Build proper context with AlterEstate integration
      const context = {
        assistantName: settings?.assistantName || 'Asistente Inmobiliario',
        assistantPersonality: settings?.assistantPersonality,
        customSystemPrompt: settings?.systemPrompt,
        language: settings?.language || 'es',
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
        if (pendingMedia.type === 'carousel') {
          console.log('🎠 [INTERNAL AI] Pending carousel detected, sending property cards...');
          await this.sendPropertyCarousel(pendingMedia.properties, instanceName, phoneNumber, conversationId, whatsappInstanceId);
        } else {
          console.log('📸 [INTERNAL AI] Pending media detected, processing...');
          await this.sendPropertyMediaFromQueue(pendingMedia, instanceName, phoneNumber, conversationId, whatsappInstanceId);
        }
      }

      if (aiResponse && aiResponse.trim()) {
        console.log(`📱 [INTERNAL AI] Attempting to send message via ${instanceName} to ${phoneNumber}`);

        // Usar respuestas humanizadas
        await messageBufferService.humanizeResponse(
          aiResponse,
          conversation.userId,
          async (chunk: string) => {
            // Enviar cada chunk a través del servicio interno
            const sendResult = await evolutionApiService.sendMessage(instanceName, phoneNumber, chunk);
            console.log(`📤 [INTERNAL AI] Chunk send result:`, sendResult);
            
            // Guardar cada chunk en la base de datos
            await storage.createMessage({
              conversationId,
              whatsappInstanceId,
              messageId: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              fromMe: true,
              messageType: 'text',
              content: chunk,
              timestamp: new Date(),
            });
          }
        );

        console.log(`✅ [INTERNAL AI] AI response sent and saved via ${instanceName} to ${phoneNumber}`);
      } else {
        console.log(`⚠️ [INTERNAL AI] Empty or invalid AI response received`);
      }

    } catch (error: any) {
      console.error('❌ [INTERNAL AI] Error processing AI response:', error);
      console.error('❌ [INTERNAL AI] Error stack:', error.stack);
    }
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
      
      // Enviar mensaje introductorio
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