import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Home, MapPin, DollarSign, Bed, Bath, Ruler, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ManualProperty {
  id: string;
  title: string;
  description?: string;
  price?: string;
  location?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: string;
  features?: string;
  images?: string;
  contactInfo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const propertyTypes = [
  'Casa',
  'Apartamento', 
  'Villa',
  'Penthouse',
  'Local Comercial',
  'Oficina',
  'Terreno',
  'Finca',
  'Otro'
];

export default function ManualProperties() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<ManualProperty | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    location: '',
    propertyType: '',
    bedrooms: '',
    bathrooms: '',
    area: '',
    features: '',
    images: '',
    contactInfo: ''
  });

  // Fetch properties
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['/api/manual-properties'],
    retry: false,
  });

  // Create property mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/manual-properties', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
          bathrooms: data.bathrooms ? parseInt(data.bathrooms) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manual-properties'] });
      toast({ title: "✅ Propiedad creada exitosamente" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "❌ Error al crear propiedad", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Update property mutation  
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/manual-properties/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...data,
          bedrooms: data.bedrooms ? parseInt(data.bedrooms) : null,
          bathrooms: data.bathrooms ? parseInt(data.bathrooms) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manual-properties'] });
      toast({ title: "✅ Propiedad actualizada exitosamente" });
      setIsDialogOpen(false);
      setEditingProperty(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "❌ Error al actualizar propiedad", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Delete property mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/manual-properties/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/manual-properties'] });
      toast({ title: "✅ Propiedad eliminada exitosamente" });
    },
    onError: (error: any) => {
      toast({ 
        title: "❌ Error al eliminar propiedad", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      price: '',
      location: '',
      propertyType: '',
      bedrooms: '',
      bathrooms: '',
      area: '',
      features: '',
      images: '',
      contactInfo: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title) {
      toast({ 
        title: "⚠️ Campo requerido", 
        description: "El título es obligatorio",
        variant: "destructive" 
      });
      return;
    }

    if (editingProperty) {
      updateMutation.mutate({ id: editingProperty.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (property: ManualProperty) => {
    setEditingProperty(property);
    setFormData({
      title: property.title,
      description: property.description || '',
      price: property.price || '',
      location: property.location || '',
      propertyType: property.propertyType || '',
      bedrooms: property.bedrooms?.toString() || '',
      bathrooms: property.bathrooms?.toString() || '',
      area: property.area || '',
      features: property.features || '',
      images: property.images || '',
      contactInfo: property.contactInfo || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar esta propiedad?')) {
      deleteMutation.mutate(id);
    }
  };

  const openNewPropertyDialog = () => {
    setEditingProperty(null);
    resetForm();
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando propiedades...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="manual-properties-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Mis Propiedades</h1>
          <p className="text-muted-foreground">
            Agrega y gestiona las propiedades de tu catálogo para que el Asistente IA pueda responder con información actualizada.
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewPropertyDialog} data-testid="button-add-property">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Propiedad
            </Button>
          </DialogTrigger>
          
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">
                {editingProperty ? 'Editar Propiedad' : 'Nueva Propiedad'}
              </DialogTitle>
              <DialogDescription>
                Completa la información de la propiedad. Solo el título es obligatorio.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ej: Casa moderna de 3 habitaciones en Bella Vista"
                    required
                    data-testid="input-title"
                  />
                </div>
                
                <div>
                  <Label htmlFor="price">Precio</Label>
                  <Input
                    id="price"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    placeholder="Ej: RD$ 8,500,000"
                    data-testid="input-price"
                  />
                </div>
                
                <div>
                  <Label htmlFor="propertyType">Tipo de Propiedad</Label>
                  <Select 
                    value={formData.propertyType} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, propertyType: value }))}
                  >
                    <SelectTrigger data-testid="select-property-type">
                      <SelectValue placeholder="Selecciona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {propertyTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="location">Ubicación</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Ej: Bella Vista, Santo Domingo"
                    data-testid="input-location"
                  />
                </div>
                
                <div>
                  <Label htmlFor="area">Área</Label>
                  <Input
                    id="area"
                    value={formData.area}
                    onChange={(e) => setFormData(prev => ({ ...prev, area: e.target.value }))}
                    placeholder="Ej: 250 m²"
                    data-testid="input-area"
                  />
                </div>
                
                <div>
                  <Label htmlFor="bedrooms">Habitaciones</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    value={formData.bedrooms}
                    onChange={(e) => setFormData(prev => ({ ...prev, bedrooms: e.target.value }))}
                    placeholder="Ej: 3"
                    data-testid="input-bedrooms"
                  />
                </div>
                
                <div>
                  <Label htmlFor="bathrooms">Baños</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    value={formData.bathrooms}
                    onChange={(e) => setFormData(prev => ({ ...prev, bathrooms: e.target.value }))}
                    placeholder="Ej: 2"
                    data-testid="input-bathrooms"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe las características principales de la propiedad..."
                  rows={3}
                  data-testid="textarea-description"
                />
              </div>
              
              <div>
                <Label htmlFor="features">Características Especiales</Label>
                <Textarea
                  id="features"
                  value={formData.features}
                  onChange={(e) => setFormData(prev => ({ ...prev, features: e.target.value }))}
                  placeholder="Ej: Piscina, terraza, parqueo cubierto, seguridad 24/7..."
                  rows={2}
                  data-testid="textarea-features"
                />
              </div>
              
              <div>
                <Label htmlFor="contactInfo">Información de Contacto</Label>
                <Textarea
                  id="contactInfo"
                  value={formData.contactInfo}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactInfo: e.target.value }))}
                  placeholder="Ej: Para más información contactar a Juan Pérez: 809-555-1234"
                  rows={2}
                  data-testid="textarea-contact"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 
                   editingProperty ? 'Actualizar' : 'Crear Propiedad'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Propiedades</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-properties">{properties.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Propiedades Activas</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-properties">
              {properties.filter((p: ManualProperty) => p.isActive).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tipos Disponibles</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-property-types">
              {new Set(properties.map((p: ManualProperty) => p.propertyType).filter(Boolean)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Properties List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((property: ManualProperty) => (
          <Card key={property.id} className="hover:shadow-lg transition-shadow" data-testid={`card-property-${property.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg leading-tight" data-testid={`text-title-${property.id}`}>
                  {property.title}
                </CardTitle>
                <Badge variant={property.isActive ? "default" : "secondary"} data-testid={`badge-status-${property.id}`}>
                  {property.isActive ? "Activa" : "Inactiva"}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3">
              {property.price && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <DollarSign className="mr-2 h-4 w-4" />
                  <span data-testid={`text-price-${property.id}`}>{property.price}</span>
                </div>
              )}
              
              {property.location && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="mr-2 h-4 w-4" />
                  <span data-testid={`text-location-${property.id}`}>{property.location}</span>
                </div>
              )}
              
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                {property.bedrooms && (
                  <div className="flex items-center">
                    <Bed className="mr-1 h-4 w-4" />
                    <span data-testid={`text-bedrooms-${property.id}`}>{property.bedrooms}</span>
                  </div>
                )}
                {property.bathrooms && (
                  <div className="flex items-center">
                    <Bath className="mr-1 h-4 w-4" />
                    <span data-testid={`text-bathrooms-${property.id}`}>{property.bathrooms}</span>
                  </div>
                )}
                {property.area && (
                  <div className="flex items-center">
                    <Ruler className="mr-1 h-4 w-4" />
                    <span data-testid={`text-area-${property.id}`}>{property.area}</span>
                  </div>
                )}
              </div>
              
              {property.propertyType && (
                <Badge variant="outline" data-testid={`badge-type-${property.id}`}>
                  {property.propertyType}
                </Badge>
              )}
              
              {property.description && (
                <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-description-${property.id}`}>
                  {property.description}
                </p>
              )}
              
              <div className="flex justify-end space-x-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleEdit(property)}
                  data-testid={`button-edit-${property.id}`}
                >
                  <Edit className="mr-1 h-3 w-3" />
                  Editar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleDelete(property.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-${property.id}`}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Eliminar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {properties.length === 0 && (
        <div className="text-center py-12" data-testid="empty-state">
          <Home className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No hay propiedades aún</h3>
          <p className="text-muted-foreground mb-4">
            Comienza agregando propiedades a tu catálogo para que el Asistente IA pueda responder a tus clientes.
          </p>
          <Button onClick={openNewPropertyDialog} data-testid="button-add-first-property">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Primera Propiedad
          </Button>
        </div>
      )}
    </div>
  );
}