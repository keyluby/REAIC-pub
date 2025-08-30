import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Bot, User } from "lucide-react";

interface MessageListProps {
  conversationId: string;
}

export default function MessageList({ conversationId }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { data: messages, isLoading } = useQuery({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 bg-primary rounded-lg animate-pulse mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
        </div>
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/30">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Aún no hay mensajes</h3>
          <p className="text-sm text-muted-foreground">
            Esta conversación aún no ha comenzado
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 space-y-4 overflow-auto bg-muted/30">
      {messages.map((message: any) => (
        <div
          key={message.id}
          className={`flex items-end space-x-2 ${message.fromMe ? 'flex-row-reverse' : ''}`}
        >
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
            {message.fromMe ? (
              <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center">
                <Bot className="w-3 h-3 text-accent-foreground" />
              </div>
            ) : (
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <User className="w-3 h-3 text-primary-foreground" />
              </div>
            )}
          </div>
          <div
            className={`max-w-xs p-3 rounded-lg ${
              message.fromMe
                ? 'chat-message-ai'
                : 'chat-message-user text-primary-foreground'
            }`}
            data-testid={`message-${message.id}`}
          >
            <p className="text-sm">{message.content}</p>
            {message.mediaUrl && (
              <img 
                src={message.mediaUrl} 
                alt="Message media" 
                className="mt-2 rounded max-w-full h-auto"
              />
            )}
            <p className={`text-xs mt-1 ${message.fromMe ? 'text-muted-foreground' : 'opacity-80'}`}>
              {new Date(message.timestamp).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </p>
          </div>
        </div>
      ))}
      
      {/* Typing Indicator */}
      <div className="flex items-end space-x-2 flex-row-reverse">
        <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
          <Bot className="w-3 h-3 text-accent-foreground" />
        </div>
        <div className="chat-message-ai p-3 rounded-lg">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
          </div>
        </div>
      </div>
      
      <div ref={messagesEndRef} />
    </div>
  );
}
