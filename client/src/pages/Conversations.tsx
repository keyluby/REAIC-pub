import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import MainLayout from "@/components/Layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, User, Clock, Phone } from "lucide-react";

export default function Conversations() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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

  const { data: conversations, isLoading: conversationsLoading } = useQuery({
    queryKey: ["/api/conversations"],
    enabled: isAuthenticated,
  });

  if (isLoading || conversationsLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-muted rounded"></div>
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
          <h2 className="text-2xl font-semibold mb-2 text-foreground">Conversaciones</h2>
          <p className="text-muted-foreground">
            Administra todas tus conversaciones de WhatsApp y supervisa las interacciones de IA
          </p>
        </div>

        {/* Conversations List */}
        {!conversations || conversations.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No conversations yet</h3>
              <p className="text-muted-foreground">
                Connect your WhatsApp account to start receiving and managing conversations
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {conversations.map((conversation: any) => {
              const statusColor = {
                'ACTIVE': 'bg-green-500/10 text-green-600',
                'PAUSED': 'bg-yellow-500/10 text-yellow-600',
                'ENDED': 'bg-gray-500/10 text-gray-600',
                'ESCALATED': 'bg-red-500/10 text-red-600',
              }[conversation.status] || 'bg-gray-500/10 text-gray-600';

              return (
                <Card key={conversation.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-semibold text-foreground" data-testid={`conversation-title-${conversation.id}`}>
                              {conversation.clientName || 'Unknown Contact'}
                            </h3>
                            <Badge className={statusColor}>
                              {conversation.status}
                            </Badge>
                            {conversation.isEscalated && (
                              <Badge variant="destructive">
                                Escalated
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                              <Phone className="w-4 h-4" />
                              <span data-testid={`conversation-phone-${conversation.id}`}>
                                {conversation.clientPhone}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              <span>
                                Started: {new Date(conversation.startedAt).toLocaleDateString()}
                              </span>
                              <span>•</span>
                              <span>
                                Last message: {new Date(conversation.lastMessageAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" data-testid={`button-view-conversation-${conversation.id}`}>
                          View Messages
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
