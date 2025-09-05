import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/Layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import WhatsAppConnection from "@/components/WhatsApp/WhatsAppConnection";
import { Settings, Bot, Smartphone, Building, Bell, Save, MessageCircle, User, Phone, Mail, RotateCcw, Upload, Link, Database } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    assistantName: '',
    assistantPersonality: '',
    systemPrompt: '',
    language: 'es',
    timezone: 'America/New_York',
    
    // AI Training
    trainingEnabled: false,
    trainingUrls: [] as string[],
    trainingDocs: [] as string[],
    
    // Database integration
    databaseType: '',
    sqlConnectionString: '',
    airtableApiKey: '',
    airtableBaseId: '',
    googleSheetsId: '',
    databaseInstructions: '',
    
    // Configuraciones avanzadas de mensajería
    messageBufferEnabled: true,
    messageBufferTime: 5,
    humanizedResponsesEnabled: true,
    messagingInterval: 2,
    maxMessagesPerResponse: 4,
    humanEscalationEnabled: true,
    notificationMethod: 'Email y WhatsApp',
    notificationEmail: '',
    notificationWhatsApp: '',
    
    
    // AlterEstate CRM
    alterEstateEnabled: false,
    alterEstateToken: '',
    alterEstateApiKey: '',
    alterEstateCompanyId: '',
    realEstateWebsiteUrl: '',
    
    // Legacy fields
    bufferTime: 10,
    maxMessageChunks: 3,
    messageDelay: 2,
    humanizeResponses: true,
    googleCalendarId: '',
    calComUsername: '',
    emailNotifications: true,
    whatsappNotifications: false,
  });

  // State for AlterEstate connection test
  const [connectionTest, setConnectionTest] = useState<{
    isLoading: boolean;
    result: any;
    hasError: boolean;
  }>({
    isLoading: false,
    result: null,
    hasError: false
  });

  const [readTokenTest, setReadTokenTest] = useState<{
    isLoading: boolean;
    result: any;
    hasError: boolean;
  }>({
    isLoading: false,
    result: null,
    hasError: false
  });

  const [apiKeyTest, setApiKeyTest] = useState<{
    isLoading: boolean;
    result: any;
    hasError: boolean;
  }>({
    isLoading: false,
    result: null,
    hasError: false
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (settings && typeof settings === 'object') {
      setFormData({
        assistantName: (settings as any).assistantName || 'Asistente IA',
        assistantPersonality: (settings as any).assistantPersonality || '',
        systemPrompt: (settings as any).systemPrompt || '',
        language: (settings as any).language || 'es',
        timezone: (settings as any).timezone || 'America/New_York',
        
        // AI Training
        trainingEnabled: (settings as any).trainingEnabled ?? false,
        trainingUrls: Array.isArray((settings as any).trainingUrls) ? (settings as any).trainingUrls : [],
        trainingDocs: Array.isArray((settings as any).trainingDocs) ? (settings as any).trainingDocs : [],
        
        // Database integration
        databaseType: (settings as any).databaseType || '',
        sqlConnectionString: (settings as any).sqlConnectionString || '',
        airtableApiKey: (settings as any).airtableApiKey || '',
        airtableBaseId: (settings as any).airtableBaseId || '',
        googleSheetsId: (settings as any).googleSheetsId || '',
        databaseInstructions: (settings as any).databaseInstructions || '',
        
        // Configuraciones avanzadas
        messageBufferEnabled: (settings as any).messageBufferEnabled ?? true,
        messageBufferTime: (settings as any).messageBufferTime || 5,
        humanizedResponsesEnabled: (settings as any).humanizedResponsesEnabled ?? true,
        messagingInterval: (settings as any).messagingInterval || 2,
        maxMessagesPerResponse: (settings as any).maxMessagesPerResponse || 4,
        humanEscalationEnabled: (settings as any).humanEscalationEnabled ?? true,
        notificationMethod: (settings as any).notificationMethod || 'Email y WhatsApp',
        notificationEmail: (settings as any).notificationEmail || '',
        notificationWhatsApp: (settings as any).notificationWhatsApp || '',
        
        
        // AlterEstate CRM
        alterEstateEnabled: (settings as any).alterEstateEnabled ?? false,
        alterEstateToken: (settings as any).alterEstateToken || '',
        alterEstateApiKey: (settings as any).alterEstateApiKey || '',
        alterEstateCompanyId: (settings as any).alterEstateCompanyId || '',
        realEstateWebsiteUrl: (settings as any).realEstateWebsiteUrl || '',
        
        // Legacy fields
        bufferTime: (settings as any).bufferTime || 10,
        maxMessageChunks: (settings as any).maxMessageChunks || 3,
        messageDelay: (settings as any).messageDelay || 2,
        humanizeResponses: (settings as any).humanizeResponses ?? true,
        googleCalendarId: (settings as any).googleCalendarId || '',
        calComUsername: (settings as any).calComUsername || '',
        emailNotifications: (settings as any).emailNotifications ?? true,
        whatsappNotifications: (settings as any).whatsappNotifications ?? false,
      });
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/settings', data);
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettingsMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Test AlterEstate read token only
  const testReadToken = async () => {
    if (!formData.alterEstateToken.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa el Token de API antes de probar",
        variant: "destructive",
      });
      return;
    }

    setReadTokenTest({ isLoading: true, result: null, hasError: false });

    try {
      const response = await apiRequest('POST', '/api/test-alterestate-read-token', {
        alterEstateToken: formData.alterEstateToken
      });

      setReadTokenTest({ 
        isLoading: false, 
        result: response, 
        hasError: false 
      });

      toast({
        title: "Prueba de Lectura Exitosa",
        description: "El token funciona correctamente",
      });

    } catch (error: any) {
      console.error('Error testing read token:', error);
      
      setReadTokenTest({ 
        isLoading: false, 
        result: error.response?.data || { message: 'Error de conexión' }, 
        hasError: true 
      });

      toast({
        title: "Error en Token de Lectura",
        description: error.response?.data?.message || "El token no es válido",
        variant: "destructive",
      });
    }
  };

  // Test AlterEstate API key only
  const testApiKey = async () => {
    if (!formData.alterEstateApiKey.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa la API Key antes de probar",
        variant: "destructive",
      });
      return;
    }

    setApiKeyTest({ isLoading: true, result: null, hasError: false });

    try {
      const response = await apiRequest('POST', '/api/test-alterestate-api-key', {
        alterEstateApiKey: formData.alterEstateApiKey
      });

      setApiKeyTest({ 
        isLoading: false, 
        result: response, 
        hasError: false 
      });

      toast({
        title: "Prueba de API Key Exitosa",
        description: "La API Key funciona correctamente",
      });

    } catch (error: any) {
      console.error('Error testing API key:', error);
      
      setApiKeyTest({ 
        isLoading: false, 
        result: error.response?.data || { message: 'Error de conexión' }, 
        hasError: true 
      });

      toast({
        title: "Error en API Key",
        description: error.response?.data?.message || "La API Key no es válida",
        variant: "destructive",
      });
    }
  };

  // Test AlterEstate connection (legacy)
  const testAlterEstateConnection = async () => {
    if (!formData.alterEstateToken.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa el Token de API antes de probar la conexión",
        variant: "destructive",
      });
      return;
    }

    setConnectionTest({ isLoading: true, result: null, hasError: false });

    try {
      const response = await apiRequest('POST', '/api/test-alterestate-connection', {
        alterEstateToken: formData.alterEstateToken,
        alterEstateApiKey: formData.alterEstateApiKey,
        alterEstateCompanyId: formData.alterEstateCompanyId
      });

      setConnectionTest({ 
        isLoading: false, 
        result: response, 
        hasError: false 
      });

      toast({
        title: "Conexión Exitosa",
        description: "Las credenciales de AlterEstate son válidas",
      });

    } catch (error: any) {
      console.error('Error testing connection:', error);
      
      setConnectionTest({ 
        isLoading: false, 
        result: error.response?.data || { message: 'Error de conexión' }, 
        hasError: true 
      });

      toast({
        title: "Error de Conexión",
        description: error.response?.data?.message || "No se pudo conectar con AlterEstate",
        variant: "destructive",
      });
    }
  };

  if (isLoading || settingsLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <MainLayout>
      <div className="flex h-full bg-background">
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-2xl font-semibold mb-2 text-foreground">Configuración</h2>
            <p className="text-muted-foreground">
              Configura tu asistente de IA, integraciones y preferencias
            </p>
          </div>

        <Tabs defaultValue="assistant" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="assistant" data-testid="tab-assistant">
              <Bot className="w-4 h-4 mr-2" />
              Asistente IA
            </TabsTrigger>
            <TabsTrigger value="messaging" data-testid="tab-messaging">
              <MessageCircle className="w-4 h-4 mr-2" />
              Mensajería
            </TabsTrigger>
            <TabsTrigger value="whatsapp" data-testid="tab-whatsapp">
              <Smartphone className="w-4 h-4 mr-2" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <Building className="w-4 h-4 mr-2" />
              Integraciones
            </TabsTrigger>
            <TabsTrigger value="escalation" data-testid="tab-escalation">
              <Bell className="w-4 h-4 mr-2" />
              Escalación
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit}>
            <TabsContent value="assistant" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuración del Asistente IA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="assistantName">Nombre del Asistente</Label>
                      <Input
                        id="assistantName"
                        value={formData.assistantName}
                        onChange={(e) => handleInputChange('assistantName', e.target.value)}
                        placeholder="ej. María, Carlos, Asistente"
                        data-testid="input-assistant-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="language">Idioma</Label>
                      <select
                        id="language"
                        value={formData.language}
                        onChange={(e) => handleInputChange('language', e.target.value)}
                        className="w-full p-2 border border-border rounded-md bg-background"
                        data-testid="select-language"
                      >
                        <option value="es">Español</option>
                        <option value="en">Inglés</option>
                        <option value="pt">Portugués</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="assistantPersonality">Personalidad del Asistente</Label>
                    <Textarea
                      id="assistantPersonality"
                      value={formData.assistantPersonality}
                      onChange={(e) => handleInputChange('assistantPersonality', e.target.value)}
                      placeholder="Describe la personalidad y tono que quieres que tenga tu asistente..."
                      rows={3}
                      data-testid="textarea-assistant-personality"
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="systemPrompt">Instrucciones del Sistema (Opcional)</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleInputChange('systemPrompt', '')}
                        data-testid="button-reset-prompt"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restablecer
                      </Button>
                    </div>
                    <Textarea
                      id="systemPrompt"
                      value={formData.systemPrompt}
                      onChange={(e) => handleInputChange('systemPrompt', e.target.value)}
                      placeholder="Si deseas personalizar completamente las instrucciones del asistente, puedes escribirlas aquí. Si está vacío, se usarán las instrucciones predeterminadas..."
                      rows={8}
                      data-testid="textarea-system-prompt"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      💡 Deja este campo vacío para usar las instrucciones optimizadas por defecto
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messaging" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>▟️ Mensajería</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="messageBufferEnabled">Buffer de mensajes salientes</Label>
                      <p className="text-sm text-muted-foreground">
                        Agrupa múltiples mensajes consecutivos antes de enviarlos
                      </p>
                    </div>
                    <Switch
                      id="messageBufferEnabled"
                      checked={formData.messageBufferEnabled}
                      onCheckedChange={(checked) => handleInputChange('messageBufferEnabled', checked)}
                      data-testid="switch-message-buffer"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="messageBufferTime">Tiempo de espera del buffer (segundos)</Label>
                    <div className="flex items-center space-x-4 mt-2">
                      <Input
                        id="messageBufferTime"
                        type="number"
                        min="3"
                        max="30"
                        value={formData.messageBufferTime}
                        onChange={(e) => handleInputChange('messageBufferTime', parseInt(e.target.value))}
                        className="w-20"
                        data-testid="input-buffer-time"
                      />
                      <p className="text-sm text-muted-foreground">
                        Los mensajes se agruparán durante este tiempo antes de enviarios. Mínimo 3 segundos, máximo 30 segundos.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>🤖 Respuestas Humanizadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="humanizedResponsesEnabled">Respuestas humanizadas</Label>
                      <p className="text-sm text-muted-foreground">
                        Divide las respuestas largas (&gt;500 caracteres) en múltiples mensajes para simular conversación humana
                      </p>
                    </div>
                    <Switch
                      id="humanizedResponsesEnabled"
                      checked={formData.humanizedResponsesEnabled}
                      onCheckedChange={(checked) => handleInputChange('humanizedResponsesEnabled', checked)}
                      data-testid="switch-humanized-responses"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="messagingInterval">Intervalo entre mensajes (segundos)</Label>
                    <div className="flex items-center space-x-4 mt-2">
                      <Input
                        id="messagingInterval"
                        type="number"
                        min="1"
                        max="10"
                        value={formData.messagingInterval}
                        onChange={(e) => handleInputChange('messagingInterval', parseInt(e.target.value))}
                        className="w-20"
                        data-testid="input-messaging-interval"
                      />
                      <p className="text-sm text-muted-foreground">
                        Tiempo de espera entre cada mensaje para simular escritura humana. Mínimo 1 segundo, máximo 10 segundos.
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="maxMessagesPerResponse">Máximo de mensajes por respuesta</Label>
                    <div className="flex items-center space-x-4 mt-2">
                      <Input
                        id="maxMessagesPerResponse"
                        type="number"
                        min="1"
                        max="6"
                        value={formData.maxMessagesPerResponse}
                        onChange={(e) => handleInputChange('maxMessagesPerResponse', parseInt(e.target.value))}
                        className="w-20"
                        data-testid="input-max-messages"
                      />
                      <p className="text-sm text-muted-foreground">
                        Número máximo de mensajes en que se puede dividir una respuesta. Mínimo 1, máximo 6 mensajes.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-6">
              <WhatsAppConnection />
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6">
              {/* AlterEstate CRM Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Building className="w-5 h-5 mr-2" />
                    AlterEstate CRM
                  </CardTitle>
                  <div className="text-sm text-muted-foreground mt-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">📋 Cómo obtener tus credenciales:</p>
                    <div className="space-y-1 text-blue-800 dark:text-blue-200">
                      <p>1. Ve a <a href="https://dev.alterestate.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">dev.alterestate.com</a> para acceder al portal de desarrolladores</p>
                      <p>2. Sigue la sección "Getting Started" para obtener tus credenciales API</p>
                      <p>3. Si necesitas ayuda, contacta a: <a href="mailto:engineering@alterestate.com" className="underline font-medium">engineering@alterestate.com</a></p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="alterEstateEnabled">Habilitar AlterEstate CRM</Label>
                        {connectionTest.result && !connectionTest.hasError && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                            Conectado
                          </Badge>
                        )}
                        {connectionTest.result && connectionTest.hasError && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                            <span className="w-2 h-2 bg-red-500 rounded-full mr-1"></span>
                            Error
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Conecta con tu CRM para búsquedas reales de propiedades y creación automática de leads
                      </p>
                    </div>
                    <Switch
                      id="alterEstateEnabled"
                      checked={formData.alterEstateEnabled}
                      onCheckedChange={(checked) => handleInputChange('alterEstateEnabled', checked)}
                      data-testid="switch-alterestate-enabled"
                    />
                  </div>
                  
                  {formData.alterEstateEnabled && (
                    <>
                      <div>
                        <Label htmlFor="alterEstateToken">Token de API (Lectura)</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="alterEstateToken"
                            type="password"
                            value={formData.alterEstateToken}
                            onChange={(e) => handleInputChange('alterEstateToken', e.target.value)}
                            placeholder="Ingresa tu token de lectura de AlterEstate"
                            data-testid="input-alterestate-token"
                            className="flex-1"
                          />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => testReadToken()}
                            disabled={readTokenTest.isLoading || !formData.alterEstateToken.trim()}
                            data-testid="button-test-read-token"
                            className="shrink-0"
                          >
                            {readTokenTest.isLoading ? (
                              <>
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1"></div>
                                Probando...
                              </>
                            ) : (
                              <>
                                <span className="mr-1">🔍</span>
                                Probar
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Token para consultar propiedades. Obtener en: <a href="https://dev.alterestate.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">dev.alterestate.com</a>
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="alterEstateApiKey">API Key (Escritura)</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="alterEstateApiKey"
                            type="password"
                            value={formData.alterEstateApiKey}
                            onChange={(e) => handleInputChange('alterEstateApiKey', e.target.value)}
                            placeholder="Ingresa tu API Key de escritura"
                            data-testid="input-alterestate-apikey"
                            className="flex-1"
                          />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => testApiKey()}
                            disabled={apiKeyTest.isLoading || !formData.alterEstateApiKey.trim()}
                            data-testid="button-test-api-key"
                            className="shrink-0"
                          >
                            {apiKeyTest.isLoading ? (
                              <>
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1"></div>
                                Probando...
                              </>
                            ) : (
                              <>
                                <span className="mr-1">🔑</span>
                                Probar
                              </>
                            )}
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          API Key para crear leads automáticamente. Contactar: <a href="mailto:engineering@alterestate.com" className="text-blue-600 hover:underline">engineering@alterestate.com</a>
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="alterEstateCompanyId">ID de Empresa</Label>
                        <Input
                          id="alterEstateCompanyId"
                          value={formData.alterEstateCompanyId}
                          onChange={(e) => handleInputChange('alterEstateCompanyId', e.target.value)}
                          placeholder="Tu ID de empresa en AlterEstate"
                          data-testid="input-alterestate-company"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          Identificador único de tu empresa en la plataforma AlterEstate
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="realEstateWebsiteUrl">URL de tu Página Web <span className="text-red-500">*</span></Label>
                        <Input
                          id="realEstateWebsiteUrl"
                          value={formData.realEstateWebsiteUrl}
                          onChange={(e) => handleInputChange('realEstateWebsiteUrl', e.target.value)}
                          placeholder="https://tuinmobiliaria.com"
                          data-testid="input-real-estate-website"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          <span className="font-medium text-amber-600">📋 Importante:</span> URL base donde tienes publicadas las propiedades. Se usa para generar enlaces directos usando el slug de AlterEstate.
                          <br />Ejemplo: <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">https://tuinmobiliaria.com</span>
                        </p>
                      </div>
                    </>
                  )}

                  {/* Connection Test Results - Always visible when there are results */}
                  {connectionTest.result && (
                    <div className={`mt-6 border rounded-lg ${
                      connectionTest.hasError 
                        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' 
                        : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
                    }`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <div className={`w-5 h-5 mt-1 ${
                              connectionTest.hasError ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {connectionTest.hasError ? '❌' : '✅'}
                            </div>
                            <div className="flex-1">
                                <p className={`font-medium ${
                                  connectionTest.hasError ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'
                                }`}>
                                  {connectionTest.result.message}
                                </p>
                                
                                {/* Enhanced test results display */}
                                {connectionTest.result.testResults && !connectionTest.hasError && (
                                  <div className="mt-3 space-y-4">
                                    {/* Read Token Test Results */}
                                    <div className="border-l-4 border-blue-400 pl-3">
                                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                                        🔐 Token de Lectura
                                      </h4>
                                      <p className="text-sm mb-2">
                                        {connectionTest.result.testResults.readToken?.status}
                                      </p>
                                      {connectionTest.result.testResults.readToken?.propertyInfo && (
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-xs space-y-1">
                                          <p><strong>Propiedad de prueba:</strong> {connectionTest.result.testResults.readToken.propertyInfo.name}</p>
                                          <p><strong>Ubicación:</strong> {connectionTest.result.testResults.readToken.propertyInfo.location}</p>
                                          <p><strong>Precio:</strong> {connectionTest.result.testResults.readToken.propertyInfo.price}</p>
                                          <p><strong>Tipo:</strong> {connectionTest.result.testResults.readToken.propertyInfo.type}</p>
                                          <div className="grid grid-cols-2 gap-2 pt-1">
                                            <span>🛏️ {connectionTest.result.testResults.readToken.propertyInfo.rooms} hab</span>
                                            <span>🚿 {connectionTest.result.testResults.readToken.propertyInfo.bathrooms} baños</span>
                                            <span>📐 {connectionTest.result.testResults.readToken.propertyInfo.area}</span>
                                            <span>📸 {connectionTest.result.testResults.readToken.propertyInfo.images}</span>
                                          </div>
                                          <p className="pt-1"><strong>Total propiedades disponibles:</strong> {connectionTest.result.testResults.readToken.totalProperties}</p>
                                        </div>
                                      )}
                                    </div>

                                    {/* API Key Test Results */}
                                    <div className="border-l-4 border-purple-400 pl-3">
                                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                                        🔑 API Key de Escritura
                                      </h4>
                                      <p className="text-sm mb-2">
                                        {connectionTest.result.testResults.apiKey?.status}
                                      </p>
                                      {connectionTest.result.testResults.apiKey?.operations && (
                                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-xs space-y-1">
                                          <p>{connectionTest.result.testResults.apiKey.operations.create}</p>
                                          <p>{connectionTest.result.testResults.apiKey.operations.delete}</p>
                                          {connectionTest.result.testResults.apiKey.operations.warning && (
                                            <p className="text-orange-600 dark:text-orange-400 font-medium">
                                              ⚠️ {connectionTest.result.testResults.apiKey.operations.warning}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                      {connectionTest.result.testResults.apiKey?.details && !connectionTest.result.testResults.apiKey?.operations && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400">
                                          {connectionTest.result.testResults.apiKey.details}
                                        </p>
                                      )}
                                    </div>

                                    {/* Company ID */}
                                    <div className="border-l-4 border-gray-400 pl-3">
                                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                                        🏢 ID de Empresa
                                      </h4>
                                      <p className="text-sm">
                                        {connectionTest.result.testResults.companyId}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Legacy support for old response format */}
                                {connectionTest.result.details && !connectionTest.result.testResults && !connectionTest.hasError && (
                                  <div className="mt-2 space-y-1 text-sm text-green-700 dark:text-green-300">
                                    {Object.entries(connectionTest.result.details).map(([key, value]) => (
                                      <div key={key} className="flex items-center">
                                        <span>{value as string}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost" 
                            size="sm"
                            onClick={() => setConnectionTest({ isLoading: false, result: null, hasError: false })}
                            className="text-xs p-1 h-6 w-6"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>

              {/* Calendar Integration Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Building className="w-5 h-5 mr-2" />
                    Integración de Calendario
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="googleCalendarId">ID de Google Calendar</Label>
                    <Input
                      id="googleCalendarId"
                      value={formData.googleCalendarId}
                      onChange={(e) => handleInputChange('googleCalendarId', e.target.value)}
                      placeholder="tu-calendario@gmail.com"
                      data-testid="input-google-calendar"
                    />
                  </div>
                  <div>
                    <Label htmlFor="calComUsername">Nombre de usuario Cal.com</Label>
                    <Input
                      id="calComUsername"
                      value={formData.calComUsername}
                      onChange={(e) => handleInputChange('calComUsername', e.target.value)}
                      placeholder="tu-usuario"
                      data-testid="input-calcom-username"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="escalation" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>👥 Escalación Humana</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="humanEscalationEnabled">Habilitar Escalación Humana</Label>
                      <p className="text-sm text-muted-foreground">
                        Permitir solicitudes de atención humana
                      </p>
                    </div>
                    <Switch
                      id="humanEscalationEnabled"
                      checked={formData.humanEscalationEnabled}
                      onCheckedChange={(checked) => handleInputChange('humanEscalationEnabled', checked)}
                      data-testid="switch-human-escalation"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="notificationMethod">Método de Notificación</Label>
                    <Select 
                      value={formData.notificationMethod} 
                      onValueChange={(value) => handleInputChange('notificationMethod', value)}
                    >
                      <SelectTrigger className="w-full" data-testid="select-notification-method">
                        <SelectValue placeholder="Selecciona el método" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Email y WhatsApp">Email y WhatsApp</SelectItem>
                        <SelectItem value="Email">Solo Email</SelectItem>
                        <SelectItem value="WhatsApp">Solo WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="notificationEmail">Email de Notificación</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="notificationEmail"
                        type="email"
                        value={formData.notificationEmail}
                        onChange={(e) => handleInputChange('notificationEmail', e.target.value)}
                        placeholder="email@empresa.com"
                        className="pl-10"
                        data-testid="input-notification-email"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Recibirás un email cada vez que un usuario solicite hablar con un humano.
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="notificationWhatsApp">Número de WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="notificationWhatsApp"
                        value={formData.notificationWhatsApp}
                        onChange={(e) => handleInputChange('notificationWhatsApp', e.target.value)}
                        placeholder="+521234567890"
                        className="pl-10"
                        data-testid="input-notification-whatsapp"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Incluye el código de país. Ej: +52 para México, +34 para España.
                    </p>
                    
                    <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-start space-x-3">
                        <User className="w-5 h-5 text-primary mt-1" />
                        <div>
                          <p className="text-sm font-medium">Cuando un usuario solicite hablar con un humano, recibirás una notificación inmediata por el método seleccionado con los datos del cliente.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={updateSettingsMutation.isPending}
                data-testid="button-save-settings"
              >
                {updateSettingsMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Configuración
                  </>
                )}
              </Button>
            </div>
          </form>
        </Tabs>
        </div>

        {/* Right Status Panel */}
        <div className="w-80 border-l border-border bg-muted/10">
          <div className="p-4 h-full overflow-auto">
            <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
              Estado de Conexión
            </h3>
            
            {/* Read Token Status */}
            {readTokenTest.result && (
              <div className="mb-6">
                <div className={`p-4 rounded-lg border-2 ${
                  readTokenTest.hasError 
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/20' 
                    : 'border-green-500 bg-green-50 dark:bg-green-950/20'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {readTokenTest.hasError ? (
                        <div className="flex items-center text-red-700 dark:text-red-300">
                          <span className="text-2xl mr-2">❌</span>
                          <span className="font-bold">No funciona</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-green-700 dark:text-green-300">
                          <span className="text-2xl mr-2">✅</span>
                          <span className="font-bold">Funciona</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReadTokenTest({ isLoading: false, result: null, hasError: false })}
                      className="h-6 w-6 p-0"
                    >
                      ×
                    </Button>
                  </div>
                  
                  <h4 className="font-medium text-sm mb-2">🔐 API de Lectura</h4>
                  
                  {!readTokenTest.hasError && readTokenTest.result?.testResult && (
                    <div className="space-y-4">
                      {/* Estado de extracción automática */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="flex items-center text-blue-800 dark:text-blue-200">
                          <span className="mr-2">✨</span>
                          <div className="text-sm font-medium">{readTokenTest.result.testResult.status || 'Extracción automática completada'}</div>
                        </div>
                        {readTokenTest.result.testResult.details && (
                          <div className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                            {readTokenTest.result.testResult.details}
                          </div>
                        )}
                      </div>
                      
                      {/* Propiedad extraída automáticamente */}
                      {readTokenTest.result.testResult.propertyInfo && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg border overflow-hidden">
                          {/* Header de la propiedad */}
                          <div className="p-4 border-b border-gray-200 dark:border-gray-600">
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                              {readTokenTest.result.testResult.propertyInfo.name || 'Propiedad Extraída'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {readTokenTest.result.testResult.propertyInfo.operation || 'N/A'} • {readTokenTest.result.testResult.propertyInfo.type || 'N/A'}
                            </div>
                          </div>
                        
                          {/* Galería de imágenes */}
                          <div className="p-3">
                            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                              <span className="mr-2">📸</span>
                              Galería ({readTokenTest.result.testResult.propertyInfo.totalImages || '0'} imágenes)
                            </div>
                          
                            {readTokenTest.result.testResult.propertyInfo.images && Array.isArray(readTokenTest.result.testResult.propertyInfo.images) && readTokenTest.result.testResult.propertyInfo.images.length > 0 ? (
                              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                {readTokenTest.result.testResult.propertyInfo.images.slice(0, 6).map((image: any, index: number) => (
                                  <div key={index} className="relative aspect-square rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                                    <img
                                      src={image.thumbnail || image.url}
                                      alt={image.title || `Imagen ${index + 1}`}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        const nextElement = target.nextElementSibling as HTMLElement;
                                        target.style.display = 'none';
                                        if (nextElement) nextElement.style.display = 'flex';
                                      }}
                                    />
                                    <div className="hidden w-full h-full items-center justify-center text-xs text-gray-500">
                                      📷
                                    </div>
                                    {image.isPrimary && (
                                      <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-1 rounded">
                                        Principal
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {readTokenTest.result.testResult.propertyInfo.images.length > 6 && (
                                  <div className="aspect-square rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-500">
                                    +{readTokenTest.result.testResult.propertyInfo.images.length - 6} más
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 text-center">
                                <div className="text-2xl mb-2">🏠</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Sin imágenes disponibles
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Información básica */}
                          <div className="p-3 space-y-3">
                            {/* Precio y ubicación */}
                            <div className="flex justify-between items-start">
                              <div className="flex items-center text-green-600 font-semibold">
                                <span className="w-4 mr-1">💰</span>
                                <span className="text-sm">{readTokenTest.result.testResult.propertyInfo.price || 'Precio a consultar'}</span>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                                <div>📍 {readTokenTest.result.testResult.propertyInfo.location || 'Ubicación no disponible'}</div>
                                {readTokenTest.result.testResult.propertyInfo.fullAddress && (
                                  <div className="mt-1">{readTokenTest.result.testResult.propertyInfo.fullAddress}</div>
                                )}
                              </div>
                            </div>
                            
                            {/* Descripción si está disponible */}
                            {readTokenTest.result.testResult.propertyInfo.description && (
                              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300">
                                <div className="font-medium mb-1">📝 Descripción:</div>
                                <div className="line-clamp-3">{readTokenTest.result.testResult.propertyInfo.description}</div>
                              </div>
                            )}
                            
                            {/* Características técnicas */}
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <div className="flex items-center">
                                <span className="w-4">🛏️</span>
                                <span>{readTokenTest.result.testResult.propertyInfo.rooms}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="w-4">🚿</span>
                                <span>{readTokenTest.result.testResult.propertyInfo.bathrooms}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="w-4">📐</span>
                                <span>{readTokenTest.result.testResult.propertyInfo.area}</span>
                              </div>
                              <div className="flex items-center">
                                <span className="w-4">🚗</span>
                                <span>{readTokenTest.result.testResult.propertyInfo.parking}</span>
                              </div>
                            </div>
                            
                            {/* Enlaces */}
                            <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                              {readTokenTest.result.testResult.propertyInfo.propertyUrl && (
                                <a
                                  href={readTokenTest.result.testResult.propertyInfo.propertyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  <span className="mr-1">🔗</span>
                                  Ver propiedad completa
                                </a>
                              )}
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-1">
                                <div>ID: {readTokenTest.result.testResult.propertyInfo.id || 'N/A'}</div>
                                <div>Vistas: {readTokenTest.result.testResult.propertyInfo.views || 0}</div>
                                <div>Estado: {readTokenTest.result.testResult.propertyInfo.status || 'Disponible'}</div>
                                <div>Total en CRM: {readTokenTest.result.testResult.totalProperties} propiedades</div>
                                {readTokenTest.result.testResult.propertyInfo.agent && readTokenTest.result.testResult.propertyInfo.agent.name && (
                                  <div>👤 Agente: {readTokenTest.result.testResult.propertyInfo.agent.name}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {readTokenTest.hasError && (
                      <div className="text-sm text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/30 p-3 rounded">
                        {readTokenTest.result.message}
                      </div>
                    )}
                  </div>
                )}

            {/* API Key Status */}
            {apiKeyTest.result && (
              <div className="mb-6">
                <div className={`p-4 rounded-lg border-2 ${
                  apiKeyTest.hasError 
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/20' 
                    : 'border-green-500 bg-green-50 dark:bg-green-950/20'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {apiKeyTest.hasError ? (
                        <div className="flex items-center text-red-700 dark:text-red-300">
                          <span className="text-2xl mr-2">❌</span>
                          <span className="font-bold">No funciona</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-green-700 dark:text-green-300">
                          <span className="text-2xl mr-2">✅</span>
                          <span className="font-bold">Funciona</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setApiKeyTest({ isLoading: false, result: null, hasError: false })}
                      className="h-6 w-6 p-0"
                    >
                      ×
                    </Button>
                  </div>
                  
                  <h4 className="font-medium text-sm mb-2">🔑 API de Escritura</h4>
                  
                  {!apiKeyTest.hasError && apiKeyTest.result.testResult?.leadInfo && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
                      <div className="space-y-2 text-xs">
                        <div><strong>Lead ID:</strong> {apiKeyTest.result.testResult.leadInfo.id}</div>
                        <div><strong>Nombre:</strong> {apiKeyTest.result.testResult.leadInfo.name}</div>
                        <div><strong>Teléfono:</strong> {apiKeyTest.result.testResult.leadInfo.phone}</div>
                        <div><strong>Email:</strong> {apiKeyTest.result.testResult.leadInfo.email}</div>
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                          <div className="text-green-600 font-medium">✓ {apiKeyTest.result.testResult.leadInfo.created}</div>
                          <div className="text-orange-600 font-medium">🗑️ {apiKeyTest.result.testResult.leadInfo.deleted}</div>
                        </div>
                        {apiKeyTest.result.testResult.leadInfo.warning && (
                          <div className="text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                            ⚠️ {apiKeyTest.result.testResult.leadInfo.warning}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {apiKeyTest.hasError && (
                    <div className="text-sm text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/30 p-3 rounded">
                      {apiKeyTest.result.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Loading States */}
            {(readTokenTest.isLoading || apiKeyTest.isLoading) && (
              <div className="mb-6 p-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-blue-700 dark:text-blue-300 font-medium">
                    {readTokenTest.isLoading && "Probando conexión de lectura..."}
                    {apiKeyTest.isLoading && "Probando API Key de escritura..."}
                  </span>
                </div>
              </div>
            )}

            {/* No Results State */}
            {!readTokenTest.result && !apiKeyTest.result && !readTokenTest.isLoading && !apiKeyTest.isLoading && (
              <div className="text-center text-muted-foreground py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <span className="text-2xl">🔗</span>
                </div>
                <p className="text-sm font-medium mb-1">Estado de Conexión</p>
                <p className="text-xs">Los resultados aparecerán aquí después de probar las APIs</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
