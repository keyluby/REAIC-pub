import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bed, Bath, Square } from "lucide-react";

const mockProperties = [
  {
    id: "1",
    title: "Luxury Ocean View Apartment",
    location: "Downtown Miami, FL",
    price: "$850,000",
    type: "For Sale",
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    beds: 3,
    baths: 2,
    sqft: "1,200",
  },
  {
    id: "2",
    title: "Modern Family Home",
    location: "Coral Gables, FL",
    price: "$3,200/mo",
    type: "For Rent",
    image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
    beds: 4,
    baths: 3,
    sqft: "2,100",
  },
];

export default function PropertyGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {mockProperties.map((property) => (
        <Card key={property.id} className="overflow-hidden property-card hover:shadow-lg transition-all duration-300">
          <div className="relative">
            <img
              src={property.image}
              alt={property.title}
              className="w-full h-48 object-cover"
            />
            <div className="absolute top-4 left-4">
              <Badge 
                variant={property.type === "For Sale" ? "default" : "secondary"}
                className={property.type === "For Sale" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}
              >
                {property.type}
              </Badge>
            </div>
          </div>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-bold text-foreground" data-testid={`price-${property.id}`}>
                {property.price}
              </span>
            </div>
            <h4 className="font-semibold text-foreground mb-1" data-testid={`title-${property.id}`}>
              {property.title}
            </h4>
            <p className="text-sm text-muted-foreground mb-3" data-testid={`location-${property.id}`}>
              {property.location}
            </p>
            <div className="flex items-center text-sm text-muted-foreground space-x-4">
              <span className="flex items-center space-x-1">
                <Bed className="w-4 h-4" />
                <span>{property.beds} bed</span>
              </span>
              <span className="flex items-center space-x-1">
                <Bath className="w-4 h-4" />
                <span>{property.baths} bath</span>
              </span>
              <span className="flex items-center space-x-1">
                <Square className="w-4 h-4" />
                <span>{property.sqft} sqft</span>
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
