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
import { Settings, Bot, Smartphone, Building, Bell, Save, MessageCircle, User, Phone, Mail } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    assistantName: '',
    assistantPersonality: '',
    language: 'es',
    timezone: 'America/New_York',
    
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
    
    // Evolution API configuration
    evolutionApiUrl: 'https://personal-evolution-api.rcwlba.easypanel.host',
    evolutionApiKey: '',
    
    // Legacy fields
    bufferTime: 10,
    maxMessageChunks: 3,
    messageDelay: 2,
    humanizeResponses: true,
    alterEstateToken: '',
    alterEstateCompanyId: '',
    googleCalendarId: '',
    calComUsername: '',
    emailNotifications: true,
    whatsappNotifications: false,
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
    if (settings) {
      setFormData({
        assistantName: settings.assistantName || 'Asistente IA',
        assistantPersonality: settings.assistantPersonality || '',
        language: settings.language || 'es',
        timezone: settings.timezone || 'America/New_York',
        
        // Configuraciones avanzadas
        messageBufferEnabled: settings.messageBufferEnabled ?? true,
        messageBufferTime: settings.messageBufferTime || 5,
        humanizedResponsesEnabled: settings.humanizedResponsesEnabled ?? true,
        messagingInterval: settings.messagingInterval || 2,
        maxMessagesPerResponse: settings.maxMessagesPerResponse || 4,
        humanEscalationEnabled: settings.humanEscalationEnabled ?? true,
        notificationMethod: settings.notificationMethod || 'Email y WhatsApp',
        notificationEmail: settings.notificationEmail || '',
        notificationWhatsApp: settings.notificationWhatsApp || '',
        
        // Evolution API configuration
        evolutionApiUrl: settings.evolutionApiUrl || '',
        evolutionApiKey: settings.evolutionApiKey || '',
        
        // Legacy fields
        bufferTime: settings.bufferTime || 10,
        maxMessageChunks: settings.maxMessageChunks || 3,
        messageDelay: settings.messageDelay || 2,
        humanizeResponses: settings.humanizeResponses ?? true,
        alterEstateToken: settings.alterEstateToken || '',
        alterEstateCompanyId: settings.alterEstateCompanyId || '',
        googleCalendarId: settings.googleCalendarId || '',
        calComUsername: settings.calComUsername || '',
        emailNotifications: settings.emailNotifications ?? true,
        whatsappNotifications: settings.whatsappNotifications ?? false,
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
      <div className="p-6 space-y-6">
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
              <Card>
                <CardHeader>
                  <CardTitle>🔧 Configuración de Evolution API</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="evolutionApiUrl">URL del Servidor Evolution API</Label>
                    <Input
                      id="evolutionApiUrl"
                      value={formData.evolutionApiUrl}
                      onChange={(e) => handleInputChange('evolutionApiUrl', e.target.value)}
                      placeholder="https://tu-vps.com:8080"
                      data-testid="input-evolution-url"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      URL completa de tu servidor Evolution API instalado en el VPS
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="evolutionApiKey">API Key de Evolution API</Label>
                    <Input
                      id="evolutionApiKey"
                      type="password"
                      value={formData.evolutionApiKey}
                      onChange={(e) => handleInputChange('evolutionApiKey', e.target.value)}
                      placeholder="Tu API key de Evolution API"
                      data-testid="input-evolution-key"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Clave de API para autenticación con tu servidor Evolution API
                    </p>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-test-evolution-connection">
                    Probar Conexión
                  </Button>
                </CardContent>
              </Card>
              
              <WhatsAppConnection />
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>AlterEstate CRM</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="alterEstateToken">Token de API</Label>
                    <Input
                      id="alterEstateToken"
                      type="password"
                      value={formData.alterEstateToken}
                      onChange={(e) => handleInputChange('alterEstateToken', e.target.value)}
                      placeholder="Ingresa tu token de API de AlterEstate"
                      data-testid="input-alterestate-token"
                    />
                  </div>
                  <div>
                    <Label htmlFor="alterEstateCompanyId">ID de Empresa</Label>
                    <Input
                      id="alterEstateCompanyId"
                      value={formData.alterEstateCompanyId}
                      onChange={(e) => handleInputChange('alterEstateCompanyId', e.target.value)}
                      placeholder="Tu ID de empresa"
                      data-testid="input-alterestate-company"
                    />
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-test-crm-connection">
                    Probar Conexión
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Integración de Calendario</CardTitle>
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
    </MainLayout>
  );
}
