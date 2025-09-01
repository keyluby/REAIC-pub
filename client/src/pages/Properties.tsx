import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import MainLayout from "@/components/Layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Building, Search, Filter, Bed, Bath, Square, Globe, Plus, Play, Clock, CheckCircle, XCircle, ExternalLink, Image, Eye, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface ScrapedWebsite {
  id: string;
  name: string;
  url: string;
  description?: string;
  isActive: boolean;
  lastScrapedAt?: string;
  scrapingInterval: number;
  propertiesCount: number;
}

interface ScrapedProperty {
  id: string;
  title: string;
  price?: number;
  priceText?: string;
  currency?: string;
  location?: string;
  city?: string;
  sector?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  areaUnit?: string;
  propertyType?: string;
  listingType?: string;
  description?: string;
  sourceUrl: string;
  images: Array<{
    id: string;
    imageUrl: string;
    isFeatured: boolean | null;
    altText: string | null;
  }>;
}

export default function Properties() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("websites");
  const [isAddWebsiteOpen, setIsAddWebsiteOpen] = useState(false);
  const [newWebsite, setNewWebsite] = useState({ name: "", url: "", description: "" });
  const [showUrlsDialog, setShowUrlsDialog] = useState(false);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);

  // Consultas para obtener datos
  const { data: websites = [], isLoading: websitesLoading } = useQuery({
    queryKey: ['/api/scraping/websites'],
    enabled: isAuthenticated
  });

  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ['/api/scraping/properties'],
    enabled: isAuthenticated
  });

  const { data: schedulerStatus = {}, isLoading: schedulerLoading } = useQuery({
    queryKey: ['/api/scraping/scheduler/status'],
    enabled: isAuthenticated,
    refetchInterval: 30000 // Actualizar cada 30 segundos
  });

  // Mutaciones
  const analyzeSiteMutation = useMutation({
    mutationFn: async (data: { url: string; name: string; description?: string }) => {
      const response = await fetch('/api/scraping/analyze-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Error al analizar el sitio web');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Sitio web analizado", description: "El sitio web se ha configurado correctamente" });
      queryClient.invalidateQueries({ queryKey: ['/api/scraping/websites'] });
      setIsAddWebsiteOpen(false);
      setNewWebsite({ name: "", url: "", description: "" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Error al analizar el sitio web",
        variant: "destructive" 
      });
    }
  });

  const runScrapingMutation = useMutation({
    mutationFn: async (websiteId: string) => {
      const response = await fetch(`/api/scraping/run-scraping/${websiteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Error al iniciar el scraping');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Scraping iniciado", description: "El proceso de extracción ha comenzado" });
      queryClient.invalidateQueries({ queryKey: ['/api/scraping/scheduler/status'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Error al iniciar el scraping",
        variant: "destructive" 
      });
    }
  });

  // Query para obtener URLs descubiertas
  const { data: discoveredUrls, isLoading: urlsLoading } = useQuery({
    queryKey: ['/api/scraping/discover-urls', selectedWebsiteId],
    enabled: !!selectedWebsiteId && showUrlsDialog,
    queryFn: async () => {
      const response = await fetch(`/api/scraping/discover-urls/${selectedWebsiteId}`);
      if (!response.ok) throw new Error('Error al descubrir URLs');
      return response.json();
    }
  });

  // Mutación para scrapear URLs seleccionadas
  const scrapeSelectedMutation = useMutation({
    mutationFn: async ({ websiteId, urls }: { websiteId: string; urls: string[] }) => {
      const response = await fetch('/api/scraping/scrape-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteId, selectedUrls: urls })
      });
      if (!response.ok) throw new Error('Error al iniciar scraping selectivo');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Scraping iniciado", description: data.message || "Extracción selectiva iniciada" });
      setShowUrlsDialog(false);
      setSelectedUrls([]);
      queryClient.invalidateQueries({ queryKey: ['/api/scraping/properties'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scraping/scheduler/status'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Error al iniciar scraping selectivo",
        variant: "destructive" 
      });
    }
  });

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

  const handleAddWebsite = () => {
    if (!newWebsite.name.trim() || !newWebsite.url.trim()) {
      toast({ 
        title: "Error", 
        description: "Por favor completa el nombre y la URL del sitio web",
        variant: "destructive" 
      });
      return;
    }
    
    analyzeSiteMutation.mutate(newWebsite);
  };

  // Funciones para manejo de URLs
  const handleDiscoverUrls = (websiteId: string) => {
    setSelectedWebsiteId(websiteId);
    setShowUrlsDialog(true);
    setSelectedUrls([]);
  };

  const handleUrlToggle = (url: string) => {
    setSelectedUrls(prev => {
      if (prev.includes(url)) {
        return prev.filter(u => u !== url);
      } else {
        return [...prev, url];
      }
    });
  };

  const handleSelectAll = () => {
    if (discoveredUrls?.urls) {
      setSelectedUrls(discoveredUrls.urls.map((item: any) => item.url));
    }
  };

  const handleDeselectAll = () => {
    setSelectedUrls([]);
  };

  const handleScrapeSelected = () => {
    if (selectedWebsiteId && selectedUrls.length > 0) {
      scrapeSelectedMutation.mutate({
        websiteId: selectedWebsiteId,
        urls: selectedUrls
      });
    }
  };

  const filteredProperties = (properties as ScrapedProperty[]).filter((property: ScrapedProperty) =>
    property.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    property.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    property.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-80 bg-muted rounded-lg"></div>
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-2 text-foreground">Gestión de Propiedades</h2>
            <p className="text-muted-foreground">
              Configura sitios web para extraer propiedades automáticamente y gestiona tu inventario
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="websites" data-testid="tab-websites">
              <Globe className="w-4 h-4 mr-2" />
              Sitios Web
            </TabsTrigger>
            <TabsTrigger value="properties" data-testid="tab-properties">
              <Building className="w-4 h-4 mr-2" />
              Propiedades ({(properties as ScrapedProperty[]).length})
            </TabsTrigger>
            <TabsTrigger value="scheduler" data-testid="tab-scheduler">
              <Clock className="w-4 h-4 mr-2" />
              Automatización
            </TabsTrigger>
          </TabsList>

          {/* Pestaña: Sitios Web */}
          <TabsContent value="websites" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Sitios Web Configurados</h3>
              <Dialog open={isAddWebsiteOpen} onOpenChange={setIsAddWebsiteOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-website">
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Sitio Web
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Agregar Sitio Web</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="website-name">Nombre del sitio</Label>
                      <Input
                        id="website-name"
                        placeholder="ej. Inmobiliaria ABC"
                        value={newWebsite.name}
                        onChange={(e) => setNewWebsite(prev => ({ ...prev, name: e.target.value }))}
                        data-testid="input-website-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website-url">URL del sitio web</Label>
                      <Input
                        id="website-url"
                        placeholder="https://ejemplo.com"
                        value={newWebsite.url}
                        onChange={(e) => setNewWebsite(prev => ({ ...prev, url: e.target.value }))}
                        data-testid="input-website-url"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website-description">Descripción (opcional)</Label>
                      <Textarea
                        id="website-description"
                        placeholder="Descripción del sitio web..."
                        value={newWebsite.description}
                        onChange={(e) => setNewWebsite(prev => ({ ...prev, description: e.target.value }))}
                        data-testid="textarea-website-description"
                      />
                    </div>
                    <Button 
                      onClick={handleAddWebsite} 
                      disabled={analyzeSiteMutation.isPending}
                      className="w-full"
                      data-testid="button-confirm-add-website"
                    >
                      {analyzeSiteMutation.isPending ? 'Analizando...' : 'Agregar y Analizar'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {websitesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="h-40">
                    <CardContent className="p-4 animate-pulse">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
                      <div className="h-8 bg-muted rounded w-full"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (websites as ScrapedWebsite[]).length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No hay sitios web configurados</h3>
                  <p className="text-muted-foreground mb-4">
                    Agrega sitios web inmobiliarios para extraer propiedades automáticamente
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(websites as ScrapedWebsite[]).map((website: ScrapedWebsite) => (
                  <Card key={website.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{website.name}</CardTitle>
                        <Badge variant={website.isActive ? "default" : "secondary"}>
                          {website.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{website.url}</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Propiedades:</span>
                          <span className="font-medium">{website.propertiesCount || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Último scraping:</span>
                          <span className="font-medium">
                            {website.lastScrapedAt 
                              ? new Date(website.lastScrapedAt).toLocaleDateString()
                              : 'Nunca'
                            }
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Intervalo:</span>
                          <span className="font-medium">{website.scrapingInterval}h</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDiscoverUrls(website.id)}
                          data-testid={`button-discover-urls-${website.id}`}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Ver URLs
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => runScrapingMutation.mutate(website.id)}
                          disabled={runScrapingMutation.isPending}
                          data-testid={`button-run-scraping-${website.id}`}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Ejecutar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => window.open(website.url, '_blank')}
                          data-testid={`button-visit-website-${website.id}`}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Pestaña: Propiedades */}
          <TabsContent value="properties" className="space-y-6">
            <div className="flex items-center space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar propiedades..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-properties"
                />
              </div>
            </div>

            {propertiesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="h-80">
                    <div className="h-48 bg-muted animate-pulse"></div>
                    <CardContent className="p-4 space-y-2">
                      <div className="h-4 bg-muted rounded animate-pulse"></div>
                      <div className="h-3 bg-muted rounded w-3/4 animate-pulse"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredProperties.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {(properties as ScrapedProperty[]).length === 0 ? 'No hay propiedades extraídas' : 'No se encontraron propiedades'}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {(properties as ScrapedProperty[]).length === 0 
                      ? 'Las propiedades aparecerán aquí después de configurar y ejecutar el scraping'
                      : 'Intenta ajustar tu búsqueda'
                    }
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProperties.map((property: ScrapedProperty) => {
                  const featuredImage = property.images?.find(img => img.isFeatured)?.imageUrl || property.images?.[0]?.imageUrl;
                  
                  return (
                    <Card key={property.id} className="overflow-hidden">
                      <div className="h-48 relative">
                        {featuredImage ? (
                          <img 
                            src={featuredImage} 
                            alt={property.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder-property.jpg';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Image className="w-12 h-12 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary">
                            {property.listingType === 'sale' ? 'Venta' : 'Alquiler'}
                          </Badge>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-medium mb-2 line-clamp-2">{property.title}</h3>
                        <p className="text-lg font-bold text-primary mb-2">
                          {property.price 
                            ? `${property.currency || 'RD$'} ${property.price.toLocaleString()}`
                            : property.priceText || 'Precio a consultar'
                          }
                        </p>
                        <p className="text-sm text-muted-foreground mb-3">
                          {property.sector && `${property.sector}, `}{property.city}
                        </p>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-3">
                          {property.bedrooms && (
                            <div className="flex items-center">
                              <Bed className="w-3 h-3 mr-1" />
                              {property.bedrooms}
                            </div>
                          )}
                          {property.bathrooms && (
                            <div className="flex items-center">
                              <Bath className="w-3 h-3 mr-1" />
                              {property.bathrooms}
                            </div>
                          )}
                          {property.area && (
                            <div className="flex items-center">
                              <Square className="w-3 h-3 mr-1" />
                              {property.area}{property.areaUnit || 'm²'}
                            </div>
                          )}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => window.open(property.sourceUrl, '_blank')}
                          data-testid={`button-view-property-${property.id}`}
                        >
                          <ExternalLink className="w-3 h-3 mr-2" />
                          Ver Original
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Pestaña: Scheduler */}
          <TabsContent value="scheduler" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Sitios Activos</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">{(schedulerStatus as any)?.activeWebsites || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Trabajos Pendientes</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">{(schedulerStatus as any)?.pendingJobs || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">Completados Hoy</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">{(schedulerStatus as any)?.completedJobs || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium">Errores Hoy</span>
                  </div>
                  <p className="text-2xl font-bold mt-2">{(schedulerStatus as any)?.failedJobs || 0}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="w-5 h-5" />
                  <span>Estado del Scheduler Automático</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Scheduler</p>
                    <p className="text-sm text-muted-foreground">
                      {(schedulerStatus as any)?.isRunning ? 'En funcionamiento' : 'Detenido'}
                    </p>
                  </div>
                  <Badge variant={(schedulerStatus as any)?.isRunning ? "default" : "secondary"}>
                    {(schedulerStatus as any)?.isRunning ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                
                {(schedulerStatus as any)?.lastRunTime && (
                  <div>
                    <p className="font-medium">Última Ejecución</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date((schedulerStatus as any).lastRunTime).toLocaleString()}
                    </p>
                  </div>
                )}
                
                <div className="pt-4 border-t">
                  <div className="flex items-start space-x-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Scraping Automático</p>
                      <p className="text-muted-foreground">
                        El sistema revisa cada sitio web según su intervalo configurado y extrae 
                        automáticamente las nuevas propiedades disponibles.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Diálogo para mostrar URLs encontradas */}
        <Dialog open={showUrlsDialog} onOpenChange={setShowUrlsDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>URLs de Propiedades Encontradas</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Selecciona las propiedades que deseas agregar a tu base de datos
              </p>
            </DialogHeader>

            {urlsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Descubriendo URLs...</p>
                </div>
              </div>
            ) : discoveredUrls?.urls ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Se encontraron {discoveredUrls.urls.length} propiedades
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSelectAll}
                      data-testid="button-select-all"
                    >
                      Seleccionar Todas
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDeselectAll}
                      data-testid="button-deselect-all"
                    >
                      Deseleccionar Todas
                    </Button>
                  </div>
                </div>

                <div className="border rounded-lg">
                  <div className="max-h-96 overflow-y-auto">
                    {discoveredUrls.urls.map((item: any, index: number) => (
                      <div
                        key={item.url}
                        className={`p-4 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          selectedUrls.includes(item.url) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                        data-testid={`property-url-item-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedUrls.includes(item.url)}
                            onCheckedChange={() => handleUrlToggle(item.url)}
                            data-testid={`checkbox-url-${index}`}
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm mb-1 truncate">
                              {item.title}
                            </h4>
                            {item.preview && (
                              <p className="text-xs text-muted-foreground mb-2">
                                {item.preview}
                              </p>
                            )}
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline truncate block"
                              data-testid={`link-property-${index}`}
                            >
                              {item.url}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    {selectedUrls.length} propiedades seleccionadas
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowUrlsDialog(false)}
                      data-testid="button-cancel-urls"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleScrapeSelected}
                      disabled={selectedUrls.length === 0 || scrapeSelectedMutation.isPending}
                      data-testid="button-scrape-selected"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      {scrapeSelectedMutation.isPending ? 'Procesando...' : `Extraer ${selectedUrls.length} Propiedades`}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No se encontraron URLs de propiedades</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
