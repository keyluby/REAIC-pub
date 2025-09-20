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
import { MessageBufferService } from './messageBufferService';
import { storage } from '../storage';

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
  private messageBufferService = new MessageBufferService();
  private instancesPath: string;
  
  constructor() {
    // Use persistent auth directory outside VCS (SECURITY: moved from '/tmp')
    this.instancesPath = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), 'whatsapp_instances');
    this.ensureInstancesDirectory();
    this.migrateFromTemporary();
  }

  private ensureInstancesDirectory() {
    if (!fs.existsSync(this.instancesPath)) {
      fs.mkdirSync(this.instancesPath, { recursive: true });
    }
  }

  private migrateFromTemporary() {
    const tempPath = path.join('/tmp', 'whatsapp_auth');
    
    if (fs.existsSync(tempPath)) {
      console.log('🔄 [MIGRATION] Found existing credentials in /tmp, migrating to persistent storage...');
      
      try {
        const tempDirs = fs.readdirSync(tempPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        for (const instanceDir of tempDirs) {
          const sourcePath = path.join(tempPath, instanceDir);
          const destPath = path.join(this.instancesPath, instanceDir);
          
          if (!fs.existsSync(destPath)) {
            console.log(`📁 [MIGRATION] Migrating instance: ${instanceDir}`);
            
            // Create destination directory
            fs.mkdirSync(destPath, { recursive: true });
            
            // Copy all files from source to destination
            const files = fs.readdirSync(sourcePath);
            for (const file of files) {
              const sourceFile = path.join(sourcePath, file);
              const destFile = path.join(destPath, file);
              
              if (fs.statSync(sourceFile).isFile()) {
                fs.copyFileSync(sourceFile, destFile);
              }
            }
            
            console.log(`✅ [MIGRATION] Successfully migrated ${instanceDir}`);
          } else {
            console.log(`⏭️ [MIGRATION] Instance ${instanceDir} already exists in persistent storage`);
          }
        }
        
        console.log('🎉 [MIGRATION] Credential migration completed successfully');
        
        // Optional: Clean up temp directory after successful migration
        // fs.rmSync(tempPath, { recursive: true, force: true });
        // console.log('🧹 [MIGRATION] Cleaned up temporary directory');
        
      } catch (error) {
        console.error('❌ [MIGRATION] Failed to migrate credentials:', error);
      }
    } else {
      console.log('✅ [MIGRATION] No temporary credentials found, using persistent storage');
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
   * Enviar propiedades recomendadas (formato simple sin botones)
   */
  async sendPropertyCarousel(instanceName: string, number: string, properties: any[]): Promise<{ success: boolean; messageIds: string[] }> {
    console.log(`🏠 Sending ${properties.length} property recommendations via ${instanceName} to ${number} (HUMANIZED)`);
    
    const messageIds: string[] = [];
    
    // Enviar cada propiedad como imagen corta + detalles humanizados
    for (let i = 0; i < Math.min(properties.length, 10); i++) {
      const property = properties[i];
      
      try {
        console.log(`📤 [HUMANIZED] Sending property ${i + 1}/${Math.min(properties.length, 10)}: ${property.title}`);

        // 1. Enviar imagen con caption ULTRA-CORTO (solo título)
        const shortCaption = this.buildShortPropertyCaption(property);
        const mediaResult = await this.sendMedia(
          instanceName,
          number,
          property.imageUrl,
          'image',
          shortCaption
        );

        if (mediaResult.messageId) messageIds.push(mediaResult.messageId);

        // 2. Enviar detalles fragmentados usando humanizeResponse
        const propertyDetails = this.buildPropertyDetailsForHumanization(property);
        
        // Obtener userId para las configuraciones de humanización
        const userId = await this.getUserIdByInstance(instanceName);
        
        if (userId) {
          console.log(`🤖 [HUMANIZED] Fragmenting property details for user ${userId}`);
          
          await this.messageBufferService.humanizeResponse(
            propertyDetails,
            userId,
            async (chunk: string) => {
              const textResult = await this.sendMessage(instanceName, number, chunk);
              if (textResult.messageId) messageIds.push(textResult.messageId);
            }
          );
        } else {
          // Fallback: enviar detalles como mensaje único
          console.log(`⚠️ [HUMANIZED] No userId found, sending details as single message`);
          const detailsResult = await this.sendMessage(instanceName, number, propertyDetails);
          if (detailsResult.messageId) messageIds.push(detailsResult.messageId);
        }

        // Pausa entre propiedades solo si no es la última
        if (i < Math.min(properties.length, 10) - 1) {
          console.log(`⏱️ [HUMANIZED] Waiting 3s before next property...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (error) {
        console.error(`❌ [HUMANIZED] Error sending property ${i + 1}:`, error);
        
        // Fallback: enviar como texto simple tradicional
        try {
          const caption = this.buildSimplePropertyCaption(property);
          const fallbackResult = await this.sendMessage(instanceName, number, caption);
          if (fallbackResult.messageId) messageIds.push(fallbackResult.messageId);
        } catch (fallbackError) {
          console.error(`❌ [HUMANIZED] Fallback also failed for property ${i + 1}:`, fallbackError);
        }
      }
    }

    // Si hay más propiedades disponibles
    if (properties.length > 10) {
      try {
        const moreMessage = `¡Hay ${properties.length - 10} propiedades más disponibles! Si necesitas ver más opciones, solo dímelo.`;
        const moreResult = await this.sendMessage(instanceName, number, moreMessage);
        if (moreResult.messageId) messageIds.push(moreResult.messageId);
      } catch (error) {
        console.error('Error sending "more properties" message:', error);
      }
    }

    console.log(`✅ [HUMANIZED] Property recommendations sent: ${messageIds.length} messages delivered`);

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
          // Correct format for Baileys button messages with images
          (buttonMessage as any).image = {
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

  async sendPropertyRecommendations(instanceName: string, number: string, properties: any[]): Promise<{ success: boolean; messageIds: string[] }> {
    console.log(`🏠 Sending property recommendations via ${instanceName} to ${number} (${properties.length} properties)`);
    
    const messageIds: string[] = [];
    
    // Limitar a máximo 6 propiedades recomendadas
    const limitedProperties = properties.slice(0, 6);
    
    // Enviar cada propiedad como mensaje individual con imagen y enlace (sin botones)
    for (let i = 0; i < limitedProperties.length; i++) {
      const property = limitedProperties[i];
      
      try {
        console.log(`🖼️ [SIMPLE] Property ${i + 1} image URL: ${property.imageUrl}`);
        
        // STEP 1: Send motivational description first (if available)
        const motivationalDescription = this.extractMotivationalDescription(property);
        if (motivationalDescription) {
          console.log(`💬 [CONTEXTUAL] Sending motivational description for property ${i + 1}`);
          await this.sendMessage(instanceName, number, motivationalDescription);
          
          // Small delay before sending structured card
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // STEP 2: Construir caption completo con enlace
        const caption = this.buildCompletePropertyCaption(property);
        
        // STEP 3: Enviar imagen con caption directamente (método simplificado)
        const result = await this.sendMedia(
          instanceName,
          number,
          property.imageUrl,
          'image',
          caption
        );
        
        if (result.messageId) {
          messageIds.push(result.messageId);
          console.log(`✅ [SIMPLE] Property ${i + 1} sent successfully with image and link`);
        } else {
          console.log(`❌ [SIMPLE] Property ${i + 1} failed to send - no message ID`);
        }

        // Pausa entre propiedades para mejor experiencia
        if (i < limitedProperties.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`Error sending property recommendation ${i + 1}:`, error);
        
        // Fallback: enviar como mensaje de texto con enlace
        try {
          const textCaption = this.buildCompletePropertyCaption(property);
          const fallbackResult = await this.sendMessage(
            instanceName,
            number,
            textCaption
          );
          if (fallbackResult.messageId) messageIds.push(fallbackResult.messageId);
        } catch (fallbackError) {
          console.error(`Fallback text also failed for property ${i + 1}:`, fallbackError);
        }
      }
    }

    console.log(`✅ Property recommendations sent: ${messageIds.length}/${limitedProperties.length} messages delivered`);

    return {
      success: messageIds.length > 0,
      messageIds
    };
  }

  async sendPropertyWithButtons(instanceName: string, number: string, property: any): Promise<{ success: boolean; messageId?: string }> {
    console.log(`🎯 [BUTTONS] Sending property with interactive buttons: ${property.title}`);
    
    try {
      // Construir el mensaje con imagen y botones
      const buttonMessage = {
        number: number,
        buttonMessage: {
          text: this.buildPropertyButtonCaption(property),
          buttons: [
            {
              buttonId: `details_${property.uid}`,
              buttonText: 'Ver más detalles'
            },
            {
              buttonId: `question_${property.uid}`,
              buttonText: 'Tengo una Pregunta'
            }
          ],
          imageMessage: {
            image: {
              url: property.imageUrl
            }
          }
        }
      };

      console.log(`🎯 [BUTTONS] Button structure:`, {
        text: buttonMessage.buttonMessage.text.substring(0, 50) + '...',
        buttons: buttonMessage.buttonMessage.buttons.map(b => b.buttonText),
        hasImage: !!buttonMessage.buttonMessage.imageMessage?.image?.url
      });

      const result = await this.sendButtonMessage(instanceName, buttonMessage);
      
      if (result.success) {
        console.log(`✅ [BUTTONS] Property sent successfully with buttons: ${property.uid}`);
      } else {
        console.log(`❌ [BUTTONS] Failed to send property with buttons: ${property.uid}`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ [BUTTONS] Error sending property with buttons:`, error);
      throw error;
    }
  }

  private buildPropertyButtonCaption(property: any): string {
    const propertyType = this.getPropertyTypeEmoji(property.title);
    
    // Título con emoji tipo de propiedad
    let caption = `${propertyType} *${property.title}*\n`;
    
    // Precio con emoji
    caption += `💰 ${property.price}\n`;
    
    // Extraer detalles técnicos de la descripción
    const details = this.parsePropertyDetails(property.description);
    
    // Detalles técnicos con emojis
    if (details.rooms) caption += `🏠 ${details.rooms} hab`;
    if (details.bathrooms) caption += `${details.rooms ? ' • ' : ''}🚿 ${details.bathrooms} baños\n`;
    else if (details.rooms) caption += '\n';
    
    // Área si está disponible
    if (property.description.includes('m²')) {
      const areaMatch = property.description.match(/(\d+)\s*m²/);
      if (areaMatch) {
        caption += `📐 ${areaMatch[1]}m²\n`;
      }
    }
    
    // Ubicación con emoji
    if (details.location) {
      caption += `📍 ${details.location}\n`;
    }
    
    // Agregar call-to-action para los botones
    caption += `\n¿Qué te gustaría hacer?`;

    return caption;
  }

  private async sendPropertyButtons(instanceName: string, number: string, properties: any[]): Promise<{ success: boolean; messageIds: string[] }> {
    const messageIds: string[] = [];
    
    for (const property of properties) {
      try {
        // Enviar imagen con caption mejorado
        const caption = this.buildCompletePropertyCaption(property);
        
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

  /**
   * Construir caption completo y humanizado según especificaciones AlterEstate
   * Incluye información detallada y formato profesional
   */
  /**
   * Extract motivational description from property details for contextual presentation
   */
  private extractMotivationalDescription(property: any): string | null {
    try {
      // Check for detailed description in various property fields
      const fullDescription = property.description || property.short_description || property.details || '';
      
      if (!fullDescription || fullDescription.length < 50) {
        return null;
      }
      
      // Extract key amenities and features for motivational context
      const amenityKeywords = [
        'piscina', 'playa', 'beach', 'club', 'gym', 'gimnasio', 'restaurante', 
        'senderos', 'caballos', 'buggies', 'tenis', 'golf', 'spa', 'jacuzzi',
        'terraza', 'balcón', 'vista', 'mar', 'montaña', 'seguridad', 'estacionamiento',
        'acabados', 'moderno', 'lujo', 'exclusivo', 'privado', 'acceso'
      ];
      
      // Find sentences that contain amenity keywords
      const sentences = fullDescription.split(/[.!?]+/).filter(s => s.trim().length > 10);
      const motivationalSentences = sentences.filter(sentence => 
        amenityKeywords.some(keyword => 
          sentence.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      
      if (motivationalSentences.length === 0) {
        // Fallback: use first meaningful sentences
        return sentences.slice(0, 2).join('. ').trim() + '.';
      }
      
      // Combine motivational sentences into compelling description
      return motivationalSentences.slice(0, 3).join('. ').trim() + '.';
      
    } catch (error) {
      console.warn(`⚠️ [MOTIVATIONAL] Failed to extract description:`, error.message);
      return null;
    }
  }

  private buildCompletePropertyCaption(property: any): string {
    const propertyType = this.getPropertyTypeEmoji(property.title);
    
    // TÍTULO CON CONTEXTO
    let caption = `${propertyType} *${property.title}*\n`;
    
    // PRECIO DESTACADO con contexto
    const priceInfo = this.formatPriceWithContext(property);
    caption += `💰 ${priceInfo}\n`;
    
    // ESPECIFICACIONES TÉCNICAS DETALLADAS
    const technicalSpecs = this.buildTechnicalSpecifications(property);
    if (technicalSpecs) {
      caption += `\n${technicalSpecs}\n`;
    }
    
    // UBICACIÓN Y REFERENCIAS
    const locationInfo = this.buildLocationDetails(property);
    if (locationInfo) {
      caption += `\n📍 ${locationInfo}\n`;
    }
    
    // CARACTERÍSTICAS DESTACADAS
    const features = this.extractKeyFeatures(property);
    if (features.length > 0) {
      caption += `\n✨ *Características destacadas:*\n`;
      features.slice(0, 3).forEach(feature => {
        caption += `• ${feature}\n`;
      });
    }
    
    // INFORMACIÓN COMERCIAL
    const commercialInfo = this.buildCommercialContext(property);
    if (commercialInfo) {
      caption += `\n${commercialInfo}\n`;
    }
    
    // LLAMADA A LA ACCIÓN
    caption += `\n🔗 Ver detalles completos: ${property.propertyUrl}`;

    return caption;
  }

  /**
   * Formatear precio con contexto y comparaciones
   */
  private formatPriceWithContext(property: any): string {
    let priceText = property.price;
    
    // Agregar contexto para diferentes tipos de operación
    if (property.forRent) {
      priceText += ' /mes';
    } else if (property.forSale) {
      priceText += ' en venta';
    }
    
    // Agregar información de financiamiento si está disponible
    if (property.financing || property.mortgage) {
      priceText += ' | 🏦 Financiamiento disponible';
    }
    
    return priceText;
  }

  /**
   * Construir especificaciones técnicas detalladas
   */
  private buildTechnicalSpecifications(property: any): string {
    const specs = [];
    
    // Extraer información técnica mejorada
    const details = this.parsePropertyDetails(property.description);
    
    if (details.rooms) {
      specs.push(`🛏️ ${details.rooms} habitaciones`);
    }
    
    if (details.bathrooms) {
      specs.push(`🚿 ${details.bathrooms} baños`);
    }
    
    // Área si está disponible
    if (property.area || details.area) {
      specs.push(`📐 ${property.area || details.area}`);
    }
    
    // Parqueo si está disponible
    if (property.parking || details.parking) {
      specs.push(`🚗 ${property.parking || details.parking} parqueos`);
    }
    
    return specs.length > 0 ? specs.join(' • ') : '';
  }

  /**
   * Construir información de ubicación detallada
   */
  private buildLocationDetails(property: any): string {
    const locationParts = [];
    
    // Usar información parseada de la descripción
    const details = this.parsePropertyDetails(property.description);
    
    if (details.location) {
      locationParts.push(details.location);
    } else if (property.neighborhood || property.sector) {
      locationParts.push(property.neighborhood || property.sector);
    }
    
    // Agregar referencias si están disponibles
    if (property.references) {
      locationParts.push(`Referencias: ${property.references}`);
    }
    
    return locationParts.join(' • ');
  }

  /**
   * Extraer características clave de la propiedad
   */
  private extractKeyFeatures(property: any): string[] {
    const features = [];
    
    // Características comunes extraídas de la descripción
    const description = (property.description || '').toLowerCase();
    
    if (description.includes('piscina') || description.includes('pool')) {
      features.push('🏊‍♀️ Piscina');
    }
    
    if (description.includes('gym') || description.includes('gimnasio')) {
      features.push('🏋️‍♂️ Gimnasio');
    }
    
    if (description.includes('seguridad') || description.includes('security')) {
      features.push('🔒 Seguridad 24/7');
    }
    
    if (description.includes('terraza') || description.includes('balcon')) {
      features.push('🌅 Terraza/Balcón');
    }
    
    if (description.includes('vista') || description.includes('view')) {
      features.push('🌆 Excelente vista');
    }
    
    if (description.includes('amueblado') || description.includes('furnished')) {
      features.push('🛋️ Amueblado');
    }
    
    if (description.includes('parking') || description.includes('garaje')) {
      features.push('🚗 Parqueo incluido');
    }
    
    return features;
  }

  /**
   * Construir contexto comercial (disponibilidad, condiciones, etc.)
   */
  private buildCommercialContext(property: any): string {
    const context = [];
    
    if (property.furnished) {
      context.push('🛋️ Disponible amueblado');
    }
    
    if (property.status && property.status !== 'Disponible') {
      context.push(`📋 Estado: ${property.status}`);
    }
    
    if (property.publishedDate) {
      const publishDate = new Date(property.publishedDate);
      const daysSince = Math.floor((Date.now() - publishDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince < 7) {
        context.push('🆕 Publicación reciente');
      }
    }
    
    return context.length > 0 ? context.join(' • ') : '';
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

  /**
   * Análisis mejorado de detalles de propiedad con más información extraída
   */
  private parsePropertyDetails(description: string): { 
    rooms?: string; 
    bathrooms?: string; 
    location?: string; 
    area?: string;
    parking?: string;
    features?: string[];
  } {
    const details: { 
      rooms?: string; 
      bathrooms?: string; 
      location?: string; 
      area?: string;
      parking?: string;
      features?: string[];
    } = {};
    
    // Habitaciones - patrones más amplios
    const roomPatterns = [
      /(\d+)\s*hab/i,
      /(\d+)\s*habitacion/i,
      /(\d+)\s*bedroom/i,
      /(\d+)\s*dormitorio/i
    ];
    
    for (const pattern of roomPatterns) {
      const match = description.match(pattern);
      if (match) {
        details.rooms = match[1];
        break;
      }
    }
    
    // Baños - patrones más amplios
    const bathPatterns = [
      /(\d+)\s*baño/i,
      /(\d+)\s*bathroom/i,
      /(\d+)\s*baños/i,
      /(\d+)\s*baths/i
    ];
    
    for (const pattern of bathPatterns) {
      const match = description.match(pattern);
      if (match) {
        details.bathrooms = match[1];
        break;
      }
    }

    // Área - extraer diferentes formatos
    const areaPatterns = [
      /(\d+)\s*m²/i,
      /(\d+)\s*mt²/i,
      /(\d+)\s*metros/i,
      /(\d+)\s*m2/i
    ];
    
    for (const pattern of areaPatterns) {
      const match = description.match(pattern);
      if (match) {
        details.area = `${match[1]} m²`;
        break;
      }
    }

    // Parqueo
    const parkingPatterns = [
      /(\d+)\s*parqueo/i,
      /(\d+)\s*parking/i,
      /(\d+)\s*garaje/i,
      /(\d+)\s*garage/i
    ];
    
    for (const pattern of parkingPatterns) {
      const match = description.match(pattern);
      if (match) {
        details.parking = match[1];
        break;
      }
    }

    // Ubicación - mejorar extracción
    const locationPatterns = [
      description.split('•').pop()?.trim(),
      description.split(',').pop()?.trim(),
      description.split('-').pop()?.trim()
    ];
    
    for (const location of locationPatterns) {
      if (location && location.length > 3 && location.length < 50) {
        details.location = location;
        break;
      }
    }

    // Características adicionales
    const features = [];
    const featureKeywords = {
      'piscina': '🏊‍♀️ Piscina',
      'pool': '🏊‍♀️ Piscina',
      'gimnasio': '🏋️‍♂️ Gimnasio',
      'gym': '🏋️‍♂️ Gimnasio',
      'terraza': '🌅 Terraza',
      'balcon': '🌅 Balcón',
      'vista': '🌆 Vista',
      'amueblado': '🛋️ Amueblado',
      'furnished': '🛋️ Amueblado',
      'seguridad': '🔒 Seguridad'
    };
    
    const descLower = description.toLowerCase();
    for (const [keyword, feature] of Object.entries(featureKeywords)) {
      if (descLower.includes(keyword)) {
        features.push(feature);
      }
    }
    
    if (features.length > 0) {
      details.features = features;
    }

    return details;
  }

  /**
   * Construir caption optimizado para carousel de propiedades
   * Más conciso pero informativo según especificaciones
   */
  private buildCarouselPropertyCaption(property: any, index: number, total: number): string {
    // Formato premium basado en la imagen de referencia del usuario
    
    // Título con precio integrado (sin numeración para limpieza visual)
    let caption = `🏢 *${property.title}*\n`;
    
    // Precio secundario con emoji específico
    caption += `💰 ${property.price}\n`;
    
    // Especificaciones técnicas con emojis mejorados (estilo imagen referencia)
    const details = this.parsePropertyDetails(property.description);
    
    if (details.rooms || details.bathrooms) {
      caption += `🏠 `;
      const specs = [];
      if (details.rooms) specs.push(`${details.rooms} hab`);
      if (details.bathrooms) specs.push(`❤️ ${details.bathrooms} baños`);
      caption += specs.join(' • ') + '\n';
    }
    
    // Área en línea separada para mayor legibilidad
    if (details.area) {
      caption += `📐 ${details.area}\n`;
    }
    
    // Ubicación en línea separada (más limpio)
    if (details.location) {
      caption += `📍 ${details.location}\n`;
    }
    
    // Link directo al final (estilo imagen referencia)
    caption += `🔗 Ver detalles: ${property.propertyUrl}`;
    
    return caption;
  }

  /**
   * Construir caption ULTRA-CORTO para imágenes (solo título para humanización)
   */
  private buildShortPropertyCaption(property: any): string {
    return `🏢 *${property.title}*`;
  }

  /**
   * Construir detalles completos para envío fragmentado (formato especificado por usuario)
   * 💰 Información de precio
   * 🏠 X hab • ❤️ X baños
   * 📐 X m²
   * 📍 Ubicación específica
   * 🔗 Ver detalles: [link personalizado]
   */
  private buildPropertyDetailsForHumanization(property: any): string {
    // Precio principal (sin repetir título que ya va en imagen)
    let details = `💰 ${property.price}\n\n`;
    
    // Especificaciones técnicas con formato exacto del usuario
    const specs = this.parsePropertyDetails(property.description);
    
    if (specs.rooms || specs.bathrooms) {
      const specsArray = [];
      if (specs.rooms) specsArray.push(`🏠 ${specs.rooms} hab`);
      if (specs.bathrooms) specsArray.push(`❤️ ${specs.bathrooms} baños`);
      details += specsArray.join(' • ') + '\n\n';
    }
    
    // Área en línea separada
    if (specs.area) {
      details += `📐 ${specs.area}\n\n`;
    }
    
    // Ubicación específica
    if (specs.location) {
      details += `📍 ${specs.location}\n\n`;
    }
    
    // Link personalizado al final
    details += `🔗 Ver detalles: ${property.propertyUrl}`;
    
    return details;
  }

  /**
   * Construir caption simple para propiedades (formato especificado por usuario)
   * 🏢 Título descriptivo con precio principal
   * 💰 Información de precio alternativa  
   * 🏠 X hab • ❤️ X baños
   * 📐 X m²
   * 📍 Ubicación específica
   * 🔗 Ver detalles: [link personalizado]
   */
  private buildSimplePropertyCaption(property: any): string {
    // Título con precio integrado
    let caption = `🏢 *${property.title}*\n`;
    
    // Precio principal
    caption += `💰 ${property.price}\n`;
    
    // Especificaciones técnicas con formato exacto del usuario
    const details = this.parsePropertyDetails(property.description);
    
    if (details.rooms || details.bathrooms) {
      const specs = [];
      if (details.rooms) specs.push(`🏠 ${details.rooms} hab`);
      if (details.bathrooms) specs.push(`❤️ ${details.bathrooms} baños`);
      caption += specs.join(' • ') + '\n';
    }
    
    // Área en línea separada
    if (details.area) {
      caption += `📐 ${details.area}\n`;
    }
    
    // Ubicación específica
    if (details.location) {
      caption += `📍 ${details.location}\n`;
    }
    
    // Link personalizado al final
    caption += `🔗 Ver detalles: ${property.propertyUrl}`;
    
    return caption;
  }

  /**
   * Obtener userId a partir del instanceName
   */
  private async getUserIdByInstance(instanceName: string): Promise<string | null> {
    try {
      const dbInstance = await storage.getWhatsappInstance(instanceName);
      return dbInstance?.userId || null;
    } catch (error) {
      console.error(`Error getting userId for instance ${instanceName}:`, error);
      return null;
    }
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