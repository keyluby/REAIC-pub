import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, QrCode } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface QRCodeModalProps {
  open: boolean;
  onClose: () => void;
  instanceName?: string;
}

export default function QRCodeModal({ open, onClose, instanceName }: QRCodeModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQRCode = async () => {
    if (!instanceName) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('GET', `/api/whatsapp/qr-code/${instanceName}`);
      const data = await response.json();
      
      console.log('QR Code response:', data); // Debug log
      
      // Evolution API puede devolver diferentes formatos
      if (data.base64) {
        setQrCode(data.base64);
      } else if (data.code) {
        setQrCode(data.code);
      } else if (data.pairingCode) {
        setError('Esta instancia usa código de emparejamiento. Reconecta desde tu dispositivo.');
      } else {
        setError('Código QR no disponible');
      }
    } catch (error) {
      console.error('Error fetching QR code:', error);
      setError('Error al cargar el código QR');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && instanceName) {
      fetchQRCode();
    }
  }, [open, instanceName]);

  const handleRefresh = () => {
    setQrCode(null);
    fetchQRCode();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-green-500/10 rounded-full flex items-center justify-center">
              <i className="fab fa-whatsapp text-green-500 text-lg"></i>
            </div>
            <span>Conectar WhatsApp</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="text-center py-6">
          <p className="text-muted-foreground mb-6">
Escanea el código QR con tu teléfono para conectar tu cuenta de WhatsApp
          </p>
          
          {/* QR Code Display */}
          <div className="w-48 h-48 mx-auto bg-muted rounded-lg flex items-center justify-center mb-6">
            {isLoading ? (
              <div className="text-center">
                <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Cargando código QR...</p>
              </div>
            ) : error ? (
              <div className="text-center">
                <QrCode className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            ) : qrCode ? (
              <img 
                src={`data:image/png;base64,${qrCode}`} 
                alt="WhatsApp QR Code"
                className="w-full h-full object-contain rounded"
                data-testid="qr-code-image"
              />
            ) : (
              <div className="text-center">
                <QrCode className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">El código QR aparecerá aquí</p>
              </div>
            )}
          </div>
          
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
              data-testid="button-cancel-qr"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex-1"
              data-testid="button-refresh-qr"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Actualizar QR
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
