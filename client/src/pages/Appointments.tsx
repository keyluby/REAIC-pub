import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import MainLayout from "@/components/Layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, Phone, User, CheckCircle, XCircle, Mail } from "lucide-react";

export default function Appointments() {
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

  const { data: appointments, isLoading: appointmentsLoading } = useQuery({
    queryKey: ["/api/appointments"],
    enabled: isAuthenticated,
  });

  if (isLoading || appointmentsLoading) {
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
      case 'SCHEDULED':
        return 'bg-blue-500/10 text-blue-600';
      case 'CONFIRMED':
        return 'bg-green-500/10 text-green-600';
      case 'CANCELLED':
        return 'bg-red-500/10 text-red-600';
      case 'COMPLETED':
        return 'bg-purple-500/10 text-purple-600';
      case 'NO_SHOW':
        return 'bg-orange-500/10 text-orange-600';
      default:
        return 'bg-gray-500/10 text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <CheckCircle className="w-4 h-4" />;
      case 'CANCELLED':
      case 'NO_SHOW':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold mb-2 text-foreground">Citas</h2>
          <p className="text-muted-foreground">
            Administra visitas a propiedades y reuniones agendadas a través de conversaciones de IA
          </p>
        </div>

        {/* Appointments List */}
        {!appointments || appointments.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">No appointments scheduled</h3>
              <p className="text-muted-foreground">
                Appointments will appear here when clients schedule viewings through WhatsApp
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {appointments.map((appointment: any) => (
              <Card key={appointment.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg" data-testid={`appointment-client-${appointment.id}`}>
                          {appointment.clientName}
                        </CardTitle>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
                          <div className="flex items-center space-x-1">
                            <Phone className="w-4 h-4" />
                            <span data-testid={`appointment-phone-${appointment.id}`}>
                              {appointment.clientPhone}
                            </span>
                          </div>
                          {appointment.clientEmail && (
                            <div className="flex items-center space-x-1">
                              <Mail className="w-4 h-4" />
                              <span data-testid={`appointment-email-${appointment.id}`}>
                                {appointment.clientEmail}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge className={getStatusColor(appointment.status)}>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(appointment.status)}
                        <span>{appointment.status}</span>
                      </div>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="flex items-center space-x-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground" data-testid={`appointment-date-${appointment.id}`}>
                        {new Date(appointment.scheduledAt).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">
                        {new Date(appointment.scheduledAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })} ({appointment.duration} min)
                      </span>
                    </div>
                    
                    {appointment.location && (
                      <div className="flex items-center space-x-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground" data-testid={`appointment-location-${appointment.id}`}>
                          {appointment.location}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {appointment.notes && (
                    <div className="bg-muted/50 rounded-lg p-3 mb-4">
                      <p className="text-sm text-foreground" data-testid={`appointment-notes-${appointment.id}`}>
                        {appointment.notes}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-end space-x-2">
                    {appointment.status === 'SCHEDULED' && (
                      <>
                        <Button variant="outline" size="sm" data-testid={`button-reschedule-${appointment.id}`}>
                          Reschedule
                        </Button>
                        <Button variant="outline" size="sm" data-testid={`button-cancel-${appointment.id}`}>
                          Cancel
                        </Button>
                        <Button size="sm" data-testid={`button-confirm-${appointment.id}`}>
                          Confirm
                        </Button>
                      </>
                    )}
                    {appointment.status === 'CONFIRMED' && (
                      <Button size="sm" data-testid={`button-complete-${appointment.id}`}>
                        Mark Complete
                      </Button>
                    )}
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
