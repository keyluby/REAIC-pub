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
      // Clean and format phone number for Evolution API
      const cleanedNumber = this.formatPhoneNumber(number);
      
      console.log(`📱 Sending to - Original: "${number}", Cleaned: "${cleanedNumber}"`);
      
      const response = await axios.post(
        `${this.evolutionApiUrl}/message/sendText/${instanceName}`,
        {
          number: cleanedNumber,
          text: message,
        },
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
      
      // Handle specific error types
      if (error.response?.status === 400 && error.response?.data?.response?.message) {
        const errorMsg = error.response.data.response.message;
        if (Array.isArray(errorMsg) && errorMsg[0]?.exists === false) {
          console.error(`❌ WhatsApp number ${number} does not exist or is not reachable`);
          throw new Error(`WhatsApp number ${number} does not exist or is not available`);
        }
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
      // Default to adding +1 for US numbers, but this should be configurable
      // In a real system, you'd detect the country code based on the WhatsApp instance
      console.log('⚠️ Adding default country code +1 to number:', cleaned);
      cleaned = '+1' + cleaned;
    }
    
    console.log(`🔧 Phone formatting: "${number}" → "${cleaned}"`);
    return cleaned;
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
      
      const data = response.data;
      console.log(`Status for ${instanceName}:`, data);
      
      // Mapear los estados de Evolution API a nuestros estados
      let mappedStatus = 'DISCONNECTED';
      if (data.instance?.state === 'open') {
        mappedStatus = 'CONNECTED';
      } else if (data.instance?.state === 'connecting') {
        mappedStatus = 'CONNECTING';
      }
      
      return {
        ...data,
        mappedStatus
      };
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
    } catch (error: any) {
      console.error('Error logging out instance:', error);
      
      // Si la instancia no existe (404), permitir continuar la eliminación
      if (error.response?.status === 404) {
        return { success: true, message: 'Instance not found on server, proceeding with local cleanup' };
      }
      
      throw new Error('Failed to logout instance');
    }
  }

  async setTyping(instanceName: string, number: string, isTyping: boolean) {
    try {
      // Temporarily disabled due to 404 error on Evolution API
      // The typing indicator endpoint is not critical for message flow
      console.log(`⌨️ Typing indicator ${isTyping ? 'on' : 'off'} for ${number} (disabled)`);
      return { success: true };
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
