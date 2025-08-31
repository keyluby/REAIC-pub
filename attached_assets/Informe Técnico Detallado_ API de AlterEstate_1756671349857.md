# Informe Técnico Detallado: API de AlterEstate

## 1. Introducción

Este informe técnico tiene como objetivo analizar en profundidad la API de AlterEstate, una plataforma diseñada para la gestión de propiedades inmobiliarias. La API de AlterEstate ofrece una interfaz robusta y flexible que permite a desarrolladores y profesionales del sector inmobiliario integrar sus sistemas con la plataforma, facilitando la gestión de datos de propiedades, desarrollos, ubicaciones, leads y agentes. El propósito de este documento es detallar las capacidades de la API, sus métodos de interacción, los endpoints disponibles, los parámetros de solicitud, los formatos de respuesta y las consideraciones de autenticación y manejo de errores.

La documentación de la API de AlterEstate se encuentra en constante evolución, lo que indica un compromiso continuo con la mejora y la adición de nuevas funcionalidades. Este informe se basa en la información disponible a la fecha de su elaboración, recopilada de la documentación oficial proporcionada por AlterEstate.

## 2. Visión General de la API de AlterEstate

La API de AlterEstate está diseñada para ser una herramienta integral para la industria inmobiliaria, permitiendo la automatización y optimización de diversas operaciones. Se estructura en torno a varias categorías principales de recursos, cada una con endpoints específicos para realizar operaciones de consulta y, en algunos casos, de envío de datos. La API utiliza el protocolo HTTP y responde con datos en formato JSON, lo que facilita su integración con una amplia gama de aplicaciones y sistemas.

### 2.1. Autenticación

Para acceder a la mayoría de los endpoints de la API, se requiere autenticación. AlterEstate utiliza un sistema de token (`aetoken` o `Authorization: Token`) para asegurar las solicitudes. Este token debe ser obtenido desde el panel de control de AlterEstate, específicamente en la sección de `Settings > Public API Token` (se requiere acceso de administrador). La seguridad de los datos se refuerza mediante la encriptación de datos tanto en tránsito como en reposo, y la API cumple con regulaciones como GDPR y CCPA.

### 2.2. Manejo de Errores y Límites de Tasa

La API proporciona códigos de estado HTTP estándar para indicar el resultado de las solicitudes. Los códigos comunes incluyen `200 OK` para solicitudes exitosas, `404 Not Found` para recursos no encontrados y `500 Internal Server Error` para errores del servidor. Además, la API impone límites de tasa para asegurar un uso justo y mantener el rendimiento del sistema, aunque los detalles específicos de estos límites no se detallan en la documentación revisada.

## 3. Endpoints de Propiedades

La API de Propiedades es fundamental para la gestión de datos relacionados con bienes inmuebles. Permite la búsqueda, filtrado y visualización detallada de propiedades. Aunque algunas funcionalidades como la adición, actualización y eliminación de propiedades, así como la gestión de medios y el análisis de mercado, están marcadas como 


próximamente (`Coming soon`), las capacidades de búsqueda y filtrado ya están disponibles. [alterestate_api_properties.md]

### 3.1. Listar Todas las Propiedades (`List All Properties`)

Este endpoint permite recuperar una lista de propiedades disponibles en la plataforma AlterEstate, integrándose con sistemas CRM inmobiliarios. Es una funcionalidad clave para mostrar listados de propiedades en sitios web o aplicaciones. [alterestate_api_list_all_properties.md]

*   **Endpoint:** `GET https://secure.alterestate.com/api/v1/properties/filter/`
*   **Autenticación:** Requiere un `aetoken` en los encabezados de la solicitud, el cual se obtiene del panel de control de AlterEstate.
*   **Parámetros de Consulta:** Permite un filtrado exhaustivo de propiedades basado en diversos criterios:
    *   **Ubicación:** `city` (ID de la ciudad), `city_name` (nombre de la ciudad), `sector` (ID del sector), `province` (ID de la provincia), `search` (cadena de búsqueda abierta para sector o vecindario).
    *   **Categoría y Tipo de Listado:** `listing_type` (1: Venta, 2: Alquiler), `category` (ID de la categoría de propiedad, como Apartamentos, Casas, Edificios, etc.), `condition` (9: Listo, 5: En Construcción).
    *   **Filtrado por Precio:** `currency` (moneda para la conversión interna, ej. USD, DOP), `value_min` (valor mínimo), `value_max` (valor máximo). Es importante destacar que el filtrado por precio se realiza en el backend, permitiendo pasar cualquier moneda soportada y el sistema realizará la conversión automáticamente. [alterestate_api_list_all_properties.md]
    *   **Características de la Propiedad:** `rooms` (mínimo de habitaciones), `rooms_min`, `rooms_max`, `bathrooms` (mínimo de baños), `bath_min`, `bath_max`, `parkings` (mínimo de estacionamientos), `parking_min`, `parking_max`, `area_min` (área mínima en m²), `area_max` (área máxima en m²).
    *   **Agente y Características Adicionales:** `agents` (UID del agente), `features` (lista de IDs de características, como Piscina, Gimnasio, etc.).
    *   **Ordenamiento:** `sort` (ej. `us_saleprice` para ascendente por precio de venta, `-us_saleprice` para descendente).
*   **Ejemplo de Respuesta:** La respuesta es un objeto JSON que incluye el conteo total de propiedades, enlaces para paginación (`next`, `previous`) y una lista de resultados (`results`), donde cada propiedad contiene detalles como `cid`, `uid`, `name`, `category`, `listing_type`, `sale_price`, `currency_sale`, `city`, `sector` y `short_description`.

### 3.2. Vista Detallada de Propiedad (`Property Detail View`)

Este endpoint permite recuperar una vista detallada de una propiedad específica, incluyendo información sobre el agente asignado, galería de fotos, amenidades y más. El `slug` de la propiedad, necesario para esta solicitud, se puede obtener del endpoint `List All Properties`. [alterestate_api_property_detail_view.md]

*   **Endpoint:** `GET https://secure.alterestate.com/api/v1/properties/view/property_slug/`
*   **Parámetros de Solicitud:** No requiere parámetros adicionales en la URL, solo el `property_slug` en la ruta.
*   **Ejemplo de Respuesta:** La respuesta JSON es un objeto detallado de la propiedad que incluye campos como `cid`, `uid`, `sector_id`, `city_id`, `name`, `slug`, `room`, `bathroom`, `parkinglot`, `sale_price`, `currency_sale`, `description`, `amenities`, `gallery_image`, `agents` (con detalles del agente), entre otros. Proporciona una visión completa de la propiedad para su visualización individual.




## 4. Endpoints de Desarrollos

La API de Desarrollos permite a los desarrolladores inmobiliarios gestionar y mostrar información sobre sus proyectos. Con esta API, es posible recuperar información sobre los edificios y las unidades dentro de un proyecto inmobiliario de AlterEstate, lo que facilita la conexión de la disponibilidad con otros sistemas de software. [alterestate_api_developments.md]

### 4.1. Obtener Edificios (`GET - Buildings`)

Este endpoint permite recuperar una lista de los "edificios" dentro de un proyecto inmobiliario. En AlterEstate, el término "edificio" es flexible y puede representar fases, bloques o cualquier otra división de la disponibilidad del proyecto, dependiendo de la configuración del mismo. [alterestate_api_get_buildings.md]

*   **Endpoint:** `GET https://secure.alterestate.com/api/v1/projects/buildings/project_slug/`
*   **Parámetros de Solicitud:** No requiere parámetros adicionales, solo el `project_slug` en la ruta.
*   **Ejemplo de Respuesta:** La respuesta es un array JSON que contiene objetos de edificios, cada uno con atributos como `id`, `uid`, `name`, `order`, `visible`, `updated`, `timestamp`, `company` y `project`.

### 4.2. Obtener Unidades (`GET - Units`)

Este endpoint permite recuperar una lista de unidades inmobiliarias de un proyecto específico. Proporciona detalles como el modelo de la propiedad, nombre, nivel del piso, área, número de habitaciones, baños, espacios de estacionamiento, estado, precio de venta y más. [alterestate_api_get_units.md]

*   **Endpoint:** `GET secure.alterestate.com/api/v1/properties/public/units/project_slug/`
*   **Parámetros de Solicitud:** No requiere parámetros adicionales, solo el `project_slug` en la ruta.
*   **Ejemplo de Respuesta:** La respuesta es un array JSON de objetos de unidades, cada uno con atributos como `order`, `project_model`, `name`, `total_floors`, `floor_level`, `property_area`, `room`, `bathroom`, `parkinglot`, `status` (con códigos numéricos para Disponible, Reservado, Vendido, Bloqueado), `sale_price`, `currency_sale`, `building`, `project_stage` y `layout` (URL al plano de la unidad).

## 5. Endpoints de Ubicaciones

La API de Ubicaciones se utiliza para recuperar datos geográficos como ciudades y sectores disponibles en AlterEstate. Esta funcionalidad es especialmente útil para formularios dinámicos, filtros de búsqueda y cualquier otra funcionalidad que requiera datos de ubicación. Esta API es de solo lectura y no requiere autenticación. [alterestate_api_locations.md]

### 5.1. Listar Ciudades

Permite recuperar una lista de ciudades por país.

*   **Endpoint:** `GET https://secure.alterestate.com/api/v1/cities/`
*   **Parámetros de Consulta:** `country` (ID del país, ej. 149 para República Dominicana).
*   **Ejemplo de Respuesta:** Un array JSON con objetos de ciudades, cada uno con `name`, `id` y `province` (con `name` e `id` de la provincia).

### 5.2. Listar Sectores

Permite recuperar una lista de sectores (vecindarios) dentro de una ciudad específica.

*   **Endpoint:** `GET /api/v1/sectors/`
*   **Parámetros de Consulta:** `city` (ID de la ciudad).
*   **Ejemplo de Respuesta:** Un array JSON con objetos de sectores, cada uno con `name`, `id`, `city` y `province`.





## 6. Endpoints de Leads

La API de Leads permite enviar prospectos (leads) directamente a una cuenta de AlterEstate. Esto es útil para conectar formularios, páginas de destino o cualquier otra fuente externa de captura de leads. [alterestate_api_leads.md]

*   **Endpoint:** `POST https://secure.alterestate.com/api/v1/leads/`
*   **Autenticación:** Requiere un token de autorización en el encabezado: `Authorization: Token your_api_key_here`.
*   **Cuerpo de la Solicitud:** Se debe enviar una carga útil JSON con los datos del lead. Los campos obligatorios son `full_name`, `phone` y `email`. Además, se pueden incluir campos opcionales para un mejor seguimiento y enrutamiento, como `property_uid`, parámetros UTM (`utm_source`, `utm_campaign`, etc.), `round_robin` (para asignación de leads), `related` (para asignar el lead a un usuario específico), `notes` y `via` (canal de origen).
*   **Manejo de Duplicados:** AlterEstate permite configurar si se aceptan o no contactos duplicados. Si no se permiten, y un contacto con el mismo teléfono o correo electrónico ya existe, no se creará un nuevo contacto o negocio, y se notificará al agente propietario del contacto existente.

## 7. Endpoints de Agentes

La API de Agentes permite recuperar una lista de todos los agentes activos de una compañía. [alterestate_api_agents.md]

*   **Endpoint:** `GET https://secure.alterestate.com/api/v1/agents/`
*   **Autenticación:** Requiere un `aetoken` en los encabezados de la solicitud.
*   **Ejemplo de Respuesta:** La respuesta es un array JSON que contiene objetos de agentes, cada uno con detalles como `id`, `uid`, `slug`, `first_name`, `last_name`, `full_name`, `email`, `phone`, `position`, `avatar`, `division`, `team`, `company`, `bio`, `properties` (número de propiedades) y `company_domain`.

## 8. Conclusión

La API de AlterEstate es una herramienta potente y bien documentada que ofrece una amplia gama de funcionalidades para la gestión de datos en el sector inmobiliario. Su diseño modular, con endpoints claramente definidos para propiedades, desarrollos, ubicaciones, leads y agentes, permite una integración flexible y escalable con sistemas externos. La autenticación basada en tokens, el manejo de errores estandarizado y la consideración de aspectos como el manejo de duplicados y la conversión de divisas en el backend, demuestran una plataforma madura y pensada para las necesidades del mercado inmobiliario.

Aunque algunas funcionalidades avanzadas como la gestión completa de propiedades (creación, actualización, eliminación) y el análisis de mercado aún están en desarrollo, las capacidades actuales de la API ya proporcionan un valor significativo para la automatización de procesos y la mejora de la interacción con el cliente. Se recomienda a los desarrolladores que consulten regularmente la documentación oficial para estar al tanto de las últimas actualizaciones y nuevas funcionalidades.

## 9. Referencias

*   [AlterEstate Developers Center - Overview](https://dev.alterestate.com/)
*   [AlterEstate Developers Center - Properties](https://dev.alterestate.com/properties)
*   [AlterEstate Developers Center - List All Properties](https://dev.alterestate.com/properties/list-all-properties)
*   [AlterEstate Developers Center - Property Detail View](https://dev.alterestate.com/properties/property-detail-view)
*   [AlterEstate Developers Center - Developments](https://dev.alterestate.com/developments)
*   [AlterEstate Developers Center - GET - Buildings](https://dev.alterestate.com/developments/get-buildings)
*   [AlterEstate Developers Center - GET - Units](https://dev.alterestate.com/developments/get-units)
*   [AlterEstate Developers Center - Locations](https://dev.alterestate.com/locations)
*   [AlterEstate Developers Center - Leads](https://dev.alterestate.com/leads)
*   [AlterEstate Developers Center - Agents](https://dev.alterestate.com/agents)


