import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

interface ConversationListProps {
  selectedConversation: string | null;
  onSelectConversation: (id: string) => void;
}

export default function ConversationList({ selectedConversation, onSelectConversation }: ConversationListProps) {
  const { data: conversations, isLoading } = useQuery({
    queryKey: ["/api/conversations"],
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center space-x-3 p-2 animate-pulse">
            <div className="w-8 h-8 bg-muted rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-muted rounded mb-1"></div>
              <div className="h-3 bg-muted rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
          <User className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No hay conversaciones activas</p>
        <p className="text-xs text-muted-foreground mt-1">Conecta WhatsApp para comenzar a recibir mensajes</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-40 overflow-auto">
      {conversations.map((conversation: any) => {
        const initials = conversation.clientName 
          ? conversation.clientName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
          : conversation.clientPhone.slice(-2);
        
        const isSelected = selectedConversation === conversation.id;
        const isActive = conversation.status === 'ACTIVE';

        return (
          <div
            key={conversation.id}
            className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${
              isSelected ? 'bg-primary/10' : 'hover:bg-secondary'
            }`}
            onClick={() => onSelectConversation(conversation.id)}
            data-testid={`conversation-${conversation.id}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isSelected ? 'bg-primary' : 'bg-accent'
            }`}>
              <span className={`text-xs font-medium ${
                isSelected ? 'text-primary-foreground' : 'text-accent-foreground'
              }`}>
                {initials}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate" data-testid={`conversation-name-${conversation.id}`}>
                {conversation.clientName || conversation.clientPhone}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {conversation.isEscalated ? 'Escalado a humano' : 'IA gestionando...'}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">
                {new Date(conversation.lastMessageAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </span>
              {isActive && !conversation.isEscalated && (
                <span className="w-2 h-2 bg-primary rounded-full mt-1"></span>
              )}
              {conversation.isEscalated && (
                <Badge variant="destructive" className="text-xs mt-1">
                  Humano
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
