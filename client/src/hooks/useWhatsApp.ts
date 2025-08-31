import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { WhatsappInstance } from "@shared/schema";

export function useWhatsApp() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: instances = [], isLoading, error } = useQuery<WhatsappInstance[]>({
    queryKey: ["/api/whatsapp/instances"],
    refetchInterval: 2000, // Verificar cada 2 segundos para conexiones rápidas
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (isUnauthorizedError(error)) {
        return false;
      }
      return failureCount < 3;
    },
    onError: (error) => {
      console.error('Error fetching WhatsApp instances:', error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      }
    },
  });

  const createInstanceMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      return await apiRequest('POST', '/api/whatsapp/create-instance', { instanceName });
    },
    onSuccess: () => {
      toast({
        title: "Instancia de WhatsApp creada",
        description: "Escanea el código QR para conectar tu cuenta de WhatsApp",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instances"] });
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
        description: "Error al crear la instancia de WhatsApp",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      return await apiRequest('DELETE', `/api/whatsapp/logout/${instanceName}`);
    },
    onSuccess: () => {
      toast({
        title: "WhatsApp desconectado",
        description: "Tu cuenta de WhatsApp ha sido desconectada",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instances"] });
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
        description: "Failed to disconnect WhatsApp",
        variant: "destructive",
      });
    },
  });

  const refreshStatusMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      return await apiRequest('GET', `/api/whatsapp/instance-status/${instanceName}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instances"] });
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
      console.error('Error refreshing status:', error);
    },
  });

  const forceDeleteMutation = useMutation({
    mutationFn: async (instanceName: string) => {
      return await apiRequest('DELETE', `/api/whatsapp/force-delete/${instanceName}`);
    },
    onSuccess: () => {
      toast({
        title: "Instancia eliminada",
        description: "La instancia ha sido eliminada de la aplicación",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instances"] });
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
        description: "No se pudo eliminar la instancia",
        variant: "destructive",
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ instanceName, number, message, isMediaMessage, mediaUrl, caption }: {
      instanceName: string;
      number: string;
      message?: string;
      isMediaMessage?: boolean;
      mediaUrl?: string;
      caption?: string;
    }) => {
      return await apiRequest('POST', '/api/whatsapp/send-message', {
        instanceName,
        number,
        message,
        isMediaMessage,
        mediaUrl,
        caption,
      });
    },
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "Your message has been sent successfully",
      });
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
        description: "Failed to send message",
        variant: "destructive",
      });
    },
  });

  return {
    instances,
    isLoading,
    createInstance: createInstanceMutation.mutate,
    logout: logoutMutation.mutate,
    forceDelete: forceDeleteMutation.mutate,
    refreshStatus: refreshStatusMutation.mutate,
    sendMessage: sendMessageMutation.mutate,
    isCreatingInstance: createInstanceMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    isForceDeleting: forceDeleteMutation.isPending,
    isRefreshing: refreshStatusMutation.isPending,
    isSendingMessage: sendMessageMutation.isPending,
  };
}
