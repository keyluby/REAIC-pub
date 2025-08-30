export class MessageBufferService {
  private userBuffers = new Map<string, { messages: string[]; timer: NodeJS.Timeout }>();
  private processingQueue = new Map<string, boolean>();

  addMessageToBuffer(conversationId: string, message: string, bufferTime: number = 10) {
    // Clear existing timer if exists
    const existing = this.userBuffers.get(conversationId);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    // Add message to buffer
    const messages = existing?.messages || [];
    messages.push(message);

    // Set new timer
    const timer = setTimeout(() => {
      this.processBufferedMessages(conversationId);
    }, bufferTime * 1000);

    this.userBuffers.set(conversationId, { messages, timer });
  }

  async processBufferedMessages(conversationId: string) {
    const buffer = this.userBuffers.get(conversationId);
    if (!buffer || this.processingQueue.get(conversationId)) {
      return;
    }

    // Mark as processing
    this.processingQueue.set(conversationId, true);

    try {
      // Combine all buffered messages
      const combinedMessage = buffer.messages.join('\n');
      
      // Clear buffer
      this.userBuffers.delete(conversationId);
      
      // Return combined message for AI processing
      return combinedMessage;
    } finally {
      // Mark as not processing
      this.processingQueue.delete(conversationId);
    }
  }

  humanizeResponse(response: string, maxChunkSize: number = 160): {
    chunks: string[];
    delays: number[];
  } {
    if (!response) {
      return { chunks: [], delays: [] };
    }

    const chunks: string[] = [];
    const delays: number[] = [];
    
    // Split by sentences first
    const sentences = response.split(/[.!?]+/).filter(s => s.trim());
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;
      
      // If adding this sentence would exceed chunk size, finalize current chunk
      if (currentChunk && (currentChunk + '. ' + trimmedSentence).length > maxChunkSize) {
        chunks.push(currentChunk.trim() + '.');
        currentChunk = trimmedSentence;
      } else {
        currentChunk = currentChunk ? currentChunk + '. ' + trimmedSentence : trimmedSentence;
      }
    }
    
    // Add remaining chunk
    if (currentChunk) {
      chunks.push(currentChunk.trim() + (currentChunk.endsWith('.') ? '' : '.'));
    }
    
    // Calculate delays based on chunk length
    for (const chunk of chunks) {
      const baseDelay = 1000; // 1 second minimum
      const charDelay = chunk.length * 30; // 30ms per character
      delays.push(Math.min(baseDelay + charDelay, 5000)); // max 5 seconds
    }
    
    return { chunks, delays };
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
}

export const messageBufferService = new MessageBufferService();
