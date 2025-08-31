# GET - Units | AlterEstate Developers Center

This is a public documentation and it’s always changing, so keep visiting it in case there’s any update.

### 

Overview

This endpoint allows you to retrieve a list of real estate units from a specific real estate project. Real estate units include details such as property model, name, floor level, area, number of rooms, bathrooms, parking spaces, status, sale price, and more.

### 

HTTP Request

*   **Method**: GET
    
*   **URL**: `secure.alterestate.com/api/v1/properties/public/units/project_slug/`
    

### 

Request Parameters

*   None required
    

### 

Response

The API will respond with a JSON array containing real estate unit objects. Each object has the following attributes:

*   `order` (integer): The order of the unit in the project.
    
*   `project_model` (string): The name of the real estate unit.
    
*   `name` (string): The name of the real estate project.
    
*   `total_floors` (integer): The total number of floors the unit has.
    
*   `floor_level` (integer or null): The floor level of the unit within the building. (null if not applicable)
    
*   `property_area` (float or null): The area of the property in square meters. (null if not applicable)
    
*   `terrace_area` (float or null): The area of the terrace in square meters. (null if not applicable)
    
*   `parkinglot_area` (float or null): The area of the parking lot in square meters. (null if not applicable)
    
*   `terrain_area` (float or null): The area of the terrain in square meters. (null if not applicable)
    
*   `room` (integer): The number of rooms in the unit.
    
*   `bathroom` (float): The number of bathrooms in the unit.
    
*   `half_bathrooms` (float or null): The number of half bathrooms in the unit. (null if not applicable)
    
*   `parkinglot` (integer): The number of parking spaces associated with the unit.
    
*   `status` (string): The status of the unit (e.g., "Available," "Sold," "Under Construction").
    
*   `currency_sale` (string): The currency used for the sale price (e.g., "USD").
    
*   `sale_price` (float): The sale price of the unit.
    
*   `building` (string): The name or identifier of the building within the project.
    
*   `project_stage` (string or null): The stage of the project (e.g., "Phase 1," "Phase 2"). (null if not applicable)
    
*   `layout` (string or null): A URL to the layout or floor plan of the unit. (null if not available)
    

### 

**Unit Statuses**

*   Disponible: status="1"
    
*   Reservado: status="2"
    
*   Vendido: status="3"
    
*   Bloqueado: status="11"
    

### 

**Sample response:**

Copy

    [
        {
            "order": 0,
            "project_model": "Modelo A",
            "name": "Proyecto de Apartamentos Orlando",
            "total_floors": 10,
            "floor_level": 3,
            "property_area": 120.0,
            "terrace_area": null,
            "parkinglot_area": null,
            "terrain_area": null,
            "room": 3,
            "bathroom": 2.0,
            "half_bathrooms": null,
            "parkinglot": 2,
            "status": "3",
            "currency_sale": "USD",
            "sale_price": 320000.0,
            "building": "Torre 06",
            "project_stage": "0",
            "layout": "https://google.com"
        },
        {
            "order": 1,
            "project_model": "Modelo A",
            "name": "Proyecto de Apartamentos Orlando",
            "total_floors": 10,
            "floor_level": null,
            "property_area": null,
            "terrace_area": null,
            "parkinglot_area": null,
            "terrain_area": null,
            "room": 3,
            "bathroom": 2.0,
            "half_bathrooms": null,
            "parkinglot": 2,
            "status": "3",
            "currency_sale": "USD",
            "sale_price": 300000.0,
            "building": "Bio",
            "project_stage": null,
            "layout": null
        },
    ]

### 

Status Codes

*   200 OK: The request was successful, and the response contains the list of real estate units.
    
*   404 Not Found: The requested resource or endpoint does not exist.
    
*   500 Internal Server Error: An error occurred on the server while processing the request.
    

### 

Usage Example

You can use this endpoint to retrieve a list of real estate units for a specific project and display them on your real estate website or application. The information provided in the response can help potential buyers or renters make informed decisions about available units.

Last updated 1 year ago

