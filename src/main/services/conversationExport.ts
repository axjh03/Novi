import type { Conversation } from '../../shared/types';

/** Include attachment bytes so the saved conversation survives removal from Novi. */
export function conversationExport(conversation: Conversation, imageData: (id: string) => string) {
  return {
    ...conversation,
    messages: conversation.messages.map(message => ({
      ...message,
      ...(message.images?.length ? { images: message.images.map(image => ({ ...image, dataUrl: imageData(image.id) })) } : {}),
    })),
  };
}
