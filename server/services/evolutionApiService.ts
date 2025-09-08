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
  mediaBuffer?: Buffer;
  mediaUrl?: string;
  mimeType?: string;
  originalMessage?: any; // Store original message for media processing
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
          // Clean up the existing instance before reconnecting
          this.instances.delete(instanceName);
          instance.status = 'CONNECTING';
          
          // Use a timeout to avoid immediate reconnection and allow cleanup
          setTimeout(async () => {
            try {
              await this.createInstance(instanceName, webhookUrl);
            } catch (error) {
              console.error(`Failed to reconnect instance ${instanceName}:`, error);
            }
          }, 2000);
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

    // Extraer texto del mensaje y procesar multimedia
    let messageText = '';
    let mediaBuffer: Buffer | undefined;
    let mimeType: string | undefined;
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
          messageText = message.message.imageMessage?.caption || '';
          try {
            console.log(`🖼️ [MEDIA] Downloading image for message ${messageKey}`);
            mediaBuffer = await downloadMediaMessage(message, 'buffer', {});
            mimeType = message.message.imageMessage?.mimetype || 'image/jpeg';
            console.log(`✅ [MEDIA] Image downloaded: ${mediaBuffer?.length || 0} bytes`);
            if (!messageText) {
              messageText = '[Imagen recibida - analizando contenido...]';
            }
          } catch (error) {
            console.error(`❌ [MEDIA] Error downloading image:`, error);
            messageText = messageText || '[Imagen no disponible]';
          }
          break;
        case 'videoMessage':
          messageText = message.message.videoMessage?.caption || '[Video recibido]';
          break;
        case 'documentMessage':
          messageText = '[Documento recibido]';
          break;
        case 'audioMessage':
          try {
            console.log(`🎤 [MEDIA] Downloading audio for message ${messageKey}`);
            mediaBuffer = await downloadMediaMessage(message, 'buffer', {});
            mimeType = message.message.audioMessage?.mimetype || 'audio/ogg';
            console.log(`✅ [MEDIA] Audio downloaded: ${mediaBuffer?.length || 0} bytes`);
            messageText = '[Nota de voz recibida - transcribiendo...]';
          } catch (error) {
            console.error(`❌ [MEDIA] Error downloading audio:`, error);
            messageText = '[Nota de voz no disponible]';
          }
          break;
        default:
          messageText = '[Tipo de mensaje desconocido]';
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
      senderName: message.pushName || 'Unknown',
      mediaBuffer,
      mimeType,
      originalMessage: message
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

  async sendMedia(instanceName: string, number: string, mediaUrl: string, mediaType: 'image' | 'video' | 'audio' | 'document', caption?: string): Promise<{ success: boolean; messageId?: string }> {
    const instance = this.instances.get(instanceName);
    
    if (!instance || !instance.socket) {
      throw new Error(`Instance ${instanceName} not found or not connected`);
    }

    if (instance.status !== 'CONNECTED') {
      throw new Error(`Instance ${instanceName} is not connected. Status: ${instance.status}`);
    }

    try {
      const formattedNumber = this.formatPhoneNumber(number);
      console.log(`📸 Sending ${mediaType} from ${instanceName} to ${formattedNumber}: ${mediaUrl}`);
      
      // Preparar mensaje de media según el tipo
      let mediaMessage: any = {};
      
      switch (mediaType) {
        case 'image':
          mediaMessage = { 
            image: { url: mediaUrl },
            caption: caption || ''
          };
          break;
        case 'video':
          mediaMessage = { 
            video: { url: mediaUrl },
            caption: caption || ''
          };
          break;
        case 'audio':
          mediaMessage = { 
            audio: { url: mediaUrl },
            ptt: false // No es nota de voz por defecto
          };
          break;
        case 'document':
          mediaMessage = { 
            document: { url: mediaUrl },
            fileName: caption || 'documento',
            caption: caption || ''
          };
          break;
        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }
      
      // Enviar mensaje multimedia
      const sentMessage = await instance.socket.sendMessage(formattedNumber, mediaMessage);
      
      console.log(`✅ ${mediaType} sent via ${instanceName} to ${formattedNumber}`);
      
      return {
        success: true,
        messageId: sentMessage?.key?.id || undefined
      };
      
    } catch (error) {
      console.error(`Error sending ${mediaType} via ${instanceName}:`, error);
      throw error;
    }
  }

  /**
   * Enviar mensaje con botones interactivos
   */
  /**
   * Enviar carrusel de propiedades (múltiples tarjetas con botones)
   */
  async sendPropertyCarousel(instanceName: string, number: string, properties: any[]): Promise<{ success: boolean; messageIds: string[] }> {
    console.log(`🏠 Sending property carousel via ${instanceName} to ${number} (${properties.length} properties)`);
    
    const messageIds: string[] = [];
    
    // Enviar mensaje introductorio
    try {
      const introMessage = properties.length > 1 
        ? `Aquí tienes ${properties.length} propiedades que podrían interesarte: 🏠✨`
        : `Encontré esta propiedad que podría interesarte: 🏠✨`;
        
      const intro = await this.sendMessage(instanceName, number, introMessage);
      if (intro.messageId) messageIds.push(intro.messageId);
    } catch (error) {
      console.error('Error sending intro message:', error);
    }

    // Enviar cada propiedad como tarjeta individual
    for (let i = 0; i < Math.min(properties.length, 5); i++) {
      const property = properties[i];
      
      try {
        // Preparar el caption con información de la propiedad
        const caption = `*${property.title}*\n\n` +
          `💰 ${property.price}\n` +
          `📍 ${property.description}\n\n` +
          `🆔 ID: ${property.uid}`;

        // Enviar imagen con caption
        const mediaResult = await this.sendMedia(
          instanceName,
          number,
          property.imageUrl,
          'image',
          caption
        );

        if (mediaResult.messageId) messageIds.push(mediaResult.messageId);

        // Enviar mensaje con botones de acción
        const buttonMessage = {
          number: number,
          buttonMessage: {
            text: `¿Qué te gustaría hacer con esta propiedad?`,
            buttons: [
              {
                buttonId: `details_${property.uid}`,
                buttonText: '📋 Más Detalles'
              },
              {
                buttonId: `photos_${property.uid}`,
                buttonText: '📸 Ver Fotos'
              },
              {
                buttonId: `contact_${property.uid}`,
                buttonText: '👨‍💼 Contactar Agente'
              }
            ]
          }
        };

        const buttonResult = await this.sendButtonMessage(instanceName, buttonMessage);
        if (buttonResult.messageId) messageIds.push(buttonResult.messageId);

        // Pequeña pausa entre tarjetas para mejor experiencia
        if (i < properties.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`Error sending property card ${i + 1}:`, error);
        
        // Fallback: enviar como texto simple
        try {
          const fallbackText = `🏠 *${property.title}*\n\n` +
            `💰 ${property.price}\n` +
            `📍 ${property.description}\n` +
            `🆔 ID: ${property.uid}\n\n` +
            `🔗 Ver más: ${property.propertyUrl}`;

          const fallbackResult = await this.sendMessage(instanceName, number, fallbackText);
          if (fallbackResult.messageId) messageIds.push(fallbackResult.messageId);
        } catch (fallbackError) {
          console.error(`Fallback also failed for property ${i + 1}:`, fallbackError);
        }
      }
    }

    // Si hay más de 5 propiedades, mencionar que hay más disponibles
    if (properties.length > 5) {
      try {
        const moreMessage = `... y ${properties.length - 5} propiedades más disponibles. ¿Te gustaría ver más opciones o refinar tu búsqueda? 🔍`;
        const moreResult = await this.sendMessage(instanceName, number, moreMessage);
        if (moreResult.messageId) messageIds.push(moreResult.messageId);
      } catch (error) {
        console.error('Error sending more properties message:', error);
      }
    }

    console.log(`✅ Property carousel sent: ${messageIds.length} messages delivered`);

    return {
      success: messageIds.length > 0,
      messageIds
    };
  }

  async sendButtonMessage(instanceName: string, messageData: any): Promise<{ success: boolean; messageId?: string }> {
    const instance = this.instances.get(instanceName);
    
    if (!instance || !instance.socket) {
      throw new Error(`Instance ${instanceName} not found or not connected`);
    }

    if (instance.status !== 'CONNECTED') {
      throw new Error(`Instance ${instanceName} is not connected. Status: ${instance.status}`);
    }

    try {
      const formattedNumber = this.formatPhoneNumber(messageData.number);
      console.log(`🃏 Sending button message via ${instanceName} to ${formattedNumber}`);
      
      // Construir mensaje con botones para Baileys
      const buttonMessage = {
        text: messageData.buttonMessage.text,
        buttons: messageData.buttonMessage.buttons.map((btn: any) => ({
          buttonId: btn.buttonId,
          buttonText: { displayText: btn.buttonText },
          type: 1
        })),
        headerType: 1
      };

      // Si hay imagen, incluirla como header
      if (messageData.buttonMessage.imageMessage?.image?.url) {
        try {
          buttonMessage.headerType = 4; // IMAGE_TYPE
          (buttonMessage as any).imageMessage = {
            url: messageData.buttonMessage.imageMessage.image.url
          };
        } catch (imageError) {
          console.error('Error adding image to button message:', imageError);
        }
      }

      const result = await instance.socket.sendMessage(formattedNumber, buttonMessage);
      
      return {
        success: true,
        messageId: result?.key?.id || undefined
      };
      
    } catch (error) {
      console.error(`❌ Error sending button message via ${instanceName}:`, error);
      
      // Fallback: enviar como mensaje de texto normal
      try {
        const fallbackText = messageData.buttonMessage.text + '\n\n' + 
          messageData.buttonMessage.buttons.map((btn: any, i: number) => `${i + 1}. ${btn.buttonText}`).join('\n');
        
        const result = await instance.socket.sendMessage(this.formatPhoneNumber(messageData.number), { text: fallbackText });
        return {
          success: true,
          messageId: result?.key?.id || undefined
        };
      } catch (fallbackError) {
        console.error('Fallback text message also failed:', fallbackError);
        throw error;
      }
    }
  }

  async sendListMessage(instanceName: string, messageData: any): Promise<{ success: boolean; messageId?: string }> {
    const instance = this.instances.get(instanceName);
    
    if (!instance || !instance.socket) {
      throw new Error(`Instance ${instanceName} not found or not connected`);
    }

    if (instance.status !== 'CONNECTED') {
      throw new Error(`Instance ${instanceName} is not connected. Status: ${instance.status}`);
    }

    try {
      const formattedNumber = this.formatPhoneNumber(messageData.number);
      console.log(`📋 Sending list message via ${instanceName} to ${formattedNumber}`);
      
      // Construir mensaje con lista para Baileys
      const listMessage = {
        text: messageData.listMessage.description,
        footer: messageData.listMessage.footer || '',
        title: messageData.listMessage.title,
        buttonText: messageData.listMessage.buttonText,
        sections: messageData.listMessage.sections.map((section: any) => ({
          title: section.title,
          rows: section.rows.map((row: any) => ({
            title: row.title,
            description: row.description,
            rowId: row.rowId
          }))
        }))
      };

      const result = await instance.socket.sendMessage(formattedNumber, listMessage);
      
      return {
        success: true,
        messageId: result?.key?.id || undefined
      };
      
    } catch (error) {
      console.error(`❌ Error sending list message via ${instanceName}:`, error);
      
      // Fallback: enviar como mensaje de texto con numeración
      try {
        let fallbackText = `${messageData.listMessage.title}\n\n${messageData.listMessage.description}\n\n`;
        
        messageData.listMessage.sections.forEach((section: any, sectionIndex: number) => {
          if (section.title) {
            fallbackText += `**${section.title}**\n`;
          }
          section.rows.forEach((row: any, rowIndex: number) => {
            const number = sectionIndex * 10 + rowIndex + 1;
            fallbackText += `${number}. ${row.title}\n`;
            if (row.description) {
              fallbackText += `   ${row.description}\n`;
            }
          });
          fallbackText += '\n';
        });
        
        if (messageData.listMessage.footer) {
          fallbackText += `\n${messageData.listMessage.footer}`;
        }
        
        const result = await instance.socket.sendMessage(formattedNumber, { text: fallbackText });
        return {
          success: true,
          messageId: result?.key?.id || undefined
        };
      } catch (fallbackError) {
        console.error('Fallback text message also failed:', fallbackError);
        throw error;
      }
    }
  }

  async sendEnhancedPropertyCarousel(instanceName: string, number: string, properties: any[]): Promise<{ success: boolean; messageIds: string[] }> {
    console.log(`🏠 Sending enhanced property carousel via ${instanceName} to ${number} (${properties.length} properties)`);
    
    const messageIds: string[] = [];
    
    // Decidir formato según número de propiedades
    if (properties.length <= 3) {
      // Usar botones para pocas propiedades
      return this.sendPropertyButtons(instanceName, number, properties);
    } else {
      // Usar lista interactiva para múltiples propiedades
      return this.sendPropertyList(instanceName, number, properties);
    }
  }

  private async sendPropertyButtons(instanceName: string, number: string, properties: any[]): Promise<{ success: boolean; messageIds: string[] }> {
    const messageIds: string[] = [];
    
    for (const property of properties) {
      try {
        // Enviar imagen con caption mejorado
        const caption = this.buildEnhancedPropertyCaption(property);
        
        const mediaResult = await this.sendMedia(
          instanceName,
          number,
          property.imageUrl,
          'image',
          caption
        );

        if (mediaResult.messageId) messageIds.push(mediaResult.messageId);

        // Enviar botones de acción
        const buttonMessage = {
          number: number,
          buttonMessage: {
            text: `¿Qué te gustaría hacer con esta propiedad?`,
            buttons: [
              {
                buttonId: `details_${property.uid}`,
                buttonText: '📋 Más Detalles'
              },
              {
                buttonId: `photos_${property.uid}`,
                buttonText: '📸 Ver Fotos'
              },
              {
                buttonId: `contact_${property.uid}`,
                buttonText: '🏪 Contactar Agente'
              }
            ]
          }
        };

        const buttonResult = await this.sendButtonMessage(instanceName, buttonMessage);
        if (buttonResult.messageId) messageIds.push(buttonResult.messageId);

        // Pausa entre propiedades
        if (properties.indexOf(property) < properties.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

      } catch (error) {
        console.error(`Error sending property button card:`, error);
      }
    }

    return { success: messageIds.length > 0, messageIds };
  }

  private async sendPropertyList(instanceName: string, number: string, properties: any[]): Promise<{ success: boolean; messageIds: string[] }> {
    const messageIds: string[] = [];
    
    try {
      // Mensaje introductorio
      const introMessage = `🏠 *Propiedades Disponibles*\n\nEncontré ${properties.length} propiedades que coinciden con tu búsqueda. Selecciona una para ver más detalles:`;
      
      const intro = await this.sendMessage(instanceName, number, introMessage);
      if (intro.messageId) messageIds.push(intro.messageId);

      // Dividir propiedades en grupos de 10 (límite de WhatsApp)
      const propertyChunks = this.chunkArray(properties, 10);
      
      for (let i = 0; i < propertyChunks.length; i++) {
        const chunk = propertyChunks[i];
        
        const listMessage = {
          number: number,
          listMessage: {
            title: `🏠 Propiedades ${i + 1}/${propertyChunks.length}`,
            description: `Selecciona una propiedad para ver información detallada:`,
            buttonText: "Ver Propiedades",
            footer: "🏘️ Tu inmobiliaria de confianza",
            sections: [
              {
                title: chunk.length > 1 ? "Propiedades Disponibles" : "Propiedad Disponible",
                rows: chunk.map(property => ({
                  title: this.truncateText(property.title, 24),
                  description: `${property.price} • ${this.truncateText(property.description, 72)}`,
                  rowId: `property_${property.uid}`
                }))
              }
            ]
          }
        };

        const listResult = await this.sendListMessage(instanceName, listMessage);
        if (listResult.messageId) messageIds.push(listResult.messageId);

        // Pausa entre chunks
        if (i < propertyChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

    } catch (error) {
      console.error('Error sending property list:', error);
      // Fallback a carousel original
      return this.sendPropertyCarousel(instanceName, number, properties);
    }

    return { success: messageIds.length > 0, messageIds };
  }

  private buildEnhancedPropertyCaption(property: any): string {
    const propertyType = this.getPropertyTypeEmoji(property.title);
    
    let caption = `${propertyType} *${property.title}*\n\n`;
    caption += `💰 *Precio*: ${property.price}\n`;
    
    // Extraer detalles técnicos de la descripción
    const details = this.parsePropertyDetails(property.description);
    if (details.rooms) caption += `🛏️ *Habitaciones*: ${details.rooms}\n`;
    if (details.bathrooms) caption += `🚿 *Baños*: ${details.bathrooms}\n`;
    if (details.location) caption += `📍 *Ubicación*: ${details.location}\n`;
    
    caption += `\n✨ *Destacados*:\n`;
    caption += `• Propiedad verificada\n`;
    caption += `• Documentos en orden\n`;
    caption += `• Disponible para visita\n\n`;
    caption += `🆔 *ID*: ${property.uid}`;

    return caption;
  }

  private getPropertyTypeEmoji(title: string): string {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('casa')) return '🏠';
    if (titleLower.includes('apartamento') || titleLower.includes('depto')) return '🏢';
    if (titleLower.includes('villa')) return '🏘️';
    if (titleLower.includes('penthouse')) return '🏙️';
    if (titleLower.includes('local') || titleLower.includes('comercial')) return '🏪';
    if (titleLower.includes('terreno') || titleLower.includes('lote')) return '🌾';
    return '🏡';
  }

  private parsePropertyDetails(description: string): { rooms?: string; bathrooms?: string; location?: string } {
    const details: { rooms?: string; bathrooms?: string; location?: string } = {};
    
    if (description.includes('hab')) {
      const match = description.match(/(\d+)\s*hab/);
      if (match) details.rooms = match[1];
    }
    
    if (description.includes('baño')) {
      const match = description.match(/(\d+)\s*baño/);
      if (match) details.bathrooms = match[1];
    }

    // Extraer ubicación (después de •)
    const locationMatch = description.split('•').pop()?.trim();
    if (locationMatch) details.location = locationMatch;

    return details;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
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