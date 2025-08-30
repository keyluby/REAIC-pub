import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import MainLayout from "@/components/Layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, User, Phone, Mail, MapPin, DollarSign, Calendar } from "lucide-react";

export default function Leads() {
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

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["/api/leads"],
    enabled: isAuthenticated,
  });

  if (isLoading || leadsLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NEW':
        return 'bg-blue-500/10 text-blue-600';
      case 'CONTACTED':
        return 'bg-yellow-500/10 text-yellow-600';
      case 'QUALIFIED':
        return 'bg-purple-500/10 text-purple-600';
      case 'CONVERTED':
        return 'bg-green-500/10 text-green-600';
      case 'LOST':
        return 'bg-red-500/10 text-red-600';
      default:
        return 'bg-gray-500/10 text-gray-600';
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold mb-2 text-foreground">Prospectos</h2>
          <p className="text-muted-foreground">
            Rastrea y administra prospectos generados a través de conversaciones de IA
          </p>
        </div>

        {/* Leads List */}
        {!leads || leads.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No leads yet</h3>
              <p className="text-muted-foreground">
                Start conversations through WhatsApp to generate your first leads
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {leads.map((lead: any) => (
              <Card key={lead.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg" data-testid={`lead-name-${lead.id}`}>
                          {lead.fullName}
                        </CardTitle>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
                          <div className="flex items-center space-x-1">
                            <Phone className="w-4 h-4" />
                            <span data-testid={`lead-phone-${lead.id}`}>{lead.phone}</span>
                          </div>
                          {lead.email && (
                            <div className="flex items-center space-x-1">
                              <Mail className="w-4 h-4" />
                              <span data-testid={`lead-email-${lead.id}`}>{lead.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(lead.status)}>
                        {lead.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {lead.source}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {lead.budget && (
                      <div className="flex items-center space-x-2 text-sm">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: lead.budgetCurrency || 'USD'
                          }).format(lead.budget)}
                        </span>
                      </div>
                    )}
                    
                    {lead.preferredLocation && (
                      <div className="flex items-center space-x-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground" data-testid={`lead-location-${lead.id}`}>
                          {lead.preferredLocation}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Created: {new Date(lead.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  {lead.listingType && (
                    <div className="mt-3">
                      <span className="text-sm text-muted-foreground">Looking for: </span>
                      <Badge variant="outline" className="text-xs">
                        {lead.listingType === 'sale' ? 'Properties for Sale' : 'Properties for Rent'}
                      </Badge>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-end space-x-2 mt-4">
                    <Button variant="outline" size="sm" data-testid={`button-view-conversation-${lead.id}`}>
                      View Conversation
                    </Button>
                    <Button size="sm" data-testid={`button-contact-lead-${lead.id}`}>
                      Contact Lead
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
