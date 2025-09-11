import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import MainLayout from "@/components/Layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  MessageCircle, 
  User, 
  Send, 
  Paperclip, 
  Mic, 
  Image as ImageIcon,
  Bot,
  Search,
  Phone,
  Settings
} from "lucide-react";

export default function Conversations() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchText, setSearchText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ["/api/conversations"],
    enabled: isAuthenticated,
    refetchInterval: 5000, // Poll every 5 seconds for conversation updates
    refetchIntervalInBackground: true,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["/api/conversations", selectedConversation, "messages"],
    enabled: !!selectedConversation && isAuthenticated,
    refetchInterval: 2000, // Poll every 2 seconds for new messages
    refetchIntervalInBackground: true,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { conversationId: string; message: string }) => {
      return await apiRequest('POST', `/api/conversations/${data.conversationId}/send`, {
        message: data.message,
        type: 'text'
      });
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({
        title: "Mensaje enviado",
        description: "Tu mensaje se ha enviado correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo enviar el mensaje",
        variant: "destructive",
      });
    },
  });

  const toggleEscalationMutation = useMutation({
    mutationFn: async (data: { conversationId: string; escalated: boolean }) => {
      return await apiRequest('POST', `/api/conversations/${data.conversationId}/escalate`, {
        escalated: data.escalated
      });
    },
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation, "messages"] });
      toast({
        title: variables.escalated ? "Control manual activado" : "IA reactivada",
        description: variables.escalated ? 
          "Ahora controlas esta conversación manualmente" : 
          "La IA ha tomado control de la conversación",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo cambiar el control de la conversación",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!selectedConversation || !messageText.trim()) return;
    
    sendMessageMutation.mutate({
      conversationId: selectedConversation,
      message: messageText.trim()
    });
  };

  const handleToggleAI = (conversationId: string, currentlyEscalated: boolean) => {
    toggleEscalationMutation.mutate({
      conversationId,
      escalated: !currentlyEscalated
    });
  };

  // Get current conversation info
  const currentConversation = (conversations as any[]).find((c: any) => c.id === selectedConversation);
  const isCurrentConversationEscalated = currentConversation?.isEscalated || false;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && messages) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Scroll to bottom when conversation changes
  useEffect(() => {
    if (selectedConversation && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [selectedConversation]);

  const filteredConversations = (conversations as any[]).filter((conv: any) =>
    conv.clientName?.toLowerCase().includes(searchText.toLowerCase()) ||
    conv.clientPhone?.includes(searchText)
  );

  if (isLoading || conversationsLoading) {
    return (
      <MainLayout>
        <div className="flex h-full">
          <div className="w-80 border-r bg-muted/30 p-4">
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-muted rounded"></div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-muted rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded mb-2"></div>
                    <div className="h-3 bg-muted rounded w-2/3"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-lg animate-pulse mx-auto mb-4"></div>
              <p className="text-muted-foreground">Cargando conversaciones...</p>
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
      <div className="h-full max-h-full flex overflow-hidden">
      {/* Sidebar - Lista de conversaciones */}
      <div className="w-80 border-r bg-background flex flex-col">
          {/* Header del sidebar */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Chats</h2>
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-muted-foreground cursor-pointer" />
              </div>
            </div>
            
            {/* Barra de búsqueda */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Buscar conversaciones..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9"
                data-testid="input-search-conversations"
              />
            </div>
          </div>

          {/* Lista de conversaciones */}
          <div className="flex-1 overflow-auto">
            {!filteredConversations || filteredConversations.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No hay conversaciones</p>
                <p className="text-sm text-muted-foreground">
                  Las conversaciones aparecerán aquí cuando recibas mensajes
                </p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {filteredConversations.map((conversation: any) => {
                  const initials = conversation.clientName 
                    ? conversation.clientName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                    : conversation.clientPhone.slice(-2);
                  
                  const isSelected = selectedConversation === conversation.id;
                  
                  return (
                    <div
                      key={conversation.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedConversation(conversation.id)}
                      data-testid={`conversation-item-${conversation.id}`}
                    >
                      {/* Avatar */}
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white font-medium">
                            {initials}
                          </span>
                        </div>
                        {conversation.status === 'ACTIVE' && !conversation.isEscalated && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background"></div>
                        )}
                      </div>

                      {/* Información de la conversación */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-foreground truncate">
                            {conversation.clientName || 'Usuario'}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {new Date(conversation.lastMessageAt).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground truncate">
                            {conversation.isEscalated ? (
                              <span className="flex items-center">
                                <User className="w-3 h-3 mr-1" />
                                Control manual activo
                              </span>
                            ) : (
                              <span className="flex items-center">
                                <Bot className="w-3 h-3 mr-1" />
                                IA respondiendo...
                              </span>
                            )}
                          </p>
                          
                          {conversation.isEscalated && (
                            <Badge variant="destructive" className="text-xs">
                              Manual
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Área principal del chat */}
        <div className="flex-1 flex flex-col">
          {!selectedConversation ? (
            /* Estado inicial - sin conversación seleccionada */
            <div className="flex-1 flex items-center justify-center bg-muted/30">
              <div className="text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <MessageCircle className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-2xl font-medium text-foreground mb-2">
                  WhatsApp IA Assistant
                </h3>
                <p className="text-muted-foreground mb-4">
                  Selecciona una conversación para empezar a gestionar mensajes
                </p>
                <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <Bot className="w-4 h-4" />
                  <span>IA {!isCurrentConversationEscalated ? 'activa' : 'pausada'}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Chat activo */
            <>
              {/* Header del chat */}
              <div className="p-4 border-b bg-background flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {(() => {
                    const selectedConv = (conversations as any[]).find((c: any) => c.id === selectedConversation);
                    if (!selectedConv) return null;
                    
                    const initials = selectedConv.clientName 
                      ? selectedConv.clientName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
                      : selectedConv.clientPhone.slice(-2);
                    
                    return (
                      <>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {initials}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-medium text-foreground">
                            {selectedConv.clientName || 'Usuario'}
                          </h3>
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span>{selectedConv.clientPhone}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Control de IA */}
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Bot className="w-4 h-4" />
                    <span className="text-sm">IA</span>
                    <Switch
                      checked={!isCurrentConversationEscalated}
                      onCheckedChange={() => handleToggleAI(selectedConversation, isCurrentConversationEscalated)}
                      disabled={toggleEscalationMutation.isPending}
                      data-testid="switch-ai-enabled"
                    />
                  </div>
                </div>
              </div>

              {/* Mensajes */}
              <div ref={messagesContainerRef} className="flex-1 overflow-auto bg-muted/30">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-8 h-8 bg-primary rounded-lg animate-pulse mx-auto mb-2"></div>
                      <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
                    </div>
                  </div>
                ) : (messages as any[]).length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">Conversación iniciada</h3>
                      <p className="text-muted-foreground">
                        Los mensajes aparecerán aquí automáticamente
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    {(messages as any[]).map((message: any) => (
                      <div
                        key={message.id}
                        className={`flex items-end space-x-2 ${message.fromMe ? 'flex-row-reverse space-x-reverse' : ''}`}
                        data-testid={`message-${message.id}`}
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                          {message.fromMe ? (
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>

                        {/* Mensaje */}
                        <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${
                          message.fromMe 
                            ? 'bg-green-500 text-white' 
                            : 'bg-white border shadow-sm text-foreground'
                        }`}>
                          {/* Texto del mensaje */}
                          {message.content && (
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          )}
                          
                          {/* Medios (imágenes, audio, etc.) */}
                          {message.mediaUrl && (
                            <div className="mt-2">
                              {message.messageType === 'audioMessage' ? (
                                <div className="flex items-center space-x-2 p-2 bg-gray-100 rounded">
                                  <button 
                                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-800"
                                    onClick={() => {
                                      const audio = new Audio(message.mediaUrl);
                                      audio.play().catch(e => console.error('Error playing audio:', e));
                                    }}
                                    data-testid={`audio-play-${message.id}`}
                                  >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-xs">Reproducir audio</span>
                                  </button>
                                </div>
                              ) : (
                                <img 
                                  src={message.mediaUrl} 
                                  alt="Imagen del mensaje" 
                                  className="rounded max-w-full h-auto cursor-pointer hover:opacity-90"
                                  onClick={() => window.open(message.mediaUrl, '_blank')}
                                  loading="lazy"
                                />
                              )}
                            </div>
                          )}
                          
                          {/* Timestamp */}
                          <p className={`text-xs mt-1 ${
                            message.fromMe ? 'text-green-100' : 'text-muted-foreground'
                          }`}>
                            {new Date(message.timestamp).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                    
                    {/* Indicador de nuevos mensajes */}
                    <div className="flex justify-center py-2">
                      <div className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        Actualizando en tiempo real ✨
                      </div>
                    </div>
                    
                    {/* Elemento para auto-scroll */}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Campo de entrada */}
              <div className="p-4 border-t bg-background">
                <div className="flex items-center space-x-2">
                  {/* Botón de adjuntos */}
                  <Button variant="ghost" size="sm" className="flex-shrink-0">
                    <Paperclip className="w-4 h-4" />
                  </Button>

                  {/* Campo de texto */}
                  <div className="flex-1 relative">
                    <Input
                      placeholder={!isCurrentConversationEscalated ? "El IA responderá automáticamente..." : "Escribe un mensaje..."}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      disabled={!isCurrentConversationEscalated || sendMessageMutation.isPending}
                      data-testid="input-message"
                      className="pr-20"
                    />
                    
                    {/* Botones dentro del input */}
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Mic className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Botón enviar */}
                  <Button 
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || !isCurrentConversationEscalated || sendMessageMutation.isPending}
                    size="sm"
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>

                {/* Indicador de estado */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    {!isCurrentConversationEscalated ? (
                      <>
                        <Bot className="w-3 h-3" />
                        <span>IA está manejando esta conversación</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3 h-3" />
                        <span>Estás controlando esta conversación manualmente</span>
                      </>
                    )}
                  </div>
                  
                  {sendMessageMutation.isPending && (
                    <div className="text-xs text-muted-foreground">
                      Enviando...
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}