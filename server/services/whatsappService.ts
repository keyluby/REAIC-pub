import { evolutionApiService } from './evolutionApiService';

export class WhatsAppService {
  constructor() {
    console.log('🔥 WhatsApp Service initialized with internal Evolution API');
  }

  async createInstance(instanceName: string, webhookUrl: string) {
    try {
      console.log(`🚀 Creating internal WhatsApp instance: ${instanceName}`);
      console.log(`🔗 Webhook URL: ${webhookUrl}`);

      const result = await evolutionApiService.createInstance(instanceName, webhookUrl);
      
      // Configurar eventos internos para este webhook
      const events = evolutionApiService.getInstanceEvents(instanceName);
      if (events) {
        // Reenviar eventos como webhooks HTTP si es necesario
        events.on('message.received', async (messageData) => {
          if (webhookUrl) {
            await this.sendWebhookNotification(webhookUrl, 'MESSAGES_UPSERT', messageData);
          }
        });

        events.on('connection.open', async () => {
          if (webhookUrl) {
            await this.sendWebhookNotification(webhookUrl, 'CONNECTION_UPDATE', {
              instanceName,
              state: 'open'
            });
          }
        });
      }

      return {
        success: result.success,
        instanceName: result.instanceName,
        status: result.status
      };
    } catch (error) {
      console.error('Error creating WhatsApp instance:', error);
      throw new Error('Failed to create WhatsApp instance');
    }
  }

  private async sendWebhookNotification(webhookUrl: string, event: string, data: any) {
    try {
      const axios = (await import('axios')).default;
      await axios.post(webhookUrl, {
        event,
        data,
        timestamp: Date.now(),
        instanceName: data.instanceName
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      console.log(`📡 Webhook sent: ${event} to ${webhookUrl}`);
    } catch (error) {
      console.error('Error sending webhook notification:', error);
    }
  }

  async getQRCode(instanceName: string) {
    try {
      const result = await evolutionApiService.getQRCode(instanceName);
      
      if (result.qrCode) {
        return { base64: result.qrCode };
      }
      
      return { 
        status: result.status,
        message: result.status === 'CONNECTED' ? 'Instance already connected' : 'QR code not available yet'
      };
    } catch (error) {
      console.error('Error getting QR code:', error);
      throw new Error('Failed to get QR code');
    }
  }

  async sendMessage(instanceName: string, number: string, message: string) {
    try {
      console.log(`📱 Sending message via internal service - Instance: ${instanceName}, To: ${number}`);
      
      const result = await evolutionApiService.sendMessage(instanceName, number, message);
      
      return {
        success: result.success,
        messageId: result.messageId,
        message: 'Message sent successfully'
      };
    } catch (error: any) {
      console.error('Error sending message:', error.message);
      
      // Manejar errores específicos
      if (error.message.includes('not connected')) {
        throw new Error('WhatsApp instance is not connected. Please scan QR code first.');
      }
      
      if (error.message.includes('not found')) {
        throw new Error('WhatsApp instance not found. Please create it first.');
      }
      
      throw new Error('Failed to send message to WhatsApp');
    }
  }

  private formatPhoneNumber(number: string): string {
    // Remove common WhatsApp suffixes
    let cleaned = number.replace('@s.whatsapp.net', '').replace('@c.us', '');
    
    // Remove any non-numeric characters except +
    cleaned = cleaned.replace(/[^\d+]/g, '');
    
    // Ensure we have a + prefix for international numbers
    if (!cleaned.startsWith('+') && cleaned.length > 10) {
      cleaned = '+' + cleaned;
    }
    
    // For numbers without + and reasonable length, add country code
    if (!cleaned.startsWith('+') && cleaned.length >= 10) {
      console.log('⚠️ Adding default country code +52 (México) to number:', cleaned);
      cleaned = '+52' + cleaned;
    }
    
    return cleaned;
  }

  async getInstanceStatus(instanceName: string) {
    try {
      const result = await evolutionApiService.getInstanceStatus(instanceName);
      
      return {
        instanceName,
        status: result.status,
        connected: result.connected,
        mappedStatus: result.status
      };
    } catch (error) {
      console.error('Error getting instance status:', error);
      return {
        instanceName,
        status: 'ERROR',
        connected: false,
        mappedStatus: 'ERROR'
      };
    }
  }

  async logoutInstance(instanceName: string) {
    try {
      const result = await evolutionApiService.logoutInstance(instanceName);
      return {
        success: result.success,
        message: 'Instance logged out successfully'
      };
    } catch (error) {
      console.error('Error logging out instance:', error);
      throw new Error('Failed to logout WhatsApp instance');
    }
  }

  async deleteInstance(instanceName: string) {
    try {
      const result = await evolutionApiService.deleteInstance(instanceName);
      return {
        success: result.success,
        message: 'Instance deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting instance:', error);
      throw new Error('Failed to delete WhatsApp instance');
    }
  }

  async getAllInstances() {
    try {
      const instances = evolutionApiService.getInstancesList();
      return instances;
    } catch (error) {
      console.error('Error getting instances list:', error);
      return [];
    }
  }

  async sendMediaMessage(instanceName: string, number: string, mediaUrl: string, caption?: string) {
    try {
      console.log(`🖼️ Sending media message - Instance: ${instanceName}, To: ${number}`);
      
      // Por ahora, enviar como mensaje de texto con URL
      // TODO: Implementar envío de media real con Baileys
      const messageWithMedia = caption ? `${caption}\n\n${mediaUrl}` : mediaUrl;
      
      const result = await evolutionApiService.sendMessage(instanceName, number, messageWithMedia);
      
      return {
        success: result.success,
        messageId: result.messageId,
        message: 'Media message sent successfully'
      };
    } catch (error: any) {
      console.error('Error sending media message:', error.message);
      throw new Error('Failed to send media message');
    }
  }

  async setTyping(instanceName: string, number: string, isTyping: boolean) {
    try {
      // Por ahora, solo logear - la funcionalidad de typing se puede implementar después
      console.log(`⌨️ Typing indicator ${isTyping ? 'on' : 'off'} for ${number} via ${instanceName}`);
      return { success: true };
    } catch (error) {
      console.error('Error setting typing status:', error);
      // No lanzar error para typing status ya que no es crítico
      return { success: false };
    }
  }

  async testConnection() {
    try {
      const result = await evolutionApiService.testConnection();
      return {
        success: result.success,
        status: result.success ? 'CONNECTED' : 'ERROR',
        version: result.version,
        activeInstances: result.instances,
        service: 'Internal Evolution API'
      };
    } catch (error: any) {
      console.error('Evolution API internal test failed:', error.message);
      return {
        success: false,
        status: 'ERROR',
        error: error.message,
        service: 'Internal Evolution API'
      };
    }
  }
}

export const whatsappService = new WhatsAppService();