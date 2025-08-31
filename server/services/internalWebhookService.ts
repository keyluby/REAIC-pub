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
      
      // Obtener configuración de IA del usuario
      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
      console.log(`📞 [INTERNAL AI] Phone number: ${phoneNumber}`);
      
      console.log(`🤖 [INTERNAL AI] Calling aiService.processConversation...`);
      const aiResponse = await aiService.processConversation(
        conversationId,
        conversationId, // usando conversationId como sessionId
        message,
        {
          assistantName: 'Asistente Inmobiliario',
          context: 'eres un asistente de bienes raíces especializado en ayudar a clientes con propiedades'
        }
      );

      console.log(`📤 [INTERNAL AI] AI response received: "${aiResponse}"`);

      if (aiResponse && aiResponse.trim()) {
        console.log(`📱 [INTERNAL AI] Attempting to send message via ${instanceName} to ${phoneNumber}`);
        
        // Obtener userId desde conversación
        const conversation = await storage.getConversationById(conversationId);
        if (!conversation) {
          throw new Error(`Conversation ${conversationId} not found`);
        }

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