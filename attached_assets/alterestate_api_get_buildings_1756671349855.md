# GET - Buildings

This is a public documentation and it’s always changing, so keep visiting it in case there’s any update.

### 

Overview

In AlterEstate we call buildings basically anything. It can vary depending on the project structure, some projects divide their availability with buildings, others divide the availability by phases or blocks. This is fully customizable by the user and it depends on the configuration of the project. Feel free to ask the project developer how is the developer making the division of the availability in the project.

This endpoint allows you to retrieve a list of the buildings inside a real estate project. Each building has details such as its name, visibility, order, and other relevant information.

### 

HTTP Request

*   **Method**: GET
    
*   **URL**: `https://secure.alterestate.com/api/v1/projects/buildings/project_slug/`
    

### 

Request Parameters

*   None required
    

### 

Response

The API will respond with a JSON array containing real estate project buildings. Each building has the following attributes:

*   `id` (integer): The unique identifier of the building.
    
*   `uid` (string): A unique identifier for the building.
    
*   `name` (string): The name of the real estate building.
    
*   `order` (integer or null): The order of the building (null if not applicable).
    
*   `visible` (boolean): Indicates whether the building is visible.
    
*   `updated` (string): The date and time when the building was last updated.
    
*   `timestamp` (string): The date and time when the building was created.
    
*   `migrated` (boolean): Indicates whether the building data has been migrated.
    
*   `company` (integer): The identifier of the company associated with the project.
    
*   `project` (integer): The identifier of the parent project if applicable.
    

### 

Sample Response

Copy

    [
        {
            "id": 177,
            "uid": "B2BRMT7IV3",
            "name": "Eco",
            "order": 0,
            "visible": true,
            "updated": "2023-08-17T11:52:28.049936-04:00",
            "timestamp": "2020-08-26T14:47:06.364327-04:00",
            "migrated": false,
            "company": 2,
            "project": 152
        },
        {
            "id": 1692,
            "uid": "DKL5NWV34A",
            "name": "Bio",
            "order": 0,
            "visible": true,
            "updated": "2023-08-17T11:52:35.060068-04:00",
            "timestamp": "2022-03-16T02:16:31.379019-04:00",
            "migrated": true,
            "company": 2,
            "project": 152
        },
        {
            "id": 7,
            "uid": "40Y7CQU80J",
            "name": "Art",
            "order": 1,
            "visible": true,
            "updated": "2023-08-17T11:52:27.039334-04:00",
            "timestamp": "2020-07-27T10:42:46.619218-04:00",
            "migrated": false,
            "company": 2,
            "project": 152
        }
    ]

### 

Status Codes

*   200 OK: The request was successful, and the response contains the list of real estate projects.
    
*   404 Not Found: The requested resource or endpoint does not exist.
    
*   500 Internal Server Error: An error occurred on the server while processing the request.
    

### 

Usage Example

You can use this endpoint to retrieve a list of real estate projects available in your system. This information can be useful for displaying a list of available projects to users on your real estate website or application.

Last updated 1 year ago

