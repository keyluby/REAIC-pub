import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { whatsappController } from "./controllers/whatsappController";
import { crmController } from "./controllers/crmController";
import { appointmentController } from "./controllers/appointmentController";
import { validateRequest } from "./middleware/validation";
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


  // Test AlterEstate read token only
  app.post('/api/test-alterestate-read-token', isAuthenticated, async (req: any, res) => {
    try {
      const { alterEstateToken } = req.body;
      
      if (!alterEstateToken) {
        return res.status(400).json({ 
          success: false, 
          message: "Token de lectura es requerido" 
        });
      }

      const { alterEstateService } = await import('./services/alterEstateService');
      
      try {
        console.log('🔐 [ALTERESTATE READ TEST] Testing read token...');
        
        const isTokenValid = await alterEstateService.validateToken(alterEstateToken);
        if (!isTokenValid) {
          return res.status(400).json({ 
            success: false, 
            message: "Token de lectura inválido" 
          });
        }

        const properties = await alterEstateService.searchProperties(alterEstateToken, {}, 1);
        if (properties.results.length === 0) {
          return res.json({
            success: true,
            message: "Token válido pero no hay propiedades disponibles",
            testResult: {
              status: "⚠️ Token válido pero no hay propiedades disponibles",
              details: "El token funciona correctamente, pero no se encontraron propiedades en el CRM.",
              totalProperties: 0
            }
          });
        }

        // Obtener configuración del usuario para URL del sitio web
        const userId = req.user.claims.sub;
        const userSettings = await storage.getUserSettings(userId);
        const userWebsiteUrl = userSettings?.realEstateWebsiteUrl || '';
        
        // Usar extracción automática completa con URL personalizada
        const completeProperty: any = await alterEstateService.getRandomPropertyComplete(alterEstateToken, userWebsiteUrl);
        
        if (!completeProperty) {
          return res.json({
            success: true,
            message: "Token válido pero no se encontraron propiedades completas",
            testResult: {
              status: "⚠️ Token válido - Sin propiedades detalladas disponibles",
              totalProperties: properties.count || 0
            }
          });
        }
        
        // DEBUG: Mostrar información cruda para debugging
        const propertyRawData = {
          slug: completeProperty.metadata?.slug || completeProperty.slug,
          title: completeProperty.basicInfo?.title || completeProperty.name || completeProperty.title,
          rawFieldsAll: Object.keys(completeProperty).map(key => `${key}: ${completeProperty[key]}`),
          totalFields: Object.keys(completeProperty).length,
          technicalDetailsExtracted: {
            area: completeProperty.technicalDetails?.area,
            rooms: completeProperty.technicalDetails?.rooms,
            bathrooms: completeProperty.technicalDetails?.bathrooms,
            parking: completeProperty.technicalDetails?.parking
          }
        };

        res.json({
          success: true,
          message: "Extracción automática completada exitosamente",
          testResult: {
            status: "✅ Propiedad extraída automáticamente",
            details: `Propiedad completa extraída: "${completeProperty.basicInfo?.title || completeProperty.name}"`,
            debugInfo: propertyRawData,
            propertyInfo: {
              // Información básica
              name: completeProperty.basicInfo?.title || completeProperty.name,
              description: completeProperty.basicInfo?.description || completeProperty.description,
              type: completeProperty.basicInfo?.type || completeProperty.property_type?.name,
              operation: completeProperty.basicInfo?.operation || completeProperty.operation,
              
              // Ubicación completa
              location: `${completeProperty.locationInfo?.neighborhood || ''} ${completeProperty.locationInfo?.city || ''}`.trim(),
              fullAddress: completeProperty.locationInfo?.address || completeProperty.address,
              province: completeProperty.locationInfo?.province || completeProperty.province,
              coordinates: completeProperty.locationInfo?.coordinates || {lat: null, lng: null},
              
              // Información comercial
              price: completeProperty.commercialInfo?.price || completeProperty.price_formatted,
              currency: completeProperty.commercialInfo?.currency || completeProperty.currency,
              status: completeProperty.commercialInfo?.status || completeProperty.status,
              publishedDate: completeProperty.commercialInfo?.publishedDate || completeProperty.created_at,
              
              // Detalles técnicos
              area: completeProperty.technicalDetails?.area || 'No especificado',
              rooms: `${completeProperty.technicalDetails?.rooms || 0} habitaciones`,
              bathrooms: `${completeProperty.technicalDetails?.bathrooms || 0} baños`,
              parking: `${completeProperty.technicalDetails.parking} estacionamientos`,
              features: completeProperty.technicalDetails.features,
              amenities: completeProperty.technicalDetails.amenities,
              
              // Contenido multimedia
              images: completeProperty.multimedia.images,
              featuredImage: completeProperty.multimedia.featuredImage,
              totalImages: completeProperty.multimedia.images.length.toString(),
              videos: completeProperty.multimedia.videos,
              virtualTour: completeProperty.multimedia.virtualTour,
              
              // Enlaces
              propertyUrl: completeProperty.links.propertyUrl,
              directUrl: completeProperty.links.directUrl,
              
              // Información del agente
              agent: completeProperty.agent,
              
              // Metadata
              id: completeProperty.metadata.id,
              uid: completeProperty.metadata.uid,
              slug: completeProperty.metadata.slug,
              views: completeProperty.metadata.views,
              lastUpdated: completeProperty.metadata.lastUpdated
            },
            totalProperties: properties.count || 0
          }
        });
      } catch (error) {
        console.error('❌ [ALTERESTATE READ TEST] Failed:', error);
        res.status(500).json({
          success: false,
          message: "Error al probar token de lectura: " + (error instanceof Error ? error.message : 'Error desconocido')
        });
      }
    } catch (error) {
      console.error("Error testing read token:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error al ejecutar prueba de lectura: " + (error instanceof Error ? error.message : 'Error desconocido')
      });
    }
  });

  // Test AlterEstate API key only
  app.post('/api/test-alterestate-api-key', isAuthenticated, async (req: any, res) => {
    try {
      const { alterEstateApiKey } = req.body;
      
      if (!alterEstateApiKey) {
        return res.status(400).json({ 
          success: false, 
          message: "API Key de escritura es requerida" 
        });
      }

      const { alterEstateService } = await import('./services/alterEstateService');
      
      try {
        console.log('🔑 [ALTERESTATE API KEY TEST] Testing API key with lead creation/deletion...');
        
        const testLeadData = {
          full_name: "PRUEBA - Test Connection",
          phone: "+1809123456789",
          email: "test.connection@alterestate.test",
          notes: "Lead de prueba creado automáticamente para validar API Key - ELIMINAR",
          via: "WhatsApp AI Test"
        };

        const createResult = await alterEstateService.createLead(alterEstateApiKey, testLeadData);
        
        // Handle successful lead creation (status 201) or duplicate (status 200)
        if (createResult.status === 201 || createResult.status === 200) {
          const leadId = createResult.data?.data?.uid || createResult.data?.uid || createResult.data?.id;
          console.log(`✅ [ALTERESTATE API KEY TEST] Test lead created: ${leadId}`);
          
          const deleteSuccess = await alterEstateService.deleteLead(alterEstateApiKey, leadId);
          
          if (deleteSuccess) {
            res.json({
              success: true,
              message: "Prueba de API Key completada exitosamente",
              testResult: {
                status: "✅ API Key de escritura funcionando perfectamente",
                details: "Lead de prueba creado y eliminado exitosamente",
                leadInfo: {
                  id: leadId,
                  name: testLeadData.full_name,
                  phone: testLeadData.phone,
                  email: testLeadData.email,
                  created: "✅ Creado exitosamente",
                  deleted: "✅ Eliminado exitosamente"
                }
              }
            });
          } else {
            res.json({
              success: false,
              message: "API Key funciona parcialmente",
              testResult: {
                status: "⚠️ API Key funciona parcialmente",
                details: "Se pudo crear el lead pero no eliminarlo automáticamente",
                leadInfo: {
                  id: leadId,
                  name: testLeadData.full_name,
                  phone: testLeadData.phone,
                  email: testLeadData.email,
                  created: "✅ Creado exitosamente",
                  deleted: "❌ Eliminación falló - eliminar manualmente",
                  warning: `Por favor elimina manualmente el lead: ${leadId}`
                }
              }
            });
          }
        } else {
          res.status(400).json({
            success: false,
            message: "API Key de escritura inválida",
            testResult: {
              status: "❌ API Key de escritura inválida",
              details: "No se pudo crear el lead de prueba",
              error: createResult.message || 'Error desconocido en la creación'
            }
          });
        }
      } catch (error) {
        console.error('❌ [ALTERESTATE API KEY TEST] Failed:', error);
        res.status(500).json({
          success: false,
          message: "Error al probar API Key de escritura: " + (error instanceof Error ? error.message : 'Error desconocido')
        });
      }
    } catch (error) {
      console.error("Error testing API key:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error al ejecutar prueba de API Key: " + (error instanceof Error ? error.message : 'Error desconocido')
      });
    }
  });

  // Test AlterEstate connection with detailed validation (legacy)
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
      
      const testResults = {
        readToken: null as any,
        apiKey: null as any,
        companyId: alterEstateCompanyId ? `✅ ID de empresa: ${alterEstateCompanyId}` : "⚠️ ID de empresa no configurado"
      };

      // 1. TEST READ TOKEN - Get random property with complete details
      try {
        console.log('🔐 [ALTERESTATE TEST] Testing read token...');
        
        // First validate token
        const isTokenValid = await alterEstateService.validateToken(alterEstateToken);
        if (!isTokenValid) {
          return res.status(400).json({ 
            success: false, 
            message: "Token de lectura inválido" 
          });
        }

        // Get properties and select one random property for detailed test
        const properties = await alterEstateService.searchProperties(alterEstateToken, {}, 1);
        if (properties.results.length === 0) {
          testResults.readToken = {
            status: "⚠️ Token válido pero no hay propiedades disponibles",
            details: "El token funciona correctamente, pero no se encontraron propiedades en el CRM."
          };
        } else {
          // Get random property details
          const randomProperty = properties.results[Math.floor(Math.random() * Math.min(properties.results.length, 5))];
          const propertyDetail = await alterEstateService.getPropertyDetail(alterEstateToken, randomProperty.slug);
          
          // Count media files
          const images = propertyDetail.gallery_image?.length || 0;
          const hasVirtualTour = !!propertyDetail.virtual_tour;
          
          testResults.readToken = {
            status: "✅ Token de lectura funcionando perfectamente",
            details: `Probado con propiedad: "${propertyDetail.name}"`,
            propertyInfo: {
              name: propertyDetail.name,
              location: `${propertyDetail.sector}, ${propertyDetail.city}`,
              price: propertyDetail.sale_price ? `${propertyDetail.currency_sale} ${propertyDetail.sale_price.toLocaleString()}` : 'Precio a consultar',
              type: propertyDetail.category.name,
              rooms: propertyDetail.room || 'N/A',
              bathrooms: propertyDetail.bathroom || 'N/A',
              area: propertyDetail.property_area ? `${propertyDetail.property_area} m²` : 'N/A',
              images: `${images} foto${images !== 1 ? 's' : ''}`,
              virtualTour: hasVirtualTour ? 'Sí' : 'No',
              agents: propertyDetail.agents?.length || 0
            },
            totalProperties: properties.count
          };
        }
      } catch (error) {
        console.error('❌ [ALTERESTATE TEST] Read token test failed:', error);
        testResults.readToken = {
          status: "❌ Error al probar token de lectura",
          details: error instanceof Error ? error.message : 'Error desconocido'
        };
      }

      // 2. TEST API KEY - Create and delete test lead
      if (alterEstateApiKey) {
        try {
          console.log('🔑 [ALTERESTATE TEST] Testing API key with lead creation/deletion...');
          
          // Create test lead
          const testLeadData = {
            full_name: "PRUEBA - Test Connection",
            phone: "+1809123456789",
            email: "test.connection@alterestate.test",
            notes: "Lead de prueba creado automáticamente para validar API Key - ELIMINAR",
            via: "WhatsApp AI Test"
          };

          const createResult = await alterEstateService.createLead(alterEstateApiKey, testLeadData);
          
          if (createResult.status === 200 && createResult.data?.uid) {
            // Lead created successfully, now try to delete it
            const leadId = createResult.data.uid;
            console.log(`✅ [ALTERESTATE TEST] Test lead created: ${leadId}`);
            
            // Attempt to delete the test lead
            const deleteSuccess = await alterEstateService.deleteLead(alterEstateApiKey, leadId);
            
            if (deleteSuccess) {
              testResults.apiKey = {
                status: "✅ API Key de escritura funcionando perfectamente",
                details: "Lead de prueba creado y eliminado exitosamente",
                operations: {
                  create: "✅ Creación de leads funcional",
                  delete: "✅ Eliminación de leads funcional",
                  testLeadId: leadId
                }
              };
            } else {
              testResults.apiKey = {
                status: "⚠️ API Key funciona parcialmente",
                details: "Se pudo crear el lead pero no eliminarlo automáticamente",
                operations: {
                  create: "✅ Creación de leads funcional",
                  delete: "❌ Eliminación falló - eliminar manualmente",
                  testLeadId: leadId,
                  warning: `Por favor elimina manualmente el lead de prueba: ${leadId}`
                }
              };
            }
          } else {
            testResults.apiKey = {
              status: "❌ API Key de escritura inválida",
              details: "No se pudo crear el lead de prueba",
              error: createResult.message || 'Error desconocido en la creación'
            };
          }
        } catch (error) {
          console.error('❌ [ALTERESTATE TEST] API key test failed:', error);
          testResults.apiKey = {
            status: "❌ Error al probar API Key de escritura",
            details: error instanceof Error ? error.message : 'Error desconocido'
          };
        }
      } else {
        testResults.apiKey = {
          status: "⚠️ API Key no proporcionada",
          details: "No se puede probar funcionalidad de escritura sin API Key"
        };
      }

      res.json({
        success: true,
        message: "Pruebas de conexión completadas",
        testResults
      });
      
    } catch (error) {
      console.error("Error testing AlterEstate connection:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error al ejecutar pruebas de conexión: " + (error instanceof Error ? error.message : 'Error desconocido')
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