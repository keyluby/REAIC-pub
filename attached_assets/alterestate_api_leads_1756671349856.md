# Leads | AlterEstate Developers Center

## 

📩 Submit a Lead to AlterEstate

You can use this endpoint to send leads directly into your AlterEstate account. This allows you to connect forms, landing pages, or any external sources where you capture lead information.

### 

🔒 Authentication

All requests must include the following header:

Copy

    Authorization: Token your_api_key_here

Replace `your_api_key_here` with the API key provided in your AlterEstate dashboard.

### 

📤 Endpoint

**POST** `https://secure.alterestate.com/api/v1/leads/`

### 

📝 Request Body

Send a JSON payload with the lead data. Below is an example of a minimal valid request:

Copy

    {
      "full_name": "John Doe",
      "phone": "8091234567",
      "email": "johndoe@email.com"
    }

You may also include the following **optional fields** to enhance your tracking and routing:

Field

Type

Description

`full_name`

`string`

**Required.** Lead's full name.

`phone`

`string`

**Required.** Lead's phone number.

`email`

`string`

**Required.** Lead's email address.

`property_uid`

`string`

Optional**.** Unique identifier of the property.

`utm_source`

`string`

Optional. UTM parameter for the source (e.g. Facebook, Google).

`utm_campaign`

`string`

Optional. UTM parameter for the campaign name.

`utm_content`

`string`

Optional. UTM parameter for ad creative or content.

`utm_medium`

`string`

Optional. UTM parameter for the marketing medium (e.g. cpc, email).

`utm_term`

`string`

Optional. UTM parameter for the search keyword.

`adset_name`

`string`

Optional. Name of the ad set (if applicable).

`campaign_name`

`string`

Optional. Name of the campaign (if applicable).

`form_name`

`string`

Optional. Identifier of the form that collected the lead.

`platform`

`string`

Optional. Platform where the lead originated (e.g. Facebook, Instagram).

`round_robin`

`string`

Optional. UID of the round robin rule to assign the lead.

`listing_type`

`string`

Optional. Indicates if the lead is interested in renting or buying.

`related`

`string`

Optional. Email of the user you want to assign the lead to. Important: If round\_robin is in the data, it will take the round\_robin as a more important field for assignment.

`notes`

`string`

Optional. Any extra notes or message from the lead.

`via`

`string`

Optional. Channel ID through which the lead was received (e.g. WhatsApp, web form).

### 

✅ Successful Response

Copy

    {
        "status": 201,
        "data": {
            "id": 1238837,
            "company": 0,
            "uid": "D9dEML2g39",
            "full_name": "Test Lead",
            "email": "testlead@mail.com",
            "description": "Creado a través de la API de Leads.<br/><strong>Via o Canal:</strong> Sin Vía<br/><strong>Notas:</strong>No hay ninguna nota.",
            "via": 104,
            "phone": "+0000000000",
            "distinct_id": null,
            "ctype": 37,
            "related_contacts": []
        },
        "log_id": 453995,
        "deal_id": 640682
    }

### 

❌ Error Response Example

Copy

    {
      "status": "error",
      "message": "Missing required field: phone"
    }

### 

📌 Notes

*   UTM parameters help you track the origin of the lead for better attribution.
    
*   If `round_robin` is not specified, the lead will follow your company's default assignment logic.
    
*   If the lead already exists in your system and duplicate contacts are disabled, no new contact will be created.
    

### 

🧠 Duplicate Lead Handling

AlterEstate provides a configuration setting per company to allow or disallow duplicate contacts.

If **duplicates are not allowed**, and a contact with the same phone or email already exists, **the system will not create a new contact or deal**. Instead:

*   It will notify the agent who owns the existing contact.
    
*   It will return a response indicating the lead already exists.
    

#### 

🔁 Response for Duplicate Contact

Copy

    {
      "status": 200,
      "message": "This contact already exists. No new deal was created.",
      "log_id": "LOG123456"
    }

Field

Type

Description

`status`

`number`

Always `200`, since the request was processed successfully.

`message`

`string`

Explains that no new deal was created due to duplicate contact.

`log_id`

`string`

ID of the internal log entry created for tracking this event.

> ✅ If your company prefers to allow duplicates (for example, if the same person can inquire multiple times), you can adjust this setting in your AlterEstate company configuration panel.

Last updated 2 months ago

