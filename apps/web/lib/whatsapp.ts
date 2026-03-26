const WA_API_BASE = "https://graph.facebook.com/v22.0";

/**
 * Retrieves the WhatsApp API credentials from environment variables.
 * @throws {Error} If credentials are not configured.
 */
export function getWaCredentials() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("Missing WhatsApp API credentials (WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID)");
  }
  return { token, phoneNumberId };
}

/**
 * Check if WhatsApp credentials are configured
 */
export function isWaConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Send a text message to a WhatsApp user.
 *
 * @param to Recipient phone number (e.g., "6281234567890").
 * @param body The text content to send.
 */
export async function sendWaTextMessage(to: string, body: string): Promise<void> {
  const { token, phoneNumberId } = getWaCredentials();
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/[^0-9]/g, ""),
    type: "text",
    text: { preview_url: false, body },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to send WA message to ${to} — ${response.status} ${errorText}`);
    throw new Error(`Failed to send WhatsApp message: ${response.statusText}`);
  }

  console.log(`[WA] Message sent to ${to}`);
}

/**
 * Upload a file to the WhatsApp Media API.
 *
 * @param fileBuffer Raw file content as a Blob or Buffer.
 * @param mimeType MIME type (e.g., "application/pdf").
 * @param filename Display filename (e.g., "receipt.pdf").
 * @returns The WhatsApp media ID for the uploaded file.
 */
export async function uploadWaMedia(
  fileBuffer: Blob | Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const { token, phoneNumberId } = getWaCredentials();
  const url = `${WA_API_BASE}/${phoneNumberId}/media`;

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  
  if (fileBuffer instanceof Blob) {
    formData.append("file", fileBuffer, filename);
  } else {
    // Cast to any to bypass BlobPart strict typing for Buffer in Node environments
    formData.append("file", new Blob([fileBuffer as any], { type: mimeType }), filename);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // fetch automatically sets Content-Type for FormData
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to upload media — ${response.status} ${errorText}`);
    throw new Error(`Failed to upload WhatsApp media: ${response.statusText}`);
  }

  const responseData = await response.json();
  const mediaId = responseData.id;
  console.log(`[WA] Uploaded media: ${mediaId} (${filename})`);
  return mediaId;
}

/**
 * Send a document message to a WhatsApp user.
 *
 * @param to Recipient phone number.
 * @param mediaId WhatsApp media ID from `uploadWaMedia()`.
 * @param filename Display filename the recipient sees.
 * @param caption Optional caption text shown with the document.
 */
export async function sendWaDocumentMessage(
  to: string,
  mediaId: string,
  filename: string,
  caption: string = ""
): Promise<void> {
  const { token, phoneNumberId } = getWaCredentials();
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;

  const payload: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/[^0-9]/g, ""),
    type: "document",
    document: {
      id: mediaId,
      filename,
    },
  };

  if (caption) {
    payload.document.caption = caption;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to send document to ${to} — ${response.status} ${errorText}`);
    throw new Error(`Failed to send WhatsApp document: ${response.statusText}`);
  }

  console.log(`[WA] Document '${filename}' sent to ${to}`);
}
