# 🚨 ALERTA CRÍTICA DE SEGURIDAD - ACCIÓN INMEDIATA REQUERIDA

## ⚠️ PROBLEMA IDENTIFICADO
Las credenciales de WhatsApp fueron comprometidas al estar versionadas en Git:
- `instances/*/creds.json` - Credenciales de autenticación
- `instances/*/session*.json` - Tokens de sesión
- `instances/*/pre-key*.json` - Claves de cifrado
- `instances/*/app-state-sync*.json` - Estados de sincronización

## ✅ CORRECCIONES APLICADAS
1. **Actualizado .gitignore** - Protege archivos futuros
2. **Directorio auth movido** - Ahora usa `/tmp/whatsapp_auth` (fuera de VCS)
3. **Variable de entorno** - `WHATSAPP_AUTH_DIR` configurable

## 🔥 ACCIONES CRÍTICAS PENDIENTES (REALIZAR INMEDIATAMENTE)

### 1. PURGAR HISTORIAL GIT
```bash
# Remover archivos del índice
git rm -r --cached instances

# Purgar historial (usar BFG Repo-Cleaner o git filter-repo)
# ADVERTENCIA: Esto reescribe el historial completo
git filter-repo --path instances --invert-paths
```

### 2. ROTAR CREDENCIALES WHATSAPP
- Eliminar directorio `instances/` localmente
- Cerrar sesión en todos los dispositivos WhatsApp
- Re-autenticar para generar nuevas credenciales
- Verificar que las nuevas credenciales se almacenan en `/tmp/whatsapp_auth`

### 3. CONFIGURAR VARIABLES DE ENTORNO
```bash
export WHATSAPP_AUTH_DIR="/data/whatsapp_auth"  # O path seguro de tu elección
```

### 4. VERIFICACIONES DE SEGURIDAD
- [ ] Confirmar que `/tmp/whatsapp_auth` está fuera del repositorio
- [ ] Verificar que logs no muestran contenido de archivos JSON
- [ ] Asegurar que servidor web no sirve el directorio auth
- [ ] Revisar forks/clones del repositorio que puedan tener credenciales

## 🛡️ MEDIDAS PREVENTIVAS IMPLEMENTADAS
- Directorio auth configurable por variable de entorno
- .gitignore expandido con todos los patrones de Baileys
- Protección contra archivos .env, certificados, y logs

## ⚡ PRÓXIMOS PASOS
1. **INMEDIATO**: Purgar historial git y rotar credenciales
2. **CORTO PLAZO**: Auditar logs para verificar que no hay filtraciones
3. **MEDIANO PLAZO**: Implementar monitoreo de archivos sensibles

---
**PRIORIDAD: CRÍTICA** - Estas credenciales comprometen la seguridad de todas las conversaciones WhatsApp.