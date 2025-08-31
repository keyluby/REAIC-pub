# List All Properties

## 

🏘️ Properties API

The Properties API allows developers to integrate their websites or software with the AlterEstate property listings.

> 🔄 This documentation is subject to change. Please check regularly for updates.

### 

🔗 Endpoint

**GET** `https://secure.alterestate.com/api/v1/properties/filter/`

### 

🔐 Headers

Header

Value

`aetoken`

`your_public_token`

To obtain your token, navigate to your **AlterEstate dashboard > Settings > Public API Token** (admin access required).

### 

🔍 Available Query Parameters

#### 

🧭 Location

Parameter

Description

`city`

City ID

`city_name`

Open string to search properties by the name of the city, case and accent insensitive. _(e.g. Santo Domingo, Santiago, Ciudad de México, etc.)_

`sector`

Sector ID

`province`

Province ID (if supported)

`search`

Open string to search properties by the name of the sector or neighborhood, case and accent insensitive. _(e.g. Los Prados, Bella Vista, Naco, Reforma etc.)_

#### 

🏷️ Category & Listing Type

Parameter

Description

Accepted Values

`listing_type`

Type of operation

`1`: Sale, `2`: Rent

`category`

Property category

See table below

`condition`

Property condition

`9`: Ready, `5`: In Construction

**Property Categories**

ID

Name

1

Apartments

2

Houses

3

Buildings

4

Lots

5

Hotels

6

Business Premises

7

Industrial Ships

10

Penthouse

13

Villas

14

Lofts

17

Townhouses

#### 

💰 Price Filtering (Requires currency and listing\_type parameters)

Parameter

Description

`currency`

Currency to convert values internally

`value_min`

Minimum value to filter

`value_max`

Maximum value to filter

`listing_type`

**Required** to apply pricing filter

**Supported currencies:** `USD`, `DOP`, `MXN`, `COP`, `CRC`, `GTQ`, `PEN`

> 💡 Price filtering is backend-converted. You can pass any currency and the system will match values using real-time internal exchange rates.

#### 

🛏️ Property Features

Parameter

Description

`rooms`

Minimum rooms

`rooms_min`

Minimum number of rooms

`rooms_max`

Maximum number of rooms

`bathrooms`

Minimum number of bathrooms

`bath_min`

Minimum number of bathrooms

`bath_max`

Maximum number of bathrooms

`parkings`

Minimum number of parking spaces

`parking_min`

Minimum parking spaces

`parking_max`

Maximum parking spaces

`area_min`

Minimum area in m²

`area_max`

Maximum area in m²

#### 

👤 Agent & Features

Parameter

Description

`agents`

UID of the agent

`features`

List of feature IDs (see below)

**Sample Feature IDs**

ID

Feature

74

Pool

77

Shared Terrace

516

Exclusive Terrace

73

Gym

66

White line

#### 

🔀 Sorting

Parameter

Description

`sort`

Sorting order by value

`us_saleprice`

Ascending by sale price

`-us_saleprice`

Descending by sale price

### 

📦 Example Response

Copy

    {
      "count": 74,
      "next": "https://secure.alterestate.com/api/v1/properties/filter/?page=2",
      "previous": null,
      "results": [
        {
          "cid": 292960,
          "uid": "JSORJ9S5AY",
          "name": "Modern Apartment",
          "category": {
            "id": 1,
            "name": "Apartments",
            "name_en": "Apartments"
          },
          "listing_type": [
            { "id": 1, "listing": "Venta" }
          ],
          "sale_price": 100000.0,
          "currency_sale": "USD",
          "city": "Distrito Nacional",
          "sector": "16 De Agosto",
          "short_description": "Great apartment in prime area."
        }
      ]
    }

### 

⚙️ HTTP Status Codes

Code

Meaning

200

✅ Request was successful

404

❌ Resource or endpoint not found

500

❌ Server error while processing

### 

📘 Notes on Price Filtering

All currency-based filters are processed on the backend. You can freely pass `value_min` and `value_max` in any supported currency. For example:

*   Property price: RD$ 4,000,000
    
*   Currency used in query: USD
    
*   Exchange rate: 58.00
    
*   Final calculation: 4,000,000 / 58 = **US$ 68,965**
    

This property will appear in a query range of `value_min=65000&value_max=70000&currency=USD`

> ✅ No need to convert prices manually in your frontend. Let AlterEstate handle the exchange logic.

Last updated 1 month ago

