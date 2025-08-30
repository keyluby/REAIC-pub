import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { whatsappController } from "./controllers/whatsappController";
import { crmController } from "./controllers/crmController";
import { appointmentController } from "./controllers/appointmentController";
import { validateRequest } from "./middleware/validation";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard routes
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // User settings routes
  app.get('/api/settings', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);
      res.json(settings || {});
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.post('/api/settings', isAuthenticated, validateRequest('userSettings'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.upsertUserSettings({ userId, ...req.body });
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // WhatsApp routes
  app.post('/api/whatsapp/create-instance', isAuthenticated, whatsappController.createInstance);
  app.get('/api/whatsapp/qr-code/:instanceName', isAuthenticated, whatsappController.getQRCode);
  app.post('/api/whatsapp/send-message', isAuthenticated, whatsappController.sendMessage);
  app.get('/api/whatsapp/instance-status/:instanceName', isAuthenticated, whatsappController.getInstanceStatus);
  app.delete('/api/whatsapp/logout/:instanceName', isAuthenticated, whatsappController.logoutInstance);
  app.delete('/api/whatsapp/force-delete/:instanceName', isAuthenticated, whatsappController.forceDeleteInstance);
  app.get('/api/whatsapp/instances', isAuthenticated, whatsappController.getUserInstances);
  app.get('/api/whatsapp/test-connection', isAuthenticated, whatsappController.testConnection);

  // WhatsApp webhook
  app.post('/webhook/whatsapp/:instanceName', whatsappController.handleWebhook);

  // Conversations routes
  app.get('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversations = await storage.getUserConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get('/api/conversations/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getConversationMessages(id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // CRM routes
  app.get('/api/crm/properties', isAuthenticated, crmController.getProperties);
  app.get('/api/crm/properties/:slug', isAuthenticated, crmController.getPropertyDetail);
  app.post('/api/crm/leads', isAuthenticated, crmController.createLead);
  app.get('/api/crm/locations/cities', isAuthenticated, crmController.getCities);
  app.get('/api/crm/locations/sectors/:cityId', isAuthenticated, crmController.getSectors);
  app.get('/api/crm/agents', isAuthenticated, crmController.getAgents);

  // Appointments routes
  app.post('/api/appointments', isAuthenticated, appointmentController.createAppointment);
  app.get('/api/appointments', isAuthenticated, appointmentController.getUserAppointments);
  app.patch('/api/appointments/:id/status', isAuthenticated, appointmentController.updateStatus);

  // Leads routes
  app.get('/api/leads', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leads = await storage.getUserLeads(userId);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket setup for real-time messaging
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        // Handle different message types
        switch (data.type) {
          case 'join_conversation':
            // Join conversation room for real-time updates
            break;
          case 'typing':
            // Broadcast typing indicator
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  // Store WebSocket server for use in other services
  (global as any).wss = wss;

  return httpServer;
}
