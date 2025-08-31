# Locations | AlterEstate Developers Center

Use the Location API to retrieve geographic data such as cities and sectors available in AlterEstate. This is especially useful for dynamic forms, search filters, or any functionality where location data is needed.

> 👁️ This documentation is public and may be updated frequently. Please revisit for the latest improvements or changes.

### 

📍 List Cities

Retrieve a list of cities by country.

#### 

🔗 Endpoint

**GET** `https://secure.alterestate.com/api/v1/cities/`

#### 

🔐 Headers

Copy

    {
      "Content-Type": "application/json"
    }

#### 

🔧 Query Parameters

Parameter

Type

Required

Description

`country`

`number`

✅ Yes

The ID of the country to retrieve cities from. See country codes below.

#### 

📥 Example Request

Copy

    https://secure.alterestate.com/api/v1/cities/?country=149

#### 

✅ Successful Response

Copy

    [
      {
        "name": "Santo Domingo D.N.",
        "id": 156,
        "province": { "name": "Santo Domingo de Guzmán", "id": 31 }
      },
      {
        "name": "Punta Cana",
        "id": 60,
        "province": { "name": "La Altagracia", "id": 13 }
      },
      {
        "name": "Bávaro",
        "id": 59,
        "province": { "name": "La Altagracia", "id": 13 }
      }
    ]

#### 

🌎 Supported Countries and IDs

Country

ID

Dominican Republic

149

Panama

60

Colombia

198

Guatemala

199

Chile

201

Ecuador

202

Mexico

203

Peru

208

United States

209

Puerto Rico

212

### 

🗺️ List Sectors

Retrieve a list of sectors (neighborhoods) within a specific city.

#### 

🔗 Endpoint

**GET** `/api/v1/sectors/`

#### 

🔐 Headers

Copy

    {
      "Content-Type": "application/json"
    }

#### 

🔧 Query Parameters

Parameter

Type

Required

Description

`city`

`number`

✅ Yes

The ID of the city to retrieve sectors for. Use the List Cities API to find valid city IDs.

#### 

📥 Example Request

Copy

    https://secure.alterestate.com/api/v1/sectors/?city=156

#### 

✅ Successful Response

Copy

    [
      {
        "name": "24 De Abril",
        "id": 2350,
        "city": "Santo Domingo D.N.",
        "province": { "name": "Santo Domingo de Guzmán", "id": 31 }
      },
      {
        "name": "Altos De Arroyo Hondo",
        "id": 1669,
        "city": "Santo Domingo D.N.",
        "province": { "name": "Santo Domingo de Guzmán", "id": 31 }
      },
      {
        "name": "Altos De Arroyo Hondo II",
        "id": 87530,
        "city": "Santo Domingo D.N.",
        "province": { "name": "Santo Domingo de Guzmán", "id": 31 }
      }
    ]

### 

📌 Notes

*   The Location API is **read-only** and does not require authentication.
    
*   Always keep your local cache of cities/sectors updated if you’re storing them client-side.
    
*   We recommend refreshing this data periodically or pulling it dynamically to ensure accuracy.
    

Last updated 4 months ago

