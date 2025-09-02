import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { whatsappController } from "./controllers/whatsappController";
import { crmController } from "./controllers/crmController";
import { appointmentController } from "./controllers/appointmentController";
import { validateRequest } from "./middleware/validation";
import { manualPropertyService } from './services/manualPropertyService';
import axios from "axios";

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

  // User settings routes (temporary bypass for testing)
  app.get('/api/settings-test', async (req: any, res) => {
    try {
      // Return default settings for testing
      res.json({
        aiSystemPrompt: "Eres un asistente de bienes raíces...",
        responseDelay: 2000,
        bufferTime: 15000,
        bufferInterval: 3000,
        maxBufferMessages: 4,
        alterEstateEnabled: false,
        alterEstateToken: "",
        alterEstateApiKey: "",
        alterEstateCompanyId: "",
        humanEscalationEnabled: false,
        notificationMethod: "Email",
        notificationEmail: "",
        notificationWhatsApp: "",
        googleCalendarId: "",
        calComUsername: ""
      });
    } catch (error) {
      console.error("Error in test settings:", error);
      res.status(500).json({ message: "Failed to fetch test settings" });
    }
  });

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

  // Test AlterEstate connection
  app.post('/api/test-alterestate-connection', isAuthenticated, async (req: any, res) => {
    try {
      const { alterEstateToken, alterEstateApiKey, alterEstateCompanyId } = req.body;
      
      if (!alterEstateToken) {
        return res.status(400).json({ 
          success: false, 
          message: "Token de lectura es requerido" 
        });
      }

      // Import AlterEstate service
      const { alterEstateService } = await import('./services/alterEstateService');
      
      // Test read token with agents endpoint
      const isTokenValid = await alterEstateService.validateToken(alterEstateToken);
      
      if (!isTokenValid) {
        return res.status(400).json({ 
          success: false, 
          message: "Token de lectura inválido" 
        });
      }

      // Get properties to verify connection (more reliable than agents)
      let propertiesCount = 0;
      try {
        const properties = await alterEstateService.searchProperties(alterEstateToken, {}, 1);
        propertiesCount = properties.count || 0;
      } catch (error) {
        console.log('Could not get properties count, but token is valid');
      }
      
      // Test API key if provided (for write operations)
      let apiKeyStatus = null;
      if (alterEstateApiKey) {
        try {
          // Try a minimal test with the API key using properties endpoint
          const testResponse = await axios.get('https://secure.alterestate.com/api/v1/properties/filter/?page=1', {
            headers: {
              'Authorization': `Token ${alterEstateApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          if (testResponse.status === 200) {
            apiKeyStatus = "✅ API Key de escritura válida";
          } else {
            apiKeyStatus = "❌ API Key de escritura inválida";
          }
        } catch (error) {
          apiKeyStatus = "❌ API Key de escritura inválida";
        }
      }

      res.json({
        success: true,
        message: "Conexión exitosa con AlterEstate",
        details: {
          readToken: "✅ Token de lectura válido",
          apiKey: apiKeyStatus,
          propertiesFound: `✅ ${propertiesCount} propiedades disponibles`,
          companyId: alterEstateCompanyId ? `✅ ID de empresa: ${alterEstateCompanyId}` : "⚠️ ID de empresa no configurado"
        }
      });
      
    } catch (error) {
      console.error("Error testing AlterEstate connection:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error al conectar con AlterEstate: " + (error instanceof Error ? error.message : 'Error desconocido')
      });
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
  app.get('/api/whatsapp/diagnose', isAuthenticated, whatsappController.diagnoseSystem);
  app.get('/api/whatsapp/diagnose-public', whatsappController.diagnoseSystem);
  app.post('/api/whatsapp/initialize-instances', isAuthenticated, whatsappController.initializeInstances);
  app.post('/api/whatsapp/initialize-instances-public', whatsappController.initializeInstances);
  app.post('/api/whatsapp/simulate-message', whatsappController.simulateIncomingMessage);

  // Web Scraping routes
  app.post('/api/scraping/analyze-site', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { url, name, description } = req.body;
      
      if (!url || !name) {
        return res.status(400).json({ message: "URL y nombre son requeridos" });
      }

      const { webScrapingService } = await import('./services/webScrapingService');
      const result = await webScrapingService.analyzeSite(userId, url, name, description);
      
      res.json(result);
    } catch (error) {
      console.error("Error analyzing site:", error);
      res.status(500).json({ message: "Error al analizar el sitio web" });
    }
  });

  app.get('/api/scraping/websites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { webScrapingService } = await import('./services/webScrapingService');
      const websites = await webScrapingService.getUserWebsites(userId);
      
      res.json(websites);
    } catch (error) {
      console.error("Error fetching websites:", error);
      res.status(500).json({ message: "Error al obtener sitios web configurados" });
    }
  });

  app.post('/api/scraping/run-scraping/:websiteId', isAuthenticated, async (req: any, res) => {
    try {
      const { websiteId } = req.params;
      const { webScrapingService } = await import('./services/webScrapingService');
      
      // Ejecutar scraping en background
      webScrapingService.scrapeWebsite(websiteId).catch(error => {
        console.error("Background scraping error:", error);
      });
      
      res.json({ message: "Scraping iniciado en segundo plano" });
    } catch (error) {
      console.error("Error starting scraping:", error);
      res.status(500).json({ message: "Error al iniciar el scraping" });
    }
  });

  app.get('/api/scraping/properties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { websiteId } = req.query;
      const { webScrapingService } = await import('./services/webScrapingService');
      
      const properties = await webScrapingService.getScrapedProperties(userId, websiteId as string);
      
      res.json(properties);
    } catch (error) {
      console.error("Error fetching scraped properties:", error);
      res.status(500).json({ message: "Error al obtener propiedades extraídas" });
    }
  });

  // Obtener URLs de propiedades encontradas de un sitio web para selección manual
  app.get('/api/scraping/discover-urls/:websiteId', isAuthenticated, async (req: any, res) => {
    try {
      const { websiteId } = req.params;
      const { webScrapingService } = await import('./services/webScrapingService');
      
      const result = await webScrapingService.discoverPropertyUrls(websiteId);
      
      res.json(result);
    } catch (error) {
      console.error("Error discovering URLs:", error);
      res.status(500).json({ message: "Error al descubrir URLs de propiedades" });
    }
  });

  // Scrapear propiedades seleccionadas manualmente
  app.post('/api/scraping/scrape-selected', isAuthenticated, async (req: any, res) => {
    try {
      const { websiteId, selectedUrls } = req.body;
      const { webScrapingService } = await import('./services/webScrapingService');
      
      // Ejecutar scraping de URLs seleccionadas en background
      webScrapingService.scrapeSelectedProperties(websiteId, selectedUrls).catch(error => {
        console.error("Background scraping error:", error);
      });
      
      res.json({ message: `Scraping iniciado para ${selectedUrls.length} propiedades seleccionadas` });
    } catch (error) {
      console.error("Error starting selective scraping:", error);
      res.status(500).json({ message: "Error al iniciar scraping selectivo" });
    }
  });

  app.get('/api/scraping/search', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { query, filters } = req.query;
      const { webScrapingService } = await import('./services/webScrapingService');
      
      const properties = await webScrapingService.searchProperties(
        userId, 
        query as string || '', 
        filters ? JSON.parse(filters as string) : {}
      );
      
      res.json(properties);
    } catch (error) {
      console.error("Error searching scraped properties:", error);
      res.status(500).json({ message: "Error al buscar propiedades" });
    }
  });

  // Scraping Scheduler routes
  app.get('/api/scraping/scheduler/status', isAuthenticated, async (req: any, res) => {
    try {
      const { scrapingScheduler } = await import('./services/scrapingScheduler');
      const status = scrapingScheduler.getStatus();
      const stats = await scrapingScheduler.getStats();
      
      res.json({ ...status, ...stats });
    } catch (error) {
      console.error("Error getting scheduler status:", error);
      res.status(500).json({ message: "Error al obtener estado del scheduler" });
    }
  });

  app.post('/api/scraping/scheduler/manual/:websiteId', isAuthenticated, async (req: any, res) => {
    try {
      const { websiteId } = req.params;
      const { scrapingScheduler } = await import('./services/scrapingScheduler');
      
      const result = await scrapingScheduler.runManualScraping(websiteId);
      
      res.json({ message: result });
    } catch (error) {
      console.error("Error running manual scraping:", error);
      res.status(500).json({ message: "Error al ejecutar scraping manual" });
    }
  });

  app.post('/api/scraping/scheduler/cleanup', isAuthenticated, async (req: any, res) => {
    try {
      const { days } = req.body;
      const { scrapingScheduler } = await import('./services/scrapingScheduler');
      
      await scrapingScheduler.cleanupOldJobs(days || 30);
      
      res.json({ message: "Limpieza de trabajos antiguos completada" });
    } catch (error) {
      console.error("Error cleaning up old jobs:", error);
      res.status(500).json({ message: "Error al limpiar trabajos antiguos" });
    }
  });

  // Test route for settings page without auth
  app.get('/test-settings', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Configuración</title>
          <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; }
            .tab-button { padding: 12px 24px; border: 1px solid #e2e8f0; cursor: pointer; }
            .tab-button.active { background: #3b82f6; color: white; }
            .tab-content { display: none; padding: 24px; }
            .tab-content.active { display: block; }
            .form-group { margin-bottom: 16px; }
            .form-label { display: block; margin-bottom: 4px; font-weight: 500; }
            .form-input { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; }
            .switch { position: relative; width: 44px; height: 24px; background: #e2e8f0; border-radius: 12px; cursor: pointer; }
            .switch.on { background: #3b82f6; }
            .switch-thumb { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: transform 0.2s; }
            .switch.on .switch-thumb { transform: translateX(20px); }
          </style>
        </head>
        <body class="bg-gray-50">
          <div class="max-w-4xl mx-auto p-6">
            <h1 class="text-3xl font-bold mb-6">Configuración del Sistema</h1>
            
            <div class="bg-white rounded-lg shadow">
              <div class="flex border-b">
                <button class="tab-button active" onclick="showTab('whatsapp')">WhatsApp</button>
                <button class="tab-button" onclick="showTab('integrations')">Integraciones</button>
                <button class="tab-button" onclick="showTab('escalation')">Escalación</button>
              </div>
              
              <div id="whatsapp" class="tab-content active">
                <h2 class="text-xl font-semibold mb-4">Configuración de WhatsApp</h2>
                <p class="text-gray-600">Configura tu instancia de WhatsApp aquí.</p>
              </div>
              
              <div id="integrations" class="tab-content">
                <h2 class="text-xl font-semibold mb-6">Integraciones</h2>
                
                <div class="bg-white border rounded-lg p-6 mb-6">
                  <div class="flex items-center mb-4">
                    <h3 class="text-lg font-medium">AlterEstate CRM</h3>
                  </div>
                  
                  <div class="flex items-center justify-between mb-4">
                    <div>
                      <label class="form-label">Habilitar AlterEstate CRM</label>
                      <p class="text-sm text-gray-600">Conecta con tu CRM para búsquedas reales de propiedades</p>
                    </div>
                    <div class="switch" onclick="toggleSwitch(this)">
                      <div class="switch-thumb"></div>
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label">Token de API (Lectura)</label>
                    <input type="password" class="form-input" placeholder="Ingresa tu token de lectura de AlterEstate">
                    <p class="text-sm text-gray-600 mt-1">Token para consultar propiedades disponibles</p>
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label">API Key (Escritura)</label>
                    <input type="password" class="form-input" placeholder="Ingresa tu API Key de escritura">
                    <p class="text-sm text-gray-600 mt-1">API Key para crear leads automáticamente</p>
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label">ID de Empresa</label>
                    <input type="text" class="form-input" placeholder="Tu ID de empresa en AlterEstate">
                  </div>
                  
                  <button class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                    Probar Conexión con AlterEstate
                  </button>
                </div>
                
                <div class="bg-white border rounded-lg p-6">
                  <h3 class="text-lg font-medium mb-4">Integración de Calendario</h3>
                  
                  <div class="form-group">
                    <label class="form-label">ID de Google Calendar</label>
                    <input type="text" class="form-input" placeholder="tu-calendario@gmail.com">
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label">Nombre de usuario Cal.com</label>
                    <input type="text" class="form-input" placeholder="tu-usuario">
                  </div>
                </div>
              </div>
              
              <div id="escalation" class="tab-content">
                <h2 class="text-xl font-semibold mb-4">Escalación Humana</h2>
                <p class="text-gray-600">Configuración para atención humana.</p>
              </div>
            </div>
          </div>
          
          <script>
            function showTab(tabName) {
              // Hide all tabs
              const tabs = document.querySelectorAll('.tab-content');
              tabs.forEach(tab => tab.classList.remove('active'));
              
              // Remove active from all buttons
              const buttons = document.querySelectorAll('.tab-button');
              buttons.forEach(btn => btn.classList.remove('active'));
              
              // Show selected tab
              document.getElementById(tabName).classList.add('active');
              event.target.classList.add('active');
            }
            
            function toggleSwitch(switchEl) {
              switchEl.classList.toggle('on');
            }
          </script>
        </body>
      </html>
    `);
  });
  app.get('/api/whatsapp/test-ai', whatsappController.testAiResponse);

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

  // Manual Properties routes
  app.get('/api/manual-properties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const properties = await manualPropertyService.getUserProperties(userId);
      res.json(properties);
    } catch (error) {
      console.error("Error fetching manual properties:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  app.post('/api/manual-properties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const property = await manualPropertyService.createProperty(userId, req.body);
      res.status(201).json(property);
    } catch (error) {
      console.error("Error creating manual property:", error);
      res.status(500).json({ message: "Failed to create property" });
    }
  });

  app.get('/api/manual-properties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const property = await manualPropertyService.getProperty(userId, req.params.id);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      res.json(property);
    } catch (error) {
      console.error("Error fetching manual property:", error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  app.put('/api/manual-properties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const property = await manualPropertyService.updateProperty(userId, req.params.id, req.body);
      res.json(property);
    } catch (error) {
      console.error("Error updating manual property:", error);
      res.status(500).json({ message: "Failed to update property" });
    }
  });

  app.delete('/api/manual-properties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await manualPropertyService.deleteProperty(userId, req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting manual property:", error);
      res.status(500).json({ message: "Failed to delete property" });
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