# Agents | AlterEstate Developers Center

This is a public documentation and it’s always changing, so keep visiting it in case there’s any update.

### 

Overview

This endpoint allows users to create new leads in the system. It requires a `GET` request to the specified URL with the necessary headers and payload.

### 

HTTP Request

*   **Method**: `GET`
    
*   **URL**: `https://secure.alterestate.com/api/v1/agents/`
    

### 

Headers

Copy

    {
        "aetoken": "token_publico"
    }

### 

**Obtaining AE Token**

To get your Public AE API Token, navigate to your account in AlterEstate, go to Settings, and locate your Public API Token. This requires an administrator account.

### 

Response

The API will respond with a JSON array containing all the agents in the company.

**Note:** Inactive agents won\'t show on this reponse.

*   200 OK: The request was successful, and the response contains the list of real estate projects.
    
*   404 Not Found: The requested resource or endpoint does not exist.
    
*   500 Internal Server Error: An error occurred on the server while processing the request.
    

Copy

    [
        {
            "id": 0,
            "uid": "ABCDEFGHJKLM",
            "slug": "john-doe",
            "first_name": "John",
            "last_name": "Doe",
            "full_name": "John Doe",
            "email": "johndoe@alterestate.com",
            "phone": "+14070000000",
            "priority": 0.0,
            "position": "Agente Inmobiliario",
            "avatar": "https://d2p0bx8wfdkjkb.cloudfront.net/static/user-67/MjhvE75QoE-Screenshot_2023-09-27_at_12.40.54_PM.png",
            "division": "Santo Domingo",
            "facebook_username": "alterestatedr",
            "instagram_username": "alterestate",
            "rate": null,
            "team": "Team Mota",
            "user_type": "1",
            "company": "DEMO ALTERESTATE",
            "bio": "<p>sdfgh</p>",
            "properties": 67,
            "company_domain": "demo.alterestate.com"
        },
    ...
    ]

Last updated 12 months ago

