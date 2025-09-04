import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building, MessageCircle, Calendar, TrendingUp, Zap, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Building className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">RealEstate AI</h1>
              <p className="text-xs text-muted-foreground">Asistente</p>
            </div>
          </div>
          <Button 
            onClick={() => window.location.href = '/api/auth/login'}
            data-testid="button-login"
          >
            Comenzar
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground">
            Automatiza tu Negocio Inmobiliario
            <span className="text-primary"> WhatsApp </span>
            con IA
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Transforma tu negocio inmobiliario con automatización de WhatsApp impulsada por IA. 
            Genera prospectos, agenda citas y cierra ventas las 24 horas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => window.location.href = '/api/auth/login'}
              data-testid="button-start-free"
            >
              Prueba Gratuita
            </Button>
            <Button variant="outline" size="lg" data-testid="button-watch-demo">
              Ver Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4 text-foreground">¿Por Qué Elegir RealEstate AI?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Nuestra plataforma combina IA de vanguardia con integraciones perfectas para revolucionar 
              cómo los profesionales inmobiliarios manejan las interacciones con clientes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card>
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">Conversaciones Inteligentes</h3>
                <p className="text-muted-foreground">
                  Chat impulsado por IA que entiende terminología inmobiliaria y guía 
                  a los prospectos en el proceso de compra de manera natural.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                  <Calendar className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">Agendamiento Automático</h3>
                <p className="text-muted-foreground">
                  Agenda visitas a propiedades y reuniones directamente por WhatsApp 
                  con integración de calendario.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">Generación de Prospectos</h3>
                <p className="text-muted-foreground">
                  Califica prospectos automáticamente e integra con tu CRM para rastrear 
                  cada cliente desde el primer contacto hasta el cierre.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-foreground">
                Todo lo que Necesitas para Hacer Crecer tu Negocio
              </h2>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Disponibilidad 24/7</h3>
                    <p className="text-muted-foreground">Tu asistente de IA nunca duerme, capturando prospectos y respondiendo preguntas las 24 horas.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Seguro y Conforme</h3>
                    <p className="text-muted-foreground">Seguridad empresarial con cumplimiento total de regulaciones inmobiliarias.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-chart-3/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Integración CRM</h3>
                    <p className="text-muted-foreground">Se conecta perfectamente con AlterEstate y otros sistemas CRM inmobiliarios populares.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg p-8">
              <div className="bg-card rounded-lg p-6 shadow-lg">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">AI</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">RealEstate AI Assistant</p>
                    <p className="text-xs text-green-600 flex items-center">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                      En línea
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="bg-primary text-primary-foreground p-3 rounded-lg max-w-xs">
                    <p className="text-sm">¡Hola! Busco una casa de 3 habitaciones en Miami por menos de $800k</p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-sm text-foreground">¡Hola! Me encantaría ayudarte a encontrar la casa perfecta en Miami. Tengo varias excelentes opciones en tu rango de presupuesto. ¿Prefieres algún barrio específico?</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4 text-primary-foreground">
            ¿Listo para Transformar tu Negocio Inmobiliario?
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Únete a cientos de profesionales inmobiliarios que ya están usando IA para 
            automatizar sus conversaciones de WhatsApp y hacer crecer su negocio.
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            onClick={() => window.location.href = '/api/auth/login'}
            data-testid="button-get-started"
          >
            Comenzar Ahora
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center">
              <Building className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">RealEstate AI Assistant</span>
          </div>
          <p className="text-muted-foreground">
            © 2025 RealEstate AI Assistant. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
