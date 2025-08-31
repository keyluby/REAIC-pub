import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, QrCode, Power, RefreshCw, Trash2 } from "lucide-react";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import QRCodeModal from "./QRCodeModal";

export default function WhatsAppConnection() {
  const [showQRModal, setShowQRModal] = useState(false);
  const { instances, isLoading, createInstance, logout, forceDelete, refreshStatus, isLoggingOut, isForceDeleting, isRefreshing } = useWhatsApp();

  const handleCreateInstance = async () => {
    try {
      const instanceName = `instance_${Date.now()}`;
      await createInstance(instanceName);
      setShowQRModal(true);
    } catch (error) {
      console.error('Error creating instance:', error);
      // Error is already handled by the mutation's onError callback
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded mb-4"></div>
            <div className="h-8 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Smartphone className="w-5 h-5 text-primary" />
            <span>Conexión de WhatsApp</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {instances.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fab fa-whatsapp text-green-500 text-2xl"></i>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">WhatsApp No Conectado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Conecta tu cuenta de WhatsApp para comenzar a recibir y enviar mensajes
              </p>
              <Button onClick={handleCreateInstance} data-testid="button-connect-whatsapp">
                <QrCode className="w-4 h-4 mr-2" />
                Conectar WhatsApp
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.slice(0, 1).map((instance: any) => (
                <div key={instance.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                      <i className="fab fa-whatsapp text-green-500 text-lg"></i>
                    </div>
                    <div>
                      <p className="font-medium text-foreground" data-testid={`instance-name-${instance.id}`}>
                        {instance.phoneNumber || instance.instanceName}
                      </p>
                      <div className="flex items-center space-x-2">
                        <Badge 
                          variant={instance.status === 'CONNECTED' ? 'default' : 'secondary'}
                          className={
                            instance.status === 'CONNECTED' 
                              ? 'bg-green-500/10 text-green-600' 
                              : instance.status === 'CONNECTING'
                              ? 'bg-yellow-500/10 text-yellow-600'
                              : 'bg-red-500/10 text-red-600'
                          }
                        >
                          {instance.status === 'CONNECTED' ? 'Conectado' : 
                           instance.status === 'CONNECTING' ? 'Conectando' : 'Desconectado'}
                        </Badge>
                        {instance.lastSeen && (
                          <span className="text-xs text-muted-foreground">
                            Última vez visto: {new Date(instance.lastSeen).toLocaleString('es-ES')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refreshStatus(instance.instanceName)}
                      disabled={isRefreshing}
                      data-testid={`button-refresh-${instance.id}`}
                      title="Actualizar estado de conexión"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                    
                    {instance.status === 'DISCONNECTED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowQRModal(true)}
                        data-testid={`button-reconnect-${instance.id}`}
                      >
                        <QrCode className="w-4 h-4 mr-2" />
                        Reconectar
                      </Button>
                    )}
                    
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => logout(instance.instanceName)}
                      disabled={isLoggingOut}
                      data-testid={`button-disconnect-${instance.id}`}
                    >
                      <Power className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => forceDelete(instance.instanceName)}
                      disabled={isForceDeleting}
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      data-testid={`button-force-delete-${instance.id}`}
                      title="Eliminar instancia que ya no existe en el servidor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {instances.length < 1 && (
                <Button
                  variant="outline"
                  onClick={handleCreateInstance}
                  className="w-full"
                  data-testid="button-add-instance"
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Conectar WhatsApp
                </Button>
              )}
              
              {instances.length >= 1 && (
                <div className="text-center p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Solo se permite una instancia de WhatsApp por cuenta
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <QRCodeModal 
        open={showQRModal} 
        onClose={() => setShowQRModal(false)}
        instanceName={instances[0]?.instanceName}
      />
    </>
  );
}
