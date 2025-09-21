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

      // Create instance in internal Evolution API using only internal events (no HTTP webhooks)
      console.log(`🔗 Using internal events only for ${instanceName} (no HTTP webhooks)`);
      const result = await whatsappService.createInstance(instanceName, undefined);

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
      
      // Solo actualizar en base de datos si hay un QR code válido
      if (qrData.base64 && !qrData.error) {
        await storage.updateWhatsappInstanceStatus(instanceName, 'CONNECTING', qrData.base64);
      } else if (qrData.status === 'CONNECTED') {
        await storage.updateWhatsappInstanceStatus(instanceName, 'CONNECTED');
      }

      res.json(qrData);
    } catch (error) {
      console.error('Error getting QR code:', error);
      res.status(500).json({ 
        message: 'Error al obtener código QR',
        error: true,
        status: 'ERROR'
      });
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
      
      // 🎯 RESOLVER: Use InstanceResolver for proper instance deletion with migration
      const { instanceResolver } = await import('../services/instanceResolver');
      await instanceResolver.handleInstanceDeletion(instanceName);
      
      // Delete from storage after resolver handles migration
      await storage.deleteInstanceConversationsAndMessages(instanceName);
      await storage.deleteWhatsappInstance(instanceName);

      res.json({ success: true, message: 'Instance and associated data deleted with automatic migration' });
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

      // Check if this is a button click response
      if (this.isButtonClick(messageContent)) {
        console.log('🔘 Button click detected, processing...');
        await this.handleButtonClick(messageContent, instance, conversation);
        return;
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
        // AlterEstate integration
        alterEstateEnabled: settings?.alterEstateEnabled || false,
        alterEstateToken: settings?.alterEstateToken,
        alterEstateApiKey: settings?.alterEstateApiKey,
        userLocation: conversation.clientPhone?.includes('1829') ? 'Santo Domingo' : undefined,
      };

      console.log('🎯 AI Context:', context);

      const aiResponse = await aiService.processConversation(
        instance.userId,
        conversation.id,
        message,
        context
      );

      // Check if there are pending media files or carousels to send
      const { AIService } = await import('../services/aiService');
      const pendingMedia = AIService.getPendingMedia(conversation.id);
      
      if (pendingMedia && context.alterEstateToken) {
        if (pendingMedia.type === 'carousel') {
          console.log('🎠 [WHATSAPP] Pending carousel detected, sending property cards...');
          await this.sendPropertyCarousel(pendingMedia.properties, instance, conversation);
        } else {
          console.log('📸 [WHATSAPP] Pending media detected, processing...');
          await this.sendPropertyMediaFromQueue(pendingMedia, instance, conversation, context);
        }
      }
      
      // Also check legacy detection method for backwards compatibility
      if (aiResponse.includes('Te estoy preparando las fotos') && context.alterEstateToken) {
        console.log('📸 [WHATSAPP] AI requested property media (legacy method), processing...');
        await this.handlePropertyMediaRequest(message, instance, conversation, context);
      }

      if (!aiResponse || aiResponse.trim() === '') {
        console.log('⚠️ Empty AI response received');
        throw new Error('Empty AI response');
      }

      console.log(`✅ AI response received: "${aiResponse}"`);

      // Check if user shows interest for lead creation
      if (this.detectUserInterest(message) && context.alterEstateEnabled) {
        console.log('💡 [WHATSAPP] User interest detected, creating lead');
        await this.createLeadFromInterest(message, instance, conversation, context);
      }

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

  /**
   * Enviar media de propiedades desde el queue
   */
  private async sendPropertyMediaFromQueue(
    mediaQueue: any,
    instance: any,
    conversation: any,
    context: any
  ): Promise<void> {
    try {
      console.log(`📸 [WHATSAPP] Sending queued media for property: ${mediaQueue.propertySlug}`);
      
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
        console.log('📷 [WHATSAPP] No media available for this property');
        return;
      }
      
      console.log(`📸 [WHATSAPP] Sending ${mediaToSend.length} media files`);
      
      // Enviar cada imagen con un delay
      for (let i = 0; i < mediaToSend.length; i++) {
        const mediaUrl = mediaToSend[i];
        console.log(`📤 [WHATSAPP] Sending media ${i + 1}/${mediaToSend.length}: ${mediaUrl}`);
        
        try {
          await whatsappService.sendMedia(
            instance.instanceName,
            conversation.clientPhone,
            mediaUrl,
            'image',
            i === 0 ? `📸 Propiedad ${mediaQueue.propertySlug}` : ''
          );
          
          // Store media message in database
          await storage.createMessage({
            conversationId: conversation.id,
            whatsappInstanceId: instance.id,
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
          console.error(`❌ [WHATSAPP] Error sending media ${i + 1}:`, mediaError);
        }
      }
      
      // Enviar tour virtual si existe
      if (mediaQueue.virtualTour) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await whatsappService.sendMessage(
          instance.instanceName,
          conversation.clientPhone,
          `🎥 Tour Virtual: ${mediaQueue.virtualTour}`
        );
      }
      
    } catch (error) {
      console.error('❌ [WHATSAPP] Error sending queued media:', error);
    }
  }

  /**
   * Enviar carrusel de propiedades con tarjetas interactivas
   */
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
    instance: any,
    conversation: any
  ): Promise<void> {
    try {
      console.log(`🎠 [WHATSAPP] Sending property carousel with ${properties.length} properties`);
      
      // Enviar mensaje introductorio
      await whatsappService.sendMessage(
        instance.instanceName,
        conversation.clientPhone,
        `🏠 Encontré ${properties.length} propiedades perfectas para ti:`
      );
      
      // Esperar un momento antes de enviar las tarjetas
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Enviar carrusel usando el servicio de WhatsApp
      await whatsappService.sendPropertyCarousel(
        instance.instanceName,
        conversation.clientPhone,
        properties
      );
      
      // Mensaje de seguimiento
      await new Promise(resolve => setTimeout(resolve, 2000));
      await whatsappService.sendMessage(
        instance.instanceName,
        conversation.clientPhone,
        '💡 Toca los botones de las tarjetas para ver más detalles o fotos de cada propiedad. ¿Alguna te llama la atención?'
      );
      
    } catch (error) {
      console.error('❌ [WHATSAPP] Error sending property carousel:', error);
      // Fallback: enviar como texto
      const textSummary = properties.map((p, i) => 
        `${i + 1}. ${p.title}\n💰 ${p.price}\n📍 ${p.description}\n🔗 ${p.propertyUrl}`
      ).join('\n\n');
      
      await whatsappService.sendMessage(
        instance.instanceName,
        conversation.clientPhone,
        `🏠 Propiedades encontradas:\n\n${textSummary}`
      );
    }
  }

  /**
   * Manejar solicitud de medios de propiedades
   */
  private async handlePropertyMediaRequest(
    message: string, 
    instance: any, 
    conversation: any, 
    context: any
  ): Promise<void> {
    try {
      console.log('📸 [WHATSAPP] Processing property media request');
      
      // Extract property ID from message
      const propertyIdMatch = message.match(/([A-Z0-9]{10})/);
      
      if (!propertyIdMatch) {
        console.log('⚠️ [WHATSAPP] No property ID found in message');
        return;
      }
      
      const propertyId = propertyIdMatch[1];
      console.log(`🏠 [WHATSAPP] Sending media for property: ${propertyId}`);
      
      // Get property details including images
      const { alterEstateService } = await import('../services/alterEstateService');
      
      // First, search for the property to get its slug
      const searchResult = await alterEstateService.searchProperties(context.alterEstateToken, {});
      const property = searchResult.results.find(p => p.uid === propertyId);
      
      if (!property) {
        console.log('❌ [WHATSAPP] Property not found');
        await whatsappService.sendMessage(
          instance.instanceName, 
          conversation.clientPhone, 
          'No pude encontrar esa propiedad en nuestro sistema. ¿Podrías verificar el ID?'
        );
        return;
      }
      
      // Get detailed property information including gallery
      const propertyDetail = await alterEstateService.getPropertyDetail(context.alterEstateToken, property.slug);
      
      if (propertyDetail.gallery_image && propertyDetail.gallery_image.length > 0) {
        console.log(`📸 [WHATSAPP] Found ${propertyDetail.gallery_image.length} images for property`);
        
        // Send up to 5 images to avoid overwhelming the user
        const imagesToSend = propertyDetail.gallery_image.slice(0, 5);
        
        for (let i = 0; i < imagesToSend.length; i++) {
          const imageUrl = imagesToSend[i];
          console.log(`📤 [WHATSAPP] Sending image ${i + 1}/${imagesToSend.length}: ${imageUrl}`);
          
          try {
            await whatsappService.sendMedia(
              instance.instanceName,
              conversation.clientPhone,
              imageUrl,
              'image',
              i === 0 ? `📸 Fotos de ${propertyDetail.name}` : ''
            );
            
            // Small delay between images
            if (i < imagesToSend.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (mediaError) {
            console.error(`❌ [WHATSAPP] Error sending image ${i + 1}:`, mediaError);
          }
        }
        
        // Send follow-up message
        await new Promise(resolve => setTimeout(resolve, 1000));
        await whatsappService.sendMessage(
          instance.instanceName,
          conversation.clientPhone,
          `📸 Te envié ${imagesToSend.length} fotos de ${propertyDetail.name}. ¿Te gustaría más información o programar una visita?`
        );
        
      } else {
        console.log('📷 [WHATSAPP] No images available for this property');
        await whatsappService.sendMessage(
          instance.instanceName,
          conversation.clientPhone,
          'Esta propiedad no tiene fotos disponibles por el momento. ¿Te gustaría que coordine una visita virtual o te proporcione más información sobre sus características?'
        );
      }
      
    } catch (error) {
      console.error('❌ [WHATSAPP] Error handling property media request:', error);
      await whatsappService.sendMessage(
        instance.instanceName,
        conversation.clientPhone,
        'Disculpa, tuve un problema obteniendo las fotos. ¿Podrías intentar de nuevo en unos minutos?'
      );
    }
  }

  /**
   * Detectar si el usuario muestra interés en una propiedad
   */
  private detectUserInterest(message: string): boolean {
    const messageLower = message.toLowerCase();
    const interestKeywords = [
      'me interesa', 'interesado', 'agendar', 'visita', 'ver',
      'información', 'detalles', 'precio', 'comprar', 'rentar',
      'contacto', 'teléfono', 'llamar', 'programar', 'cita',
      'interested', 'schedule', 'visit', 'buy', 'rent', 'contact'
    ];
    
    return interestKeywords.some(keyword => messageLower.includes(keyword));
  }

  /**
   * Crear lead en AlterEstate cuando hay interés
   */
  private async createLeadFromInterest(
    message: string, 
    instance: any, 
    conversation: any, 
    context: any
  ): Promise<void> {
    try {
      console.log('📝 [WHATSAPP] Creating lead from user interest');
      
      // Extraer ID de propiedad si está mencionado
      const propertyIdMatch = message.match(/([A-Z0-9]{10})/);
      const propertyUid = propertyIdMatch ? propertyIdMatch[1] : undefined;
      
      // Obtener nombre del cliente de la conversación previa si existe
      const clientName = conversation.clientName || 'Cliente WhatsApp';
      
      // Crear lead usando el servicio de IA
      const leadCreated = await aiService.createLeadFromConversation(
        context,
        conversation.clientPhone,
        clientName,
        propertyUid,
        `Interés expresado: "${message}"`
      );
      
      if (leadCreated) {
        console.log('✅ [WHATSAPP] Lead created successfully');
        
        // Opcional: notificar al usuario que su información fue registrada
        setTimeout(async () => {
          await whatsappService.sendMessage(
            instance.instanceName,
            conversation.clientPhone,
            '📝 He registrado tu interés. Un asesor se pondrá en contacto contigo pronto para darte más información.'
          );
        }, 3000);
      }
      
    } catch (error) {
      console.error('❌ [WHATSAPP] Error creating lead:', error);
      // No interrumpir la conversación por errores de lead
    }
  }

  /**
   * Detectar si el mensaje es un click de botón
   */
  private isButtonClick(messageContent: string): boolean {
    // Los clicks de botones tienen patrones específicos como "info_PROPERTY_UID" o "photos_PROPERTY_UID"
    const buttonPatterns = [
      /^info_[A-Z0-9]{8,12}$/i,
      /^photos_[A-Z0-9]{8,12}$/i,
      /^details_[A-Z0-9]{8,12}$/i
    ];
    
    return buttonPatterns.some(pattern => pattern.test(messageContent.trim()));
  }

  /**
   * Manejar clicks en botones de tarjetas de propiedades
   */
  private async handleButtonClick(
    buttonId: string, 
    instance: any, 
    conversation: any
  ): Promise<void> {
    try {
      console.log(`🔘 [WHATSAPP] Processing button click: ${buttonId}`);
      
      // Extraer acción y property UID del buttonId
      const [action, propertyUid] = buttonId.split('_');
      
      if (!propertyUid) {
        console.log('⚠️ [WHATSAPP] Invalid button ID format');
        return;
      }
      
      // Obtener configuraciones del usuario
      const settings = await storage.getUserSettings(instance.userId);
      const context = {
        alterEstateEnabled: settings?.alterEstateEnabled || false,
        alterEstateToken: settings?.alterEstateToken,
        alterEstateApiKey: settings?.alterEstateApiKey,
      };
      
      if (!context.alterEstateEnabled || !context.alterEstateToken) {
        await whatsappService.sendMessage(
          instance.instanceName,
          conversation.clientPhone,
          'Para acceder a los detalles de la propiedad, necesito que AlterEstate CRM esté configurado.'
        );
        return;
      }

      const { alterEstateService } = await import('../services/alterEstateService');
      
      if (action === 'info') {
        // Enviar información detallada de la propiedad
        console.log(`📋 [WHATSAPP] Sending detailed info for property: ${propertyUid}`);
        
        try {
          // Buscar la propiedad por UID
          const searchResult = await alterEstateService.searchProperties(context.alterEstateToken, {});
          const property = searchResult.results.find(p => p.uid === propertyUid);
          
          if (!property) {
            await whatsappService.sendMessage(
              instance.instanceName,
              conversation.clientPhone,
              'No pude encontrar los detalles de esa propiedad. ¿Podrías intentar de nuevo?'
            );
            return;
          }
          
          // Obtener detalles completos
          const propertyDetail = await alterEstateService.getPropertyDetail(context.alterEstateToken, property.slug);
          const propertyUrl = alterEstateService.getPropertyPublicUrl(
            property.slug, 
            settings?.realEstateWebsiteUrl || undefined
          );
          
          // Formatear información detallada
          const detailsMessage = `🏠 **${propertyDetail.name}**

💰 **Precio**: ${propertyDetail.currency_sale} ${propertyDetail.sale_price.toLocaleString()}
🏢 **Tipo**: ${propertyDetail.category.name}
🏠 **Habitaciones**: ${propertyDetail.room || 'N/A'}
🚿 **Baños**: ${propertyDetail.bathroom || 'N/A'}
🚗 **Estacionamientos**: ${propertyDetail.parkinglot || 'N/A'}
📐 **Área**: ${propertyDetail.property_area ? propertyDetail.property_area + ' m²' : 'N/A'}
📍 **Ubicación**: ${propertyDetail.sector}, ${propertyDetail.city}

📝 **Descripción**: 
${propertyDetail.description || propertyDetail.short_description}

🔗 **Ver en línea**: ${propertyUrl}

¿Te gustaría agendar una visita o ver las fotos de esta propiedad?`;

          await whatsappService.sendMessage(
            instance.instanceName,
            conversation.clientPhone,
            detailsMessage
          );
          
        } catch (error) {
          console.error(`❌ [WHATSAPP] Error getting property details:`, error);
          await whatsappService.sendMessage(
            instance.instanceName,
            conversation.clientPhone,
            'Disculpa, tuve un problema obteniendo los detalles de la propiedad. ¿Podrías intentar de nuevo?'
          );
        }
        
      } else if (action === 'photos') {
        // Enviar fotos de la propiedad
        console.log(`📸 [WHATSAPP] Sending photos for property: ${propertyUid}`);
        
        try {
          // Buscar la propiedad y obtener media
          const searchResult = await alterEstateService.searchProperties(context.alterEstateToken, {});
          const property = searchResult.results.find(p => p.uid === propertyUid);
          
          if (!property) {
            await whatsappService.sendMessage(
              instance.instanceName,
              conversation.clientPhone,
              'No pude encontrar las fotos de esa propiedad. ¿Podrías intentar de nuevo?'
            );
            return;
          }
          
          // Obtener media de la propiedad
          const media = await alterEstateService.getPropertyMedia(context.alterEstateToken, property.slug);
          
          // Enviar fotos usando el sistema existente
          const mediaQueue = {
            propertySlug: property.slug,
            images: media.images,
            featuredImage: media.featuredImage,
            virtualTour: media.virtualTour
          };
          
          await this.sendPropertyMediaFromQueue(mediaQueue, instance, conversation, context);
          
        } catch (error) {
          console.error(`❌ [WHATSAPP] Error getting property photos:`, error);
          await whatsappService.sendMessage(
            instance.instanceName,
            conversation.clientPhone,
            'Disculpa, tuve un problema obteniendo las fotos de la propiedad. ¿Podrías intentar de nuevo?'
          );
        }
        
      } else if (action === 'visit') {
        // Agendar visita a la propiedad
        console.log(`🗓️ [WHATSAPP] Scheduling visit for property: ${propertyUid}`);
        
        try {
          // Buscar la propiedad por UID
          const searchResult = await alterEstateService.searchProperties(context.alterEstateToken, {});
          const property = searchResult.results.find(p => p.uid === propertyUid);
          
          if (!property) {
            await whatsappService.sendMessage(
              instance.instanceName,
              conversation.clientPhone,
              'No pude encontrar esa propiedad para agendar la visita. ¿Podrías intentar de nuevo?'
            );
            return;
          }
          
          // Crear lead automáticamente si hay interés en visita
          const { aiService } = await import('../services/aiService');
          await aiService.createLeadFromConversation(
            context,
            conversation.clientPhone,
            conversation.clientName || 'Cliente WhatsApp',
            propertyUid,
            `Interesado en agendar visita para propiedad: ${property.name}`
          );
          
          // Mensaje para coordinar la visita
          const visitMessage = `🗓️ **Agendar Visita - ${property.name}**

¡Perfecto! Me encanta que te interese esta propiedad. 

📍 **Ubicación**: ${property.sector}, ${property.city}
💰 **Precio**: ${property.currency_sale} ${property.sale_price.toLocaleString()}

Para coordinar tu visita, necesito algunos datos:

1️⃣ **¿Qué días prefieres?** (Lun-Vie o fin de semana)
2️⃣ **¿Qué horario te conviene mejor?** (mañana, tarde)
3️⃣ **¿Tu nombre completo?**
4️⃣ **¿Un número de contacto adicional?**

También he registrado tu interés en nuestro sistema para darte seguimiento personalizado. 📝

¿Con qué información empezamos?`;

          await whatsappService.sendMessage(
            instance.instanceName,
            conversation.clientPhone,
            visitMessage
          );
          
        } catch (error) {
          console.error(`❌ [WHATSAPP] Error scheduling visit:`, error);
          await whatsappService.sendMessage(
            instance.instanceName,
            conversation.clientPhone,
            'Disculpa, tuve un problema organizando la visita. ¿Podrías escribirme directamente que te gustaría agendar una visita?'
          );
        }
      }
      
    } catch (error) {
      console.error('❌ [WHATSAPP] Error handling button click:', error);
      await whatsappService.sendMessage(
        instance.instanceName,
        conversation.clientPhone,
        'Disculpa, tuve un problema procesando tu solicitud. ¿Podrías intentar de nuevo?'
      );
    }
  }
}

export const whatsappController = new WhatsAppController();
