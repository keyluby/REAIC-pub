import { Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService';
import { aiService } from '../services/aiService';
import { messageBufferService } from '../services/messageBufferService';
import { storage } from '../storage';
import { constructWebhookUrl, logDomainInfo } from '../utils/domainDetection';

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

      // Auto-detect webhook URL (scalable for any environment)
      const webhookUrl = constructWebhookUrl(instanceName, req);
      
      // Log domain detection info for debugging
      logDomainInfo(req);
      console.log('🔗 Webhook URL configured:', webhookUrl);

      // Create instance in Evolution API
      const result = await whatsappService.createInstance(instanceName, webhookUrl);

      // Store in database
      await storage.createWhatsappInstance({
        userId,
        instanceName,
        status: 'CONNECTING',
      });

      res.json({ success: true, instanceName, webhookUrl });
    } catch (error) {
      console.error('Error creating WhatsApp instance:', error);
      res.status(500).json({ message: 'Failed to create WhatsApp instance' });
    }
  }

  async diagnoseSystem(req: any, res: Response) {
    try {
      const diagnostics = {
        openaiApiKey: !!process.env.OPENAI_API_KEY,
        evolutionApiKey: !!process.env.EVOLUTION_API_KEY,
        replitDomains: process.env.REPLIT_DOMAINS,
        timestamp: new Date().toISOString()
      };

      console.log('🔍 System diagnostics:', diagnostics);

      // Test Evolution API connection
      const evolutionTest = await whatsappService.testConnection();
      
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
        openaiApi: openaiTest
      });
    } catch (error) {
      console.error('Error in system diagnostics:', error);
      res.status(500).json({ message: 'Failed to run diagnostics' });
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

      console.log('🔔 WhatsApp webhook received for instance:', instanceName);
      console.log('🔍 Webhook data:', JSON.stringify(webhookData, null, 2));

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

      const clientPhone = message.key.remoteJid.replace('@s.whatsapp.net', '');
      const messageContent = message.message?.conversation || message.message?.extendedTextMessage?.text || message.message?.text || '';
      
      console.log(`📞 Message from ${clientPhone}: "${messageContent}"`);
      
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

      // Get user settings for buffer configuration
      const settings = await storage.getUserSettings(instance.userId);
      const bufferTime = settings?.bufferTime || 10;

      console.log(`⏱️ Using buffer time: ${bufferTime}s`);

      // Add to buffer
      messageBufferService.addMessageToBuffer(
        conversation.id,
        messageContent,
        bufferTime
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

      // Humanize response
      const { chunks, delays } = messageBufferService.humanizeResponse(
        aiResponse,
        settings?.maxMessageChunks || 160
      );

      console.log(`📤 Sending ${chunks.length} message chunks`);

      // Send response chunks with delays
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          console.log(`⏱️ Waiting ${delays[i - 1]}ms before next chunk`);
          await new Promise(resolve => setTimeout(resolve, delays[i - 1]));
        }

        console.log(`📨 Sending chunk ${i + 1}/${chunks.length}: "${chunks[i]}"`);
        
        const sendResult = await whatsappService.sendMessage(instance.instanceName, conversation.clientPhone, chunks[i]);
        console.log('📨 Send result:', sendResult);

        // Store AI message
        await storage.createMessage({
          conversationId: conversation.id,
          whatsappInstanceId: instance.id,
          messageId: `ai_${Date.now()}_${i}`,
          fromMe: true,
          messageType: 'TEXT',
          content: chunks[i],
          timestamp: new Date(),
        });
      }

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
}

export const whatsappController = new WhatsAppController();
