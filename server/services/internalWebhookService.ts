import { evolutionApiService } from './evolutionApiService';
import { aiService } from './aiService';
import { messageBufferService } from './messageBufferService';
import { storage } from '../storage';

class InternalWebhookService {
  private activeInstances = new Map<string, boolean>();

  constructor() {
    console.log('🔄 Internal Webhook Service initialized');
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
      console.log(`📨 Processing internal message for ${instanceName}:`, {
        from: messageData.remoteJid,
        message: messageData.message,
        type: messageData.messageType
      });

      // Verificar que la instancia pertenece al usuario
      const dbInstance = await storage.getWhatsappInstance(instanceName);
      if (!dbInstance) {
        console.error(`❌ Instance ${instanceName} not found for user ${userId}`);
        return;
      }

      // Buscar o crear conversación
      const phoneNumber = messageData.remoteJid.replace('@s.whatsapp.net', '');
      let conversation = await storage.getConversationByPhone(dbInstance.id, phoneNumber);
      
      if (!conversation) {
        conversation = await storage.createConversation({
          userId,
          whatsappInstanceId: dbInstance.id,
          clientPhone: phoneNumber,
          clientName: messageData.senderName || 'Unknown',
        });
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

      // Procesar con IA solo si no es de nosotros
      if (!messageData.fromMe && messageData.message && messageData.message.trim()) {
        console.log(`🤖 Processing message with AI for conversation ${conversation.id}`);
        
        // Procesar con IA directamente por ahora
        await this.processWithAI(instanceName, messageData.remoteJid, messageData.message, conversation.id, dbInstance.id);
      }

    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }

  private async processWithAI(instanceName: string, remoteJid: string, message: string, conversationId: string, whatsappInstanceId: string) {
    try {
      // Obtener configuración de IA del usuario
      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
      
      const aiResponse = await aiService.processConversation(
        conversationId,
        conversationId, // usando conversationId como sessionId
        message,
        {
          assistantName: 'Asistente Inmobiliario',
          context: 'eres un asistente de bienes raíces especializado en ayudar a clientes con propiedades'
        }
      );

      if (aiResponse && aiResponse.trim()) {
        // Enviar respuesta a través del servicio interno
        await evolutionApiService.sendMessage(instanceName, phoneNumber, aiResponse);
        
        // Guardar respuesta de IA en la base de datos
        await storage.createMessage({
          conversationId,
          whatsappInstanceId,
          messageId: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          fromMe: true,
          messageType: 'text',
          content: aiResponse,
          timestamp: new Date(),
        });

        console.log(`✅ AI response sent via ${instanceName} to ${phoneNumber}`);
      }

    } catch (error) {
      console.error('Error processing AI response:', error);
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
}

export const internalWebhookService = new InternalWebhookService();