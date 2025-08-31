import { Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService';
import { aiService } from '../services/aiService';
import { messageBufferService } from '../services/messageBufferService';
import { storage } from '../storage';

class WhatsAppController {
  async createInstance(req: any, res: Response) {
    try {
      const userId = req.user.claims.sub;
      const { instanceName } = req.body;
      
      if (!instanceName) {
        return res.status(400).json({ message: 'Instance name is required' });
      }

      // Create webhook URL 
      const domains = process.env.REPLIT_DOMAINS?.split(',') || ['localhost:5000'];
      const domain = domains[0];
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const webhookUrl = `${protocol}://${domain}/webhook/whatsapp/${instanceName}`;
      
      console.log('🔗 Configurando webhook para:', instanceName, 'URL:', webhookUrl);

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
      
      // Eliminar de la base de datos local independientemente del estado del servidor
      await storage.deleteWhatsappInstance(instanceName);

      res.json({ success: true, message: 'Instance deleted from local database' });
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

      console.log('WhatsApp webhook received:', instanceName, webhookData);

      // Get instance from database
      const instance = await storage.getWhatsappInstance(instanceName);
      if (!instance) {
        return res.status(404).json({ message: 'Instance not found' });
      }

      // Handle different webhook events
      if (webhookData.event === 'MESSAGES_UPSERT' || webhookData.event === 'messages.upsert') {
        await this.handleIncomingMessage(instance, webhookData.data);
      } else if (webhookData.event === 'CONNECTION_UPDATE' || webhookData.event === 'connection.update') {
        await this.handleConnectionUpdate(instanceName, webhookData.data);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ message: 'Failed to process webhook' });
    }
  }

  private async handleIncomingMessage(instance: any, messageData: any) {
    try {
      const message = messageData.messages?.[0];
      if (!message || message.fromMe) return;

      const clientPhone = message.key.remoteJid.replace('@s.whatsapp.net', '');
      
      // Get or create conversation
      let conversation = await storage.getConversationByPhone(instance.id, clientPhone);
      if (!conversation) {
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
        content: message.message?.conversation || message.message?.text || '',
        timestamp: new Date(message.messageTimestamp * 1000),
      });

      // Get user settings for buffer configuration
      const settings = await storage.getUserSettings(instance.userId);
      const bufferTime = settings?.bufferTime || 10;

      // Add to buffer
      messageBufferService.addMessageToBuffer(
        conversation.id,
        message.message?.conversation || message.message?.text || '',
        bufferTime
      );

      // Process if buffer is ready
      const bufferedMessage = await messageBufferService.processBufferedMessages(conversation.id);
      if (bufferedMessage) {
        await this.processAIResponse(instance, conversation, bufferedMessage, settings);
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
                content: message.message?.conversation || message.message?.text || '',
                fromMe: false,
                timestamp: new Date(message.messageTimestamp * 1000),
              },
            }));
          }
        });
      }
    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }

  private async processAIResponse(instance: any, conversation: any, message: string, settings: any) {
    try {
      // Show typing indicator
      await whatsappService.setTyping(instance.instanceName, conversation.clientPhone, true);

      // Get AI response
      const context = {
        assistantName: settings?.assistantName || 'Asistente IA',
        assistantPersonality: settings?.assistantPersonality,
        customSystemPrompt: settings?.systemPrompt,
        language: settings?.language || 'es',
      };

      const aiResponse = await aiService.processConversation(
        instance.userId,
        conversation.id,
        message,
        context
      );

      // Humanize response
      const { chunks, delays } = messageBufferService.humanizeResponse(
        aiResponse,
        settings?.maxMessageChunks || 160
      );

      // Send response chunks with delays
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, delays[i - 1]));
        }

        await whatsappService.sendMessage(instance.instanceName, conversation.clientPhone, chunks[i]);

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

    } catch (error) {
      console.error('Error processing AI response:', error);
      
      // Send fallback message
      await whatsappService.sendMessage(
        instance.instanceName,
        conversation.clientPhone,
        'Disculpa, estoy teniendo problemas técnicos. ¿Podrías repetir tu mensaje?'
      );
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
