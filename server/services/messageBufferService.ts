import { storage } from '../storage';

interface BufferedMessage {
  content: string;
  timestamp: Date;
  messageId: string;
}

interface BufferData {
  messages: BufferedMessage[];
  timer: NodeJS.Timeout;
  userId: string;
  conversationId: string;
  onProcessCallback?: (combinedMessage: string) => Promise<void>;
}

export class MessageBufferService {
  private userBuffers = new Map<string, BufferData>();
  private processingQueue = new Map<string, boolean>();

  /**
   * Agrega un mensaje al buffer y reinicia el temporizador
   */
  async addMessageToBuffer(
    conversationId: string, 
    message: string, 
    messageId: string,
    userId: string,
    onProcessCallback?: (combinedMessage: string) => Promise<void>
  ) {
    console.log(`📥 [BUFFER] Adding message to buffer for conversation ${conversationId}: "${message}"`);
    
    // Obtener configuraciones del usuario
    const userSettings = await storage.getUserSettings(userId);
    const bufferEnabled = userSettings?.messageBufferEnabled ?? true;
    const bufferTime = userSettings?.messageBufferTime ?? 5; // default 5 segundos
    
    if (!bufferEnabled) {
      console.log(`⚡ [BUFFER] Buffer disabled for user ${userId}, processing immediately`);
      if (onProcessCallback) {
        await onProcessCallback(message);
      }
      return;
    }
    
    console.log(`⏱️ [BUFFER] Buffer enabled with ${bufferTime} seconds delay`);
    
    // Clear existing timer if exists
    const existing = this.userBuffers.get(conversationId);
    if (existing?.timer) {
      console.log(`🔄 [BUFFER] Clearing existing timer for conversation ${conversationId}`);
      clearTimeout(existing.timer);
    }

    // Add message to buffer
    const messages = existing?.messages || [];
    messages.push({
      content: message,
      timestamp: new Date(),
      messageId
    });

    console.log(`📊 [BUFFER] Total messages in buffer: ${messages.length}`);

    // Set new timer
    const timer = setTimeout(async () => {
      console.log(`⏰ [BUFFER] Timer expired for conversation ${conversationId}, processing buffered messages`);
      await this.processBufferedMessages(conversationId);
    }, bufferTime * 1000);

    this.userBuffers.set(conversationId, { 
      messages, 
      timer, 
      userId,
      conversationId,
      onProcessCallback: onProcessCallback || existing?.onProcessCallback
    });
  }

  /**
   * Procesa todos los mensajes en buffer cuando expira el temporizador
   */
  async processBufferedMessages(conversationId: string) {
    const buffer = this.userBuffers.get(conversationId);
    if (!buffer || this.processingQueue.get(conversationId)) {
      console.log(`⚠️ [BUFFER] Buffer not found or already processing for conversation ${conversationId}`);
      return;
    }

    // Mark as processing
    this.processingQueue.set(conversationId, true);
    console.log(`🔄 [BUFFER] Processing ${buffer.messages.length} buffered messages for conversation ${conversationId}`);

    try {
      // Combine all buffered messages
      const combinedMessage = buffer.messages
        .map(msg => msg.content)
        .join('\n');
      
      console.log(`📝 [BUFFER] Combined message: "${combinedMessage}"`);
      
      // Clear buffer
      this.userBuffers.delete(conversationId);
      
      // Process with callback if provided
      if (buffer.onProcessCallback) {
        await buffer.onProcessCallback(combinedMessage);
      }
      
      return combinedMessage;
    } catch (error) {
      console.error(`❌ [BUFFER] Error processing buffered messages for conversation ${conversationId}:`, error);
    } finally {
      // Mark as not processing
      this.processingQueue.delete(conversationId);
    }
  }


  hasBufferedMessages(conversationId: string): boolean {
    return this.userBuffers.has(conversationId);
  }

  clearBuffer(conversationId: string) {
    const buffer = this.userBuffers.get(conversationId);
    if (buffer?.timer) {
      clearTimeout(buffer.timer);
    }
    this.userBuffers.delete(conversationId);
  }

  /**
   * Humaniza las respuestas dividiéndolas en múltiples mensajes con intervalos
   */
  async humanizeResponse(
    response: string, 
    userId: string,
    sendCallback: (chunk: string) => Promise<void>
  ): Promise<void> {
    try {
      // Obtener configuraciones del usuario
      const userSettings = await storage.getUserSettings(userId);
      const humanizedEnabled = userSettings?.humanizedResponsesEnabled ?? true;
      const messagingInterval = userSettings?.messagingInterval ?? 3; // segundos entre mensajes
      const maxMessagesPerResponse = userSettings?.maxMessagesPerResponse ?? 4; // máximo 4 mensajes
      
      if (!humanizedEnabled || response.length <= 500) {
        console.log(`⚡ [HUMANIZE] Sending single message (humanization disabled or short message)`);
        await sendCallback(response);
        return;
      }

      console.log(`🤖 [HUMANIZE] Humanizing response of ${response.length} characters`);
      console.log(`⏱️ [HUMANIZE] Using ${messagingInterval}s interval, max ${maxMessagesPerResponse} messages`);

      // Dividir la respuesta en chunks inteligentes
      const chunks = this.splitIntoChunks(response, maxMessagesPerResponse);
      
      console.log(`📋 [HUMANIZE] Split response into ${chunks.length} chunks`);

      // Enviar cada chunk con intervalo
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        if (i > 0) {
          // Agregar delay antes de enviar (excepto el primer mensaje)
          console.log(`⏳ [HUMANIZE] Waiting ${messagingInterval}s before sending chunk ${i + 1}/${chunks.length}`);
          await this.delay(messagingInterval * 1000);
        }

        console.log(`📤 [HUMANIZE] Sending chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 50)}..."`);
        await sendCallback(chunk);
      }

      console.log(`✅ [HUMANIZE] Successfully sent ${chunks.length} humanized messages`);

    } catch (error) {
      console.error('❌ [HUMANIZE] Error humanizing response:', error);
      // Fallback: send original response
      await sendCallback(response);
    }
  }

  /**
   * Divide una respuesta larga en chunks inteligentes preservando información inmobiliaria
   */
  private splitIntoChunks(response: string, maxChunks: number): string[] {
    const chunks: string[] = [];
    
    // Si la respuesta es corta, enviarla como está
    if (response.length <= 500) {
      return [response];
    }

    // NUEVA LÓGICA: Detectar y preservar bloques de información inmobiliaria
    const preservedBlocks = this.identifyPropertyBlocks(response);
    
    if (preservedBlocks.length > 0) {
      console.log(`🏠 [CHUNK] Found ${preservedBlocks.length} property information blocks to preserve`);
      
      // Si tenemos bloques de propiedades, dividir respetando su integridad
      let currentChunk = '';
      let chunkCount = 0;
      
      for (const block of preservedBlocks) {
        // Si agregar este bloque haría el chunk demasiado largo, crear nuevo chunk
        if (currentChunk && (currentChunk.length + block.length) > 800) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            chunkCount++;
          }
          currentChunk = block;
        } else {
          currentChunk = currentChunk ? `${currentChunk}\n\n${block}` : block;
        }
        
        // Respetar el límite máximo de chunks
        if (chunkCount >= maxChunks - 1) {
          // Concatenar el resto en el último chunk
          const remainingBlocks = preservedBlocks.slice(preservedBlocks.indexOf(block) + 1);
          if (remainingBlocks.length > 0) {
            currentChunk = currentChunk + '\n\n' + remainingBlocks.join('\n\n');
          }
          break;
        }
      }
      
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      return chunks;
    }

    // LÓGICA ORIGINAL para mensajes sin información inmobiliaria
    // Dividir por párrafos primero (saltos de línea dobles)
    const paragraphs = response.split(/\n\s*\n/).filter(p => p.trim());
    
    if (paragraphs.length <= maxChunks) {
      // Si hay pocos párrafos, usar uno por chunk
      return paragraphs.map(p => p.trim());
    }

    // Si hay muchos párrafos, dividir por oraciones
    const sentences = response.split(/[.!?]+/).filter(s => s.trim());
    
    const targetChunkSize = Math.ceil(sentences.length / maxChunks);
    let currentChunk = '';
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;
      
      // Agregar oración al chunk actual
      currentChunk = currentChunk ? `${currentChunk}. ${sentence}` : sentence;
      
      // Si hemos alcanzado el tamaño objetivo o es la última oración
      if ((i + 1) % targetChunkSize === 0 || i === sentences.length - 1) {
        if (currentChunk) {
          chunks.push(currentChunk + (currentChunk.endsWith('.') ? '' : '.'));
          currentChunk = '';
        }
      }
      
      // No exceder el máximo de chunks
      if (chunks.length >= maxChunks) {
        break;
      }
    }
    
    // Si quedaron oraciones sin procesar, añadirlas al último chunk
    if (currentChunk && chunks.length < maxChunks) {
      chunks.push(currentChunk + (currentChunk.endsWith('.') ? '' : '.'));
    }
    
    return chunks;
  }

  /**
   * Identificar bloques de información inmobiliaria que deben mantenerse juntos
   */
  private identifyPropertyBlocks(response: string): string[] {
    const blocks: string[] = [];
    
    // Patrones para identificar información inmobiliaria completa
    const propertyPatterns = [
      // Propiedades numeradas con emoji (ej: "1. 🏠 *Casa en...")
      /\d+\.\s*[🏠🏡🏘️🏢🏰⛪🏛️]\s*[*"'`][^*"'`]+[*"'`][^]*?(?=\n\n\d+\.\s*[🏠🏡🏘️🏢🏰⛪🏛️]|\n\n\+|\n\n¿|$)/gm,
      
      // Detalles de propiedad con viñetas (- **Campo:** valor)
      /(?:^|\n)(?:-\s*\*\*[^*]+\*\*[^\n]+\n?)+/gm,
      
      // Bloques que inician con "Aquí tienes" o "Claro" seguidos de información
      /(?:Aquí tienes|Claro[^,]*,)[^]*?(?=\n\n(?:Aquí tienes|Claro|¿)|$)/gm,
      
      // Bloques de información inmobiliaria con URLs
      /[🏠🏡🏘️🏢🏰⛪🏛️][^]*?https:\/\/[^\s]+[^]*?(?=\n\n|$)/gm
    ];
    
    // Intentar con cada patrón
    for (const pattern of propertyPatterns) {
      const matches = response.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`🔍 [CHUNK] Found ${matches.length} property blocks with specific pattern`);
        return matches.map(match => match.trim()).filter(block => block.length > 0);
      }
    }
    
    // Fallback: Buscar párrafos con información inmobiliaria por palabras clave
    const paragraphs = response.split(/\n\s*\n/).filter(p => p.trim());
    const propertyKeywords = [
      'habitaciones?', 'baños?', 'estacionamientos?', 'área', 'm²', 'mt2',
      'precio', 'US\\$', 'RD\\$', 'venta', 'alquiler', 'amueblado',
      'Ver detalles:', 'https://', 'Autopista', 'Santo Domingo', 'Punta Cana',
      '\\*\\*[^*]+\\*\\*', // Cualquier cosa en negritas
      '🏠|🏡|🏘️|🏢|🏰|⛪|🏛️' // Emojis de propiedades
    ];
    
    const keywordPattern = new RegExp(propertyKeywords.join('|'), 'i');
    
    // Agrupar párrafos consecutivos que contengan información inmobiliaria
    let currentBlock = '';
    let foundKeywords = false;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const hasKeywords = keywordPattern.test(paragraph);
      
      if (hasKeywords) {
        currentBlock = currentBlock ? `${currentBlock}\n\n${paragraph}` : paragraph;
        foundKeywords = true;
      } else if (foundKeywords) {
        // Terminar bloque actual y guardarlo
        if (currentBlock.trim()) {
          blocks.push(currentBlock.trim());
        }
        currentBlock = '';
        foundKeywords = false;
        
        // Si no es inmobiliario, guardarlo como bloque separado
        if (paragraph.trim()) {
          blocks.push(paragraph.trim());
        }
      } else {
        // Párrafo regular sin información inmobiliaria
        if (paragraph.trim()) {
          blocks.push(paragraph.trim());
        }
      }
    }
    
    // Guardar el último bloque si queda
    if (currentBlock.trim()) {
      blocks.push(currentBlock.trim());
    }
    
    if (blocks.length > 0) {
      console.log(`🔍 [CHUNK] Found ${blocks.length} blocks (${blocks.filter(b => keywordPattern.test(b)).length} contain property info)`);
    }
    
    return blocks;
  }

  /**
   * Utilidad para agregar delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const messageBufferService = new MessageBufferService();
