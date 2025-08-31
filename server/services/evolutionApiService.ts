import makeWASocket, { 
  ConnectionState, 
  DisconnectReason, 
  WASocket, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  isJidUser,
  jidNormalizedUser,
  proto,
  getContentType,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import NodeCache from 'node-cache';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

interface WhatsAppInstance {
  socket: WASocket | null;
  qrCode: string | null;
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  instanceName: string;
  events: EventEmitter;
}

interface IncomingMessage {
  instanceName: string;
  messageKey: string;
  remoteJid: string;
  message: string;
  messageType: string;
  timestamp: number;
  fromMe: boolean;
  senderName?: string;
}

class EvolutionApiService {
  private instances: Map<string, WhatsAppInstance> = new Map();
  private qrCodeCache = new NodeCache({ stdTTL: 300 }); // 5 minutos
  private instancesPath: string;
  
  constructor() {
    this.instancesPath = path.join(process.cwd(), 'instances');
    this.ensureInstancesDirectory();
  }

  private ensureInstancesDirectory() {
    if (!fs.existsSync(this.instancesPath)) {
      fs.mkdirSync(this.instancesPath, { recursive: true });
    }
  }

  private getInstancePath(instanceName: string): string {
    return path.join(this.instancesPath, instanceName);
  }

  async createInstance(instanceName: string, webhookUrl?: string): Promise<{ 
    success: boolean; 
    instanceName: string; 
    qrCode?: string; 
    status: string; 
  }> {
    try {
      console.log(`🚀 Creating WhatsApp instance: ${instanceName}`);
      
      if (this.instances.has(instanceName)) {
        throw new Error(`Instance ${instanceName} already exists`);
      }

      const instancePath = this.getInstancePath(instanceName);
      if (!fs.existsSync(instancePath)) {
        fs.mkdirSync(instancePath, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(instancePath);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      
      console.log(`Using Baileys version: ${version}, isLatest: ${isLatest}`);

      const instance: WhatsAppInstance = {
        socket: null,
        qrCode: null,
        status: 'CONNECTING',
        instanceName,
        events: new EventEmitter()
      };

      // Crear el socket de WhatsApp
      const socket = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: state,
        browser: ['Evolution API', 'Chrome', '10.15.7'],
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: 60000,
      });

      instance.socket = socket;
      this.instances.set(instanceName, instance);

      // Configurar eventos
      this.setupSocketEvents(instance, saveCreds, webhookUrl);

      return {
        success: true,
        instanceName,
        status: instance.status
      };

    } catch (error) {
      console.error(`Error creating instance ${instanceName}:`, error);
      throw error;
    }
  }

  private setupSocketEvents(instance: WhatsAppInstance, saveCreds: () => void, webhookUrl?: string) {
    const { socket, instanceName, events } = instance;
    
    if (!socket) return;

    // Manejar actualizaciones de conexión
    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log(`📱 ${instanceName} - Connection update:`, { connection, qr: !!qr });

      if (qr) {
        // Generar QR code como imagen base64
        try {
          const qrCodeImage = await QRCode.toDataURL(qr);
          instance.qrCode = qrCodeImage;
          instance.status = 'CONNECTING';
          this.qrCodeCache.set(instanceName, qrCodeImage);
          
          // Emitir evento para webhook
          events.emit('qr.updated', { instanceName, qrCode: qrCodeImage });
          
        } catch (error) {
          console.error('Error generating QR code:', error);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`📱 ${instanceName} - Connection closed. Reconnecting:`, shouldReconnect);
        
        if (shouldReconnect) {
          instance.status = 'CONNECTING';
          await this.createInstance(instanceName, webhookUrl);
        } else {
          instance.status = 'DISCONNECTED';
          this.instances.delete(instanceName);
        }
      } else if (connection === 'open') {
        console.log(`✅ ${instanceName} - WhatsApp connected successfully`);
        instance.status = 'CONNECTED';
        instance.qrCode = null;
        
        // Emitir evento de conexión exitosa
        events.emit('connection.open', { instanceName });
      }
    });

    // Manejar credenciales
    socket.ev.on('creds.update', saveCreds);

    // Manejar mensajes entrantes
    socket.ev.on('messages.upsert', async (m: any) => {
      const message = m.messages[0];
      if (!message || message.key.fromMe) return;

      try {
        const incomingMessage = await this.processIncomingMessage(instanceName, message);
        
        // Emitir evento para webhook
        events.emit('message.received', incomingMessage);
        
        // Si hay webhook URL, enviar también por HTTP
        if (webhookUrl) {
          await this.sendWebhookNotification(webhookUrl, 'MESSAGES_UPSERT', incomingMessage);
        }
        
      } catch (error) {
        console.error('Error processing incoming message:', error);
      }
    });
  }

  private async processIncomingMessage(instanceName: string, message: any): Promise<IncomingMessage> {
    const messageKey = message.key.id || 'unknown';
    const remoteJid = message.key.remoteJid || '';
    const timestamp = message.messageTimestamp * 1000 || Date.now();
    const fromMe = message.key.fromMe || false;

    // Extraer texto del mensaje
    let messageText = '';
    const messageType = getContentType(message.message);
    
    if (messageType) {
      switch (messageType) {
        case 'conversation':
          messageText = message.message.conversation || '';
          break;
        case 'extendedTextMessage':
          messageText = message.message.extendedTextMessage?.text || '';
          break;
        case 'imageMessage':
          messageText = message.message.imageMessage?.caption || '[Image]';
          break;
        case 'videoMessage':
          messageText = message.message.videoMessage?.caption || '[Video]';
          break;
        case 'documentMessage':
          messageText = '[Document]';
          break;
        case 'audioMessage':
          messageText = '[Audio]';
          break;
        default:
          messageText = '[Unknown message type]';
      }
    }

    return {
      instanceName,
      messageKey,
      remoteJid,
      message: messageText,
      messageType: messageType || 'unknown',
      timestamp,
      fromMe,
      senderName: message.pushName || 'Unknown'
    };
  }

  private async sendWebhookNotification(webhookUrl: string, event: string, data: any) {
    try {
      const axios = (await import('axios')).default;
      await axios.post(webhookUrl, {
        event,
        data,
        timestamp: Date.now()
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
    } catch (error) {
      console.error('Error sending webhook notification:', error);
    }
  }

  async getQRCode(instanceName: string): Promise<{ qrCode: string | null; status: string }> {
    const instance = this.instances.get(instanceName);
    
    if (!instance) {
      throw new Error(`Instance ${instanceName} not found`);
    }

    // Intentar obtener del cache primero
    const cachedQR = this.qrCodeCache.get<string>(instanceName);
    if (cachedQR) {
      return { qrCode: cachedQR, status: instance.status };
    }

    return { qrCode: instance.qrCode, status: instance.status };
  }

  async sendMessage(instanceName: string, number: string, message: string): Promise<{ success: boolean; messageId?: string }> {
    const instance = this.instances.get(instanceName);
    
    if (!instance || !instance.socket) {
      throw new Error(`Instance ${instanceName} not found or not connected`);
    }

    if (instance.status !== 'CONNECTED') {
      throw new Error(`Instance ${instanceName} is not connected. Status: ${instance.status}`);
    }

    try {
      // Formatear número de teléfono
      const formattedNumber = this.formatPhoneNumber(number);
      
      // Enviar mensaje
      const sentMessage = await instance.socket.sendMessage(formattedNumber, { text: message });
      
      console.log(`✅ Message sent via ${instanceName} to ${formattedNumber}`);
      
      return {
        success: true,
        messageId: sentMessage?.key?.id || undefined
      };
      
    } catch (error) {
      console.error(`Error sending message via ${instanceName}:`, error);
      throw error;
    }
  }

  private formatPhoneNumber(number: string): string {
    // Limpiar número y agregar formato WhatsApp
    let cleaned = number.replace(/\D/g, '');
    
    // Si no empieza con código de país, asumir que es México (+52)
    if (!cleaned.startsWith('52') && !cleaned.startsWith('1') && !cleaned.startsWith('34')) {
      cleaned = '52' + cleaned;
    }
    
    return cleaned + '@s.whatsapp.net';
  }

  async getInstanceStatus(instanceName: string): Promise<{ status: string; connected: boolean }> {
    const instance = this.instances.get(instanceName);
    
    if (!instance) {
      return { status: 'NOT_FOUND', connected: false };
    }

    return {
      status: instance.status,
      connected: instance.status === 'CONNECTED'
    };
  }

  async logoutInstance(instanceName: string): Promise<{ success: boolean }> {
    const instance = this.instances.get(instanceName);
    
    if (!instance || !instance.socket) {
      throw new Error(`Instance ${instanceName} not found`);
    }

    try {
      await instance.socket.logout();
      instance.status = 'DISCONNECTED';
      this.instances.delete(instanceName);
      
      // Limpiar archivos de autenticación
      const instancePath = this.getInstancePath(instanceName);
      if (fs.existsSync(instancePath)) {
        fs.rmSync(instancePath, { recursive: true, force: true });
      }
      
      return { success: true };
      
    } catch (error) {
      console.error(`Error logging out instance ${instanceName}:`, error);
      throw error;
    }
  }

  async deleteInstance(instanceName: string): Promise<{ success: boolean }> {
    const instance = this.instances.get(instanceName);
    
    if (instance && instance.socket) {
      try {
        await instance.socket.end(undefined);
      } catch (error) {
        console.error('Error ending socket:', error);
      }
    }
    
    this.instances.delete(instanceName);
    
    // Limpiar archivos
    const instancePath = this.getInstancePath(instanceName);
    if (fs.existsSync(instancePath)) {
      fs.rmSync(instancePath, { recursive: true, force: true });
    }
    
    return { success: true };
  }

  getInstancesList(): Array<{ instanceName: string; status: string; connected: boolean }> {
    return Array.from(this.instances.entries()).map(([name, instance]) => ({
      instanceName: name,
      status: instance.status,
      connected: instance.status === 'CONNECTED'
    }));
  }

  // Método para obtener eventos de una instancia (para webhooks internos)
  getInstanceEvents(instanceName: string): EventEmitter | null {
    const instance = this.instances.get(instanceName);
    return instance ? instance.events : null;
  }

  async testConnection(): Promise<{ success: boolean; version?: string; instances: number }> {
    try {
      const { version } = await fetchLatestBaileysVersion();
      return {
        success: true,
        version: version.join('.'),
        instances: this.instances.size
      };
    } catch (error) {
      return {
        success: false,
        instances: this.instances.size
      };
    }
  }
}

export const evolutionApiService = new EvolutionApiService();