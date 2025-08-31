# Property Detail View

This is a public documentation and it’s always changing, so keep visiting it in case there’s any update.

### 

Overview

This endpoint allows you to retrieve the detail view of a property including assigned agent, photo gallery, amenities and more. The property slug can be found inside the [List View API]().

### 

HTTP Request

*   **Method**: GET
    
*   **URL**: `https://secure.alterestate.com/api/v1/properties/view/property_slug/`
    

### 

Request Parameters

*   None required
    

### 

**Sample response:**

Copy

    {
        "cid": 292960,
        "uid": "JSORJ9S5AY",
        "sector_id": 2234,
        "city_id": 156,
        "name": "asd",
        "slug": "asd-292960",
        "room": null,
        "bathroom": null,
        "half_bathrooms": null,
        "parkinglot": null,
        "condition": null,
        "currency_sale": "USD",
        "currency_rent": "USD",
        "currency_rental": "USD",
        "currency_furnished": "USD",
        "currency_maintenance": "USD",
        "currency_sale_furnished": "USD",
        "lat_long": false,
        "style": null,
        "sale_price": 100000.0,
        "rent_price": null,
        "rental_price": null,
        "furnished_price": null,
        "furnished_sale_price": null,
        "property_area": null,
        "featured_image": null,
        "property_area_measurer": "Mt2",
        "terrain_area": null,
        "terrain_area_measurer": "Mt2",
        "canbuild": false,
        "province": "Santo Domingo de Guzmán",
        "city": "Distrito Nacional",
        "maintenance_fee": null,
        "sector": "16 De Agosto",
        "description": "",
        "design": 1,
        "virtual_tour": null,
        "tags": [],
        "delivery_date": null,
        "timestamp": "2024-06-25T16:04:04.911927-04:00",
        "amenities": [
            "Aire acondicionado",
            "Area De Juegos Infantiles",
            "Cancha de Basket Ball",
            "Cancha de Tenis",
            "Casa Club",
            "Cine",
            "Gimnasio",
            "Jacuzzi",
            "Lobby",
            "Mini Golf",
            "Piscina",
            "Probando",
            "Recibidor",
            "Salón Multiusos",
            "Sauna",
            "Spa",
            "Sportbar"
        ],
        "listing_type": [
            {
                "id": 1,
                "listing": "Venta"
            }
        ],
        "category": {
            "id": 1,
            "name": "Apartamentos",
            "name_en": "Apartments",
            "priority": null
        },
        "gallery_image": [],
        "view_count": 0,
        "agents": [
            {
                "id": 67,
                "slug": "michael-mota-67",
                "uid": "IZHIZ6C3Z6",
                "company": 2,
                "role": 3,
                "avatar": "https://d2p0bx8wfdkjkb.cloudfront.net/static/user-67/MjhvE75QoE-Screenshot_2023-09-27_at_12.40.54_PM.png",
                "photo": null,
                "email": "info@alterestate.com",
                "first_name": "Juan",
                "last_name": "Pérez",
                "phone": "+18098474783",
                "team": 1,
                "position": "Agente Inmobiliario",
                "priority": 0.0,
                "bio": "<p>sdfgh</p>",
                "facebook_username": null,
                "instagram_username": null,
                "twitter_username": null,
                "youtubeiframe": "",
                "full_name": "Juan Pérez",
                "division": 3
            }
        ],
        "show_on_website": true,
        "mapiframe": null,
        "youtubeiframe": null,
        "short_description": "asd",
        "forSale": true,
        "forRent": false,
        "forRental": false,
        "furnished": false,
        "us_saleprice": 100000.0,
        "us_rentprice": null,
        "us_rentalprice": null,
        "us_furnished": null,
        "us_sale_furnished": null,
        "project_model": "",
        "variations": [],
        "is_project_v2": false,
        "project_values": null,
        "is_children": false,
        "floor_level": null,
        "total_floors": null,
        "year_construction": null,
        "share_comision": null,
        "show_on_propertybank": false
    }

### 

Status Codes

*   200 OK: The request was successful, and the response contains the list of real estate units.
    
*   404 Not Found: The requested resource or endpoint does not exist.
    
*   500 Internal Server Error: An error occurred on the server while processing the request.
    

### 

Usage Example

You can use this endpoint to retrieve the detail view of a property inside AlterEstate. Slug is the property identifier inside the company. Without it, the detail view of a property can't be retrieved.

Last updated 1 year ago

