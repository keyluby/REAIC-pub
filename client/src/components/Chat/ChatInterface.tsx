import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, MoreVertical, Paperclip, User, MessageCircle } from "lucide-react";
import ConversationList from "./ConversationList";
import MessageList from "./MessageList";
import { useWebSocket } from "@/hooks/useWebSocket";

interface ChatInterfaceProps {
  onClose?: () => void;
}

export default function ChatInterface({ onClose }: ChatInterfaceProps) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const { isConnected } = useWebSocket();

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">Active Conversations</h3>
          <div className="flex items-center space-x-2">
            <Badge 
              variant={isConnected ? "default" : "destructive"}
              className={isConnected ? "bg-green-500/10 text-green-600" : ""}
            >
              {isConnected ? "Online" : "Offline"}
            </Badge>
            <Button variant="ghost" size="sm" data-testid="button-chat-menu">
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-chat">
                <X className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
        
        <ConversationList 
          selectedConversation={selectedConversation}
          onSelectConversation={setSelectedConversation}
        />
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden">
        {selectedConversation ? (
          <MessageList conversationId={selectedConversation} />
        ) : (
          <div className="flex items-center justify-center h-full bg-muted/30">
            <div className="text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No conversation selected</h3>
              <p className="text-sm text-muted-foreground">
                Select a conversation to start monitoring or take over from AI
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Chat Input - Only shown when conversation is selected */}
      {selectedConversation && (
        <div className="p-4 border-t border-border bg-card">
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" data-testid="button-attach-file">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
            </Button>
            <div className="flex-1">
              <Input
                placeholder={isMonitoring ? "Monitor conversation..." : "Type your message..."}
                className="bg-background border-border"
                disabled={isMonitoring}
                data-testid="input-chat-message"
              />
            </div>
            <Button 
              variant={isMonitoring ? "default" : "outline"}
              size="sm"
              onClick={() => setIsMonitoring(!isMonitoring)}
              data-testid="button-toggle-monitoring"
            >
              <User className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {isMonitoring 
              ? "AI is handling this conversation • Click user icon to take over"
              : "You are now handling this conversation • AI is paused"
            }
          </p>
        </div>
      )}
    </div>
  );
}
