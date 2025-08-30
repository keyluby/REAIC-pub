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
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import WhatsAppConnection from "@/components/WhatsApp/WhatsAppConnection";
import { Settings, Bot, Smartphone, Building, Bell, Save } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    assistantName: '',
    assistantPersonality: '',
    language: 'es',
    timezone: 'America/New_York',
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
          <h2 className="text-2xl font-semibold mb-2 text-foreground">Settings</h2>
          <p className="text-muted-foreground">
            Configure your AI assistant, integrations, and preferences
          </p>
        </div>

        <Tabs defaultValue="assistant" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="assistant" data-testid="tab-assistant">
              <Bot className="w-4 h-4 mr-2" />
              AI Assistant
            </TabsTrigger>
            <TabsTrigger value="whatsapp" data-testid="tab-whatsapp">
              <Smartphone className="w-4 h-4 mr-2" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <Building className="w-4 h-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit}>
            <TabsContent value="assistant" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI Assistant Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="assistantName">Assistant Name</Label>
                      <Input
                        id="assistantName"
                        value={formData.assistantName}
                        onChange={(e) => handleInputChange('assistantName', e.target.value)}
                        placeholder="e.g., María, Carlos, Assistant"
                        data-testid="input-assistant-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="language">Language</Label>
                      <select
                        id="language"
                        value={formData.language}
                        onChange={(e) => handleInputChange('language', e.target.value)}
                        className="w-full p-2 border border-border rounded-md bg-background"
                        data-testid="select-language"
                      >
                        <option value="es">Spanish</option>
                        <option value="en">English</option>
                        <option value="pt">Portuguese</option>
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="assistantPersonality">Assistant Personality</Label>
                    <Textarea
                      id="assistantPersonality"
                      value={formData.assistantPersonality}
                      onChange={(e) => handleInputChange('assistantPersonality', e.target.value)}
                      placeholder="Describe the personality and tone you want your assistant to have..."
                      rows={3}
                      data-testid="textarea-assistant-personality"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-6">
              <WhatsAppConnection />
              
              <Card>
                <CardHeader>
                  <CardTitle>Message Behavior</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="bufferTime">Buffer Time (seconds)</Label>
                      <Input
                        id="bufferTime"
                        type="number"
                        min="5"
                        max="60"
                        value={formData.bufferTime}
                        onChange={(e) => handleInputChange('bufferTime', parseInt(e.target.value))}
                        data-testid="input-buffer-time"
                      />
                    </div>
                    <div>
                      <Label htmlFor="maxMessageChunks">Max Message Length</Label>
                      <Input
                        id="maxMessageChunks"
                        type="number"
                        min="100"
                        max="500"
                        value={formData.maxMessageChunks}
                        onChange={(e) => handleInputChange('maxMessageChunks', parseInt(e.target.value))}
                        data-testid="input-max-chunks"
                      />
                    </div>
                    <div>
                      <Label htmlFor="messageDelay">Delay Between Messages (seconds)</Label>
                      <Input
                        id="messageDelay"
                        type="number"
                        min="1"
                        max="10"
                        value={formData.messageDelay}
                        onChange={(e) => handleInputChange('messageDelay', parseInt(e.target.value))}
                        data-testid="input-message-delay"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="humanizeResponses">Humanize Responses</Label>
                      <p className="text-sm text-muted-foreground">
                        Add typing indicators and natural delays to make responses feel more human
                      </p>
                    </div>
                    <Switch
                      id="humanizeResponses"
                      checked={formData.humanizeResponses}
                      onCheckedChange={(checked) => handleInputChange('humanizeResponses', checked)}
                      data-testid="switch-humanize-responses"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>AlterEstate CRM</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="alterEstateToken">API Token</Label>
                    <Input
                      id="alterEstateToken"
                      type="password"
                      value={formData.alterEstateToken}
                      onChange={(e) => handleInputChange('alterEstateToken', e.target.value)}
                      placeholder="Enter your AlterEstate API token"
                      data-testid="input-alterestate-token"
                    />
                  </div>
                  <div>
                    <Label htmlFor="alterEstateCompanyId">Company ID</Label>
                    <Input
                      id="alterEstateCompanyId"
                      value={formData.alterEstateCompanyId}
                      onChange={(e) => handleInputChange('alterEstateCompanyId', e.target.value)}
                      placeholder="Your company ID"
                      data-testid="input-alterestate-company"
                    />
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-test-crm-connection">
                    Test Connection
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Calendar Integration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="googleCalendarId">Google Calendar ID</Label>
                    <Input
                      id="googleCalendarId"
                      value={formData.googleCalendarId}
                      onChange={(e) => handleInputChange('googleCalendarId', e.target.value)}
                      placeholder="your-calendar@gmail.com"
                      data-testid="input-google-calendar"
                    />
                  </div>
                  <div>
                    <Label htmlFor="calComUsername">Cal.com Username</Label>
                    <Input
                      id="calComUsername"
                      value={formData.calComUsername}
                      onChange={(e) => handleInputChange('calComUsername', e.target.value)}
                      placeholder="your-username"
                      data-testid="input-calcom-username"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="emailNotifications">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive email notifications for new appointments and escalations
                      </p>
                    </div>
                    <Switch
                      id="emailNotifications"
                      checked={formData.emailNotifications}
                      onCheckedChange={(checked) => handleInputChange('emailNotifications', checked)}
                      data-testid="switch-email-notifications"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="whatsappNotifications">WhatsApp Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive WhatsApp messages for important updates
                      </p>
                    </div>
                    <Switch
                      id="whatsappNotifications"
                      checked={formData.whatsappNotifications}
                      onCheckedChange={(checked) => handleInputChange('whatsappNotifications', checked)}
                      data-testid="switch-whatsapp-notifications"
                    />
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
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
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
