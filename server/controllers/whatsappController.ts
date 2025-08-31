import { Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService';
import { aiService } from '../services/aiService';
import { messageBufferService } from '../services/messageBufferService';
import { storage } from '../storage';
import { constructWebhookUrl, logDomainInfo } from '../utils/domainDetection';
import { internalWebhookService } from '../services/internalWebhookService';
import { evolutionApiService } from '../services/evolutionApiService';

class WhatsAppController {
  constructor() {
    // Bind methods to preserve 'this' context
    this.handleWebhook = this.handleWebhook.bind(this);
    this.handleIncomingMessage = this.handleIncomingMessage.bind(this);
    this.processAIResponse = this.processAIResponse.bind(this);
    this.handleConnectionUpdate = this.handleConnectionUpdate.bind(this);
  }

  async createInstance(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const { instanceName } = req.body;
      
      if (!instanceName) {
        return res.status(400).json({ message: 'Instance name is required' });
      }

      // Create instance in internal Evolution API
      const result = await whatsappService.createInstance(instanceName, '');

      // Store in database
      await storage.createWhatsappInstance({
        userId,
        instanceName,
        status: 'CONNECTING',
      });

      // Configure internal event handling
      await internalWebhookService.setupInstanceEvents(instanceName, userId);

      console.log(`✅ Internal WhatsApp instance created: ${instanceName}`);
      res.json({ success: true, instanceName, service: 'Internal Evolution API' });
    } catch (error) {
      console.error('Error creating WhatsApp instance:', error);
      res.status(500).json({ message: 'Failed to create WhatsApp instance' });
    }
  }

  async diagnoseSystem(req: any, res: Response) {
    try {
      const diagnostics = {
        openaiApiKey: !!process.env.OPENAI_API_KEY,
        internalEvolutionApi: true,
        replitDomains: process.env.REPLIT_DOMAINS,
        timestamp: new Date().toISOString()
      };

      console.log('🔍 System diagnostics:', diagnostics);

      // Test Evolution API connection
      const evolutionTest = await whatsappService.testConnection();
      
      // Check all database instances
      const allInstances = await storage.getAllWhatsappInstances();
      console.log(`📊 Found ${allInstances.length} instances in database:`, allInstances.map(i => ({ 
        name: i.instanceName, 
        status: i.status, 
        userId: i.userId 
      })));
      
      // Check internal webhook service status
      const webhookStats = internalWebhookService.getInitializationStats();
      console.log('🔗 Internal webhook stats:', webhookStats);
      
      // Check which instances have active events
      const activeInstances = internalWebhookService.getActiveInstances();
      console.log('⚡ Active instances with events:', activeInstances);
      
      // Test OpenAI (simplified)
      let openaiTest = { working: false, error: null };
      try {
        const { aiService } = await import('../services/aiService');
        const testResponse = await aiService.processConversation(
          'test-user',
          'test-conversation',
          'Hello, this is a test message',
          { assistantName: 'Test Assistant' }
        );
        openaiTest.working = !!testResponse;
      } catch (error: any) {
        openaiTest.error = error.message;
      }

      res.json({
        diagnostics,
        evolutionApi: evolutionTest,
        openaiApi: openaiTest,
        instances: {
          total: allInstances.length,
          details: allInstances.map(i => ({ name: i.instanceName, status: i.status, userId: i.userId })),
          activeEvents: activeInstances,
          webhookStats
        }
      });
    } catch (error) {
      console.error('Error in system diagnostics:', error);
      res.status(500).json({ message: 'Failed to run diagnostics' });
    }
  }

  async initializeInstances(req: any, res: Response) {
    try {
      console.log('🔄 [MANUAL] Starting manual instance initialization...');
      await internalWebhookService.initializeExistingInstances();
      const stats = internalWebhookService.getInitializationStats();
      console.log(`✅ [MANUAL] Manual initialization complete: ${stats.totalActiveInstances} active instances`);
      
      res.json({
        success: true,
        message: 'Instance initialization completed',
        stats
      });
    } catch (error: any) {
      console.error('❌ [MANUAL] Error in manual initialization:', error);
      res.status(500).json({ message: 'Failed to initialize instances', error: error.message });
    }
  }

  async simulateIncomingMessage(req: any, res: Response) {
    try {
      const { instanceName, phoneNumber, message } = req.body;
      
      console.log(`🧪 [TEST] API call to simulate message for ${instanceName} from ${phoneNumber}: "${message}"`);
      
      // Use the internal webhook service's simulate function
      const result = await internalWebhookService.simulateIncomingMessage(instanceName, phoneNumber, message);
      
      res.json({
        success: true,
        message: 'Test message processed successfully',
        data: result.messageData
      });
      
    } catch (error: any) {
      console.error('❌ [TEST] Error in simulate API:', error);
      res.status(500).json({ message: 'Failed to simulate message', error: error.message });
    }
  }

  async testAiResponse(req: any, res: Response) {
    try {
      console.log('🤖 [TEST AI] Testing AI service directly...');
      
      const testResponse = await aiService.processConversation(
        'test-user',
        'test-conversation', 
        'Hola, quiero información sobre una casa en venta',
        {
          assistantName: 'Asistente Inmobiliario',
          context: 'eres un asistente de bienes raíces especializado en ayudar a clientes con propiedades'
        }
      );
      
      console.log(`🤖 [TEST AI] AI response: "${testResponse}"`);
      
      res.json({
        success: true,
        message: 'AI test completed',
        response: testResponse
      });
      
    } catch (error: any) {
      console.error('❌ [TEST AI] Error testing AI:', error);
      res.status(500).json({ message: 'Failed to test AI', error: error.message });
    }
  }

  async getQRCode(req: any, res: Response) {
    try {
      const { instanceName } = req.params;
      const qrData = await whatsappService.getQRCode(instanceName);
      
      // Update QR code in database
      await storage.updateWhatsappInstanceStatus(instanceName, 'CONNECTING', qrData.base64);

      res.json(qrData);
    } catch (error) {
      console.error('Error getting QR code:', error);
      res.status(500).json({ message: 'Failed to get QR code' });
    }
  }

  async sendMessage(req: any, res: Response) {
    try {
      const { instanceName, number, message, isMediaMessage, mediaUrl, caption } = req.body;

      let result;
      if (isMediaMessage && mediaUrl) {
        result = await whatsappService.sendMediaMessage(instanceName, number, mediaUrl, caption);
      } else {
        result = await whatsappService.sendMessage(instanceName, number, message);
      }

      res.json(result);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: 'Failed to send message' });
    }
  }

  async getInstanceStatus(req: any, res: Response) {
    try {
      const { instanceName } = req.params;
      const status = await whatsappService.getInstanceStatus(instanceName);
      
      // Update status in database using mapped status
      const dbStatus = status.mappedStatus || 'DISCONNECTED';
      await storage.updateWhatsappInstanceStatus(instanceName, dbStatus);

      res.json(status);
    } catch (error) {
      console.error('Error getting instance status:', error);
      res.status(500).json({ message: 'Failed to get instance status' });
    }
  }

  async logoutInstance(req: any, res: Response) {
    try {
      const { instanceName } = req.params;
      const result = await whatsappService.logoutInstance(instanceName);
      
      // Siempre actualizar estado en base de datos
      await storage.updateWhatsappInstanceStatus(instanceName, 'DISCONNECTED');

      res.json({ success: true, message: result.message || 'Instance logged out successfully' });
    } catch (error) {
      console.error('Error logging out instance:', error);
      res.status(500).json({ message: 'Failed to logout instance' });
    }
  }

  async forceDeleteInstance(req: any, res: Response) {
    try {
      const { instanceName } = req.params;
      
      // Primero eliminar todas las conversaciones y mensajes asociados
      await storage.deleteInstanceConversationsAndMessages(instanceName);
      
      // Luego eliminar la instancia
      await storage.deleteWhatsappInstance(instanceName);

      res.json({ success: true, message: 'Instance and associated data deleted from local database' });
    } catch (error) {
      console.error('Error force deleting instance:', error);
      res.status(500).json({ message: 'Failed to delete instance' });
    }
  }

  async getUserInstances(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const instances = await storage.getUserWhatsappInstances(userId);
      res.json(instances);
    } catch (error) {
      console.error('Error getting user instances:', error);
      res.status(500).json({ message: 'Failed to get instances' });
    }
  }

  async testConnection(req: any, res: Response) {
    try {
      const connectionTest = await whatsappService.testConnection();
      res.json(connectionTest);
    } catch (error) {
      console.error('Error testing connection:', error);
      res.status(500).json({ message: 'Failed to test connection' });
    }
  }

  async handleWebhook(req: Request, res: Response) {
    try {
      const { instanceName } = req.params;
      const webhookData = req.body;

      // ENHANCED LOGGING FOR REAL WEBHOOK DEBUGGING
      const timestamp = new Date().toISOString();
      console.log(`\n🔔 ===================== WEBHOOK RECEIVED =====================`);
      console.log(`⏰ Timestamp: ${timestamp}`);
      console.log(`📱 Instance: ${instanceName}`);
      console.log(`🌍 Source IP: ${req.ip || req.connection.remoteAddress}`);
      console.log(`🔗 URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
      console.log(`📋 Headers:`, JSON.stringify(req.headers, null, 2));
      console.log(`📦 Body:`, JSON.stringify(webhookData, null, 2));
      console.log(`🔔 ============================================================\n`);

      // Get instance from database
      const instance = await storage.getWhatsappInstance(instanceName);
      if (!instance) {
        console.log('❌ Instance not found in database:', instanceName);
        return res.status(404).json({ message: 'Instance not found' });
      }

      console.log('✅ Instance found:', instance.id);

      // Handle different webhook events
      if (webhookData.event === 'MESSAGES_UPSERT' || webhookData.event === 'messages.upsert') {
        console.log('📨 Processing message upsert event');
        await this.handleIncomingMessage(instance, webhookData.data);
      } else if (webhookData.event === 'CONNECTION_UPDATE' || webhookData.event === 'connection.update') {
        console.log('🔄 Processing connection update event');
        await this.handleConnectionUpdate(instanceName, webhookData.data);
      } else {
        console.log('⚠️ Unknown webhook event:', webhookData.event);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('❌ Error handling webhook:', error);
      console.error('Error stack:', error);
      res.status(500).json({ message: 'Failed to process webhook' });
    }
  }

  private async handleIncomingMessage(instance: any, messageData: any) {
    try {
      console.log('📨 Processing incoming message for instance:', instance.instanceName);
      console.log('🔍 Message data received:', JSON.stringify(messageData, null, 2));
      
      const message = messageData.messages?.[0];
      if (!message) {
        console.log('❌ No message found in webhook data');
        return;
      }
      
      if (message.fromMe) {
        console.log('⏭️ Skipping message from me');
        return;
      }

      const rawRemoteJid = message.key.remoteJid;
      const clientPhone = message.key.remoteJid.replace('@s.whatsapp.net', '');
      
      // Extract message content depending on type
      let messageContent = '';
      let messageType = 'TEXT';
      let mediaUrl = null;
      let mimeType = null;
      
      // Check what type of message we have
      if (message.message?.conversation) {
        messageContent = message.message.conversation;
        messageType = 'TEXT';
      } else if (message.message?.extendedTextMessage?.text) {
        messageContent = message.message.extendedTextMessage.text;
        messageType = 'TEXT';
      } else if (message.message?.audioMessage) {
        messageContent = '[Nota de voz recibida]';
        messageType = 'AUDIO';
        mediaUrl = message.message.audioMessage.url;
        mimeType = message.message.audioMessage.mimetype || 'audio/ogg';
        console.log(`🎤 Audio message detected: ${mediaUrl}`);
      } else if (message.message?.imageMessage) {
        messageContent = message.message.imageMessage.caption || '[Imagen recibida]';
        messageType = 'IMAGE';
        mediaUrl = message.message.imageMessage.url;
        mimeType = message.message.imageMessage.mimetype || 'image/jpeg';
        console.log(`🖼️ Image message detected: ${mediaUrl}`);
      } else if (message.message?.videoMessage) {
        messageContent = message.message.videoMessage.caption || '[Video recibido]';
        messageType = 'VIDEO';
        mediaUrl = message.message.videoMessage.url;
        mimeType = message.message.videoMessage.mimetype || 'video/mp4';
        console.log(`🎥 Video message detected: ${mediaUrl}`);
      } else {
        console.log('⚠️ Unknown message type detected:', Object.keys(message.message || {}));
      }
      
      console.log(`📞 RAW remoteJid: "${rawRemoteJid}"`);
      console.log(`📞 Processed phone: "${clientPhone}"`);
      console.log(`📞 Message: "${messageContent}"`);
      console.log(`📊 Message type: "${messageType}"`);
      if (mediaUrl) console.log(`🎯 Media URL: "${mediaUrl}"`);
      
      // Get or create conversation
      let conversation = await storage.getConversationByPhone(instance.id, clientPhone);
      if (!conversation) {
        console.log('🆕 Creating new conversation for phone:', clientPhone);
        conversation = await storage.createConversation({
          userId: instance.userId,
          whatsappInstanceId: instance.id,
          clientPhone,
          clientName: message.pushName || clientPhone,
        });
      }

      // Store message
      await storage.createMessage({
        conversationId: conversation.id,
        whatsappInstanceId: instance.id,
        messageId: message.key.id,
        fromMe: false,
        messageType: message.messageType || 'TEXT',
        content: messageContent,
        timestamp: new Date(message.messageTimestamp * 1000),
      });

      console.log('💾 Message stored in database');

      // Process multimedia content if present
      let finalMessageContent = messageContent;
      if (mediaUrl && (messageType === 'AUDIO' || messageType === 'IMAGE')) {
        console.log(`🎯 Processing multimedia content for ${messageType}`);
        try {
          // Download media content
          const mediaBuffer = await this.downloadMediaContent(mediaUrl);
          console.log(`📥 Media downloaded: ${mediaBuffer.length} bytes`);
          
          // Process multimedia using AI
          if (messageType === 'AUDIO') {
            const transcription = await aiService.transcribeAudio(mediaBuffer, mimeType);
            finalMessageContent = `Transcripción de audio: ${transcription}`;
            console.log(`🎤 Audio transcribed: "${transcription}"`);
          } else if (messageType === 'IMAGE') {
            const imageBase64 = mediaBuffer.toString('base64');
            const imageAnalysis = await aiService.analyzeImage(imageBase64);
            finalMessageContent = `Análisis de imagen: ${imageAnalysis}`;
            console.log(`🖼️ Image analyzed: "${imageAnalysis}"`);
          }
        } catch (error) {
          console.error(`❌ Error processing multimedia:`, error);
          finalMessageContent = messageType === 'AUDIO' 
            ? 'No pude procesar la nota de voz. ¿Podrías escribir tu mensaje?'
            : 'Recibí una imagen pero no pude analizarla. ¿Podrías describirme qué contiene?';
        }
      }

      // Get user settings for buffer configuration
      const settings = await storage.getUserSettings(instance.userId);
      const bufferTime = settings?.bufferTime || 10;

      console.log(`⏱️ Using buffer time: ${bufferTime}s`);

      // Add to buffer
      messageBufferService.addMessageToBuffer(
        conversation.id,
        finalMessageContent,
        message.key.id || `msg_${Date.now()}`,
        instance.userId
      );

      // Process if buffer is ready
      const bufferedMessage = await messageBufferService.processBufferedMessages(conversation.id);
      if (bufferedMessage) {
        console.log('🚀 Processing buffered message with AI');
        await this.processAIResponse(instance, conversation, bufferedMessage, settings);
      } else {
        console.log('⏳ Message added to buffer, waiting for more messages or timeout');
      }

      // Emit real-time update
      const wss = (global as any).wss;
      if (wss) {
        wss.clients.forEach((client: any) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'new_message',
              conversationId: conversation.id,
              message: {
                id: message.key.id,
                content: messageContent,
                fromMe: false,
                timestamp: new Date(message.messageTimestamp * 1000),
              },
            }));
          }
        });
      }
    } catch (error) {
      console.error('❌ Error handling incoming message:', error);
      console.error('Error stack:', error);
    }
  }

  private async processAIResponse(instance: any, conversation: any, message: string, settings: any) {
    try {
      console.log(`🤖 Starting AI response processing for conversation ${conversation.id}`);
      
      // Show typing indicator
      await whatsappService.setTyping(instance.instanceName, conversation.clientPhone, true);
      console.log('⌨️ Typing indicator set');

      // Get AI response
      const context = {
        assistantName: settings?.assistantName || 'Asistente IA',
        assistantPersonality: settings?.assistantPersonality,
        customSystemPrompt: settings?.systemPrompt,
        language: settings?.language || 'es',
      };

      console.log('🎯 AI Context:', context);

      const aiResponse = await aiService.processConversation(
        instance.userId,
        conversation.id,
        message,
        context
      );

      if (!aiResponse || aiResponse.trim() === '') {
        console.log('⚠️ Empty AI response received');
        throw new Error('Empty AI response');
      }

      console.log(`✅ AI response received: "${aiResponse}"`);

      // Humanize response using callback
      await messageBufferService.humanizeResponse(
        aiResponse,
        instance.userId,
        async (chunk: string) => {
          console.log(`📨 Sending message chunk: "${chunk.substring(0, 50)}..."`);
          
          const sendResult = await whatsappService.sendMessage(instance.instanceName, conversation.clientPhone, chunk);
          console.log('📨 Send result:', sendResult);

          // Store AI message
          await storage.createMessage({
            conversationId: conversation.id,
            whatsappInstanceId: instance.id,
            messageId: `ai_${Date.now()}_${Math.random()}`,
            fromMe: true,
            messageType: 'TEXT',
            content: chunk,
            timestamp: new Date(),
          });
        }
      );

      // Stop typing indicator
      await whatsappService.setTyping(instance.instanceName, conversation.clientPhone, false);
      console.log('✅ AI response processing completed successfully');

    } catch (error) {
      console.error('❌ Error processing AI response:', error);
      console.error('Error stack:', error);
      
      // Stop typing indicator in case of error
      try {
        await whatsappService.setTyping(instance.instanceName, conversation.clientPhone, false);
      } catch (typingError) {
        console.error('Error stopping typing indicator:', typingError);
      }
      
      // Send fallback message
      try {
        const fallbackMessage = 'Disculpa, estoy teniendo problemas técnicos. ¿Podrías repetir tu mensaje en unos minutos?';
        await whatsappService.sendMessage(
          instance.instanceName,
          conversation.clientPhone,
          fallbackMessage
        );
        
        // Store fallback message
        await storage.createMessage({
          conversationId: conversation.id,
          whatsappInstanceId: instance.id,
          messageId: `fallback_${Date.now()}`,
          fromMe: true,
          messageType: 'TEXT',
          content: fallbackMessage,
          timestamp: new Date(),
        });
      } catch (fallbackError) {
        console.error('❌ Error sending fallback message:', fallbackError);
      }
    }
  }

  private async handleConnectionUpdate(instanceName: string, connectionData: any) {
    try {
      const newStatus = connectionData.state === 'open' ? 'CONNECTED' : 
                       connectionData.state === 'connecting' ? 'CONNECTING' : 'DISCONNECTED';
      
      await storage.updateWhatsappInstanceStatus(instanceName, newStatus);

      // Emit real-time update
      const wss = (global as any).wss;
      if (wss) {
        wss.clients.forEach((client: any) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'connection_update',
              instanceName,
              status: newStatus,
            }));
          }
        });
      }
    } catch (error) {
      console.error('Error handling connection update:', error);
    }
  }

  /**
   * Descarga contenido multimedia desde URL
   */
  private async downloadMediaContent(mediaUrl: string): Promise<Buffer> {
    try {
      // Si es una URL data: (base64), extraer el buffer directamente
      if (mediaUrl.startsWith('data:')) {
        const base64Data = mediaUrl.split(',')[1];
        return Buffer.from(base64Data, 'base64');
      }
      
      // Si es una URL HTTP/HTTPS, descargar el contenido
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
      
    } catch (error) {
      console.error('❌ Error downloading media content:', error);
      throw new Error('Failed to download media content');
    }
  }
}

export const whatsappController = new WhatsAppController();
