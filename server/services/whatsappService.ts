import axios from 'axios';

export class WhatsAppService {
  private evolutionApiUrl: string;
  private apiKey: string;

  constructor() {
    // Usar tu servidor VPS automáticamente
    this.evolutionApiUrl = 'https://personal-evolution-api.rcwlba.easypanel.host';
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    };
  }

  async createInstance(instanceName: string, webhookUrl: string) {
    try {
      const response = await axios.post(
        `${this.evolutionApiUrl}/instance/create`,
        {
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: true,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
          }
        },
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating WhatsApp instance:', error);
      throw new Error('Failed to create WhatsApp instance');
    }
  }

  async getQRCode(instanceName: string) {
    try {
      const response = await axios.get(
        `${this.evolutionApiUrl}/instance/connect/${instanceName}`,
        { headers: this.getHeaders() }
      );
      
      // Evolution API puede devolver diferentes formatos
      const data = response.data;
      
      // Si tiene base64, lo usamos directamente
      if (data.base64) {
        return { base64: data.base64 };
      }
      
      // Si tiene pairingCode, puede ser que necesitemos otro endpoint
      if (data.pairingCode) {
        return { base64: data.base64 || null, pairingCode: data.pairingCode };
      }
      
      // Si tiene code (formato común)
      if (data.code) {
        return { base64: data.code };
      }
      
      return data;
    } catch (error) {
      console.error('Error getting QR code:', error);
      throw new Error('Failed to get QR code');
    }
  }

  async sendMessage(instanceName: string, number: string, message: string) {
    try {
      const response = await axios.post(
        `${this.evolutionApiUrl}/message/sendText/${instanceName}`,
        {
          number,
          text: message,
        },
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw new Error('Failed to send message');
    }
  }

  async sendMediaMessage(instanceName: string, number: string, mediaUrl: string, caption?: string) {
    try {
      const response = await axios.post(
        `${this.evolutionApiUrl}/message/sendMedia/${instanceName}`,
        {
          number,
          mediaMessage: {
            mediaUrl,
            caption,
          },
        },
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending media message:', error);
      throw new Error('Failed to send media message');
    }
  }

  async getInstanceStatus(instanceName: string) {
    try {
      const response = await axios.get(
        `${this.evolutionApiUrl}/instance/connectionState/${instanceName}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting instance status:', error);
      throw new Error('Failed to get instance status');
    }
  }

  async logoutInstance(instanceName: string) {
    try {
      const response = await axios.delete(
        `${this.evolutionApiUrl}/instance/logout/${instanceName}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error logging out instance:', error);
      throw new Error('Failed to logout instance');
    }
  }

  async setTyping(instanceName: string, number: string, isTyping: boolean) {
    try {
      const response = await axios.post(
        `${this.evolutionApiUrl}/chat/presence/${instanceName}`,
        {
          number,
          presence: isTyping ? 'composing' : 'available',
        },
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error setting typing status:', error);
      // Don't throw error for typing status as it's not critical
    }
  }

  // Método para diagnosticar la conexión
  async testConnection() {
    try {
      console.log('Testing Evolution API connection...');
      console.log('URL:', this.evolutionApiUrl);
      console.log('API Key exists:', !!this.apiKey);
      
      // Test básico - obtener información del servidor
      const response = await axios.get(
        `${this.evolutionApiUrl}/`,
        { headers: this.getHeaders() }
      );
      
      return {
        success: true,
        status: response.status,
        data: response.data
      };
    } catch (error: any) {
      console.error('Evolution API connection test failed:', error.response?.data || error.message);
      return {
        success: false,
        status: error.response?.status || 0,
        error: error.response?.data || error.message
      };
    }
  }
}

export const whatsappService = new WhatsAppService();
