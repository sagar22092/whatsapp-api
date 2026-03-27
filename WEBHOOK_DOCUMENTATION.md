```
WEBHOOK DOCUMENTATION - WhatsApp API
========================================

## Overview
After configuring a webhook URL in your session, your application will automatically receive 
POST requests for various WhatsApp events. This allows you to build real-time integrations 
with your WhatsApp sessions.

## Webhook Events

### 1. MESSAGE_RECEIVED
**Event Type:** `message.received`
**When:** A message is received on the WhatsApp session

**Payload:**
```json
{
  "event": "message.received",
  "timestamp": "2024-03-26T12:34:56.789Z",
  "sessionId": "session_id_here",
  "userId": "user_id_here",
  "signature": "webhook_signature_for_verification",
  "data": {
    "from": "1234567890",
    "message": "Hello, this is a message",
    "messageId": "message_key_id",
    "timestamp": "1711444496000",
    "type": "text"
  }
}
```

### 2. MESSAGE_SENT
**Event Type:** `message.sent`
**When:** A message is successfully sent through your API

**Payload:**
```json
{
  "event": "message.sent",
  "timestamp": "2024-03-26T12:34:56.789Z",
  "sessionId": "session_id_here",
  "userId": "user_id_here",
  "signature": "webhook_signature_for_verification",
  "data": {
    "to": "1234567890",
    "messageId": "message_id_generated",
    "timestamp": "2024-03-26T12:34:56.789Z",
    "status": "sent"
  }
}
```

### 3. SESSION_CONNECTED
**Event Type:** `session.connected`
**When:** WhatsApp session successfully connects/authenticates

**Payload:**
```json
{
  "event": "session.connected",
  "timestamp": "2024-03-26T12:34:56.789Z",
  "sessionId": "session_id_here",
  "userId": "user_id_here",
  "signature": "webhook_signature_for_verification",
  "data": {
    "phoneNumber": "1234567890@c.us",
    "name": "User Name",
    "status": "connected"
  }
}
```

### 4. SESSION_DISCONNECTED
**Event Type:** `session.disconnected`
**When:** WhatsApp session loses connection

**Payload:**
```json
{
  "event": "session.disconnected",
  "timestamp": "2024-03-26T12:34:56.789Z",
  "sessionId": "session_id_here",
  "userId": "user_id_here",
  "signature": "webhook_signature_for_verification",
  "data": {
    "reason": "network_error",
    "timestamp": "2024-03-26T12:34:56.789Z"
  }
}
```

### 5. SESSION_QR_READY
**Event Type:** `session.qr_ready`
**When:** QR code is generated and ready to scan

**Payload:**
```json
{
  "event": "session.qr_ready",
  "timestamp": "2024-03-26T12:34:56.789Z",
  "sessionId": "session_id_here",
  "userId": "user_id_here",
  "signature": "webhook_signature_for_verification",
  "data": {
    "qrCode": "data available",
    "status": "qr_ready"
  }
}
```

### 6. SESSION_RECONNECTING
**Event Type:** `session.reconnecting`
**When:** WhatsApp session is attempting to reconnect

**Payload:**
```json
{
  "event": "session.reconnecting",
  "timestamp": "2024-03-26T12:34:56.789Z",
  "sessionId": "session_id_here",
  "userId": "user_id_here",
  "signature": "webhook_signature_for_verification",
  "data": {
    "attempt": 1,
    "timestamp": "2024-03-26T12:34:56.789Z"
  }
}
```

### 7. SESSION_LOGGED_OUT
**Event Type:** `session.logged_out`
**When:** User logs out from the WhatsApp session

**Payload:**
```json
{
  "event": "session.logged_out",
  "timestamp": "2024-03-26T12:34:56.789Z",
  "sessionId": "session_id_here",
  "userId": "user_id_here",
  "signature": "webhook_signature_for_verification",
  "data": {
    "reason": "user_logout",
    "timestamp": "2024-03-26T12:34:56.789Z"
  }
}
```

## Common Fields

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event type identifier |
| `timestamp` | ISO 8601 | When the event occurred on server |
| `sessionId` | string | MongoDB session ID |
| `userId` | string | MongoDB user ID |
| `signature` | string | Security signature for verification |
| `data` | object | Event-specific payload |

## Webhook Configuration

### Setting Webhook URL
```bash
POST /api/session/{sessionId}/set-webhook

{
  "webhookUrl": "https://your-domain.com/webhook"
}
```

### Clearing Webhook URL
```bash
POST /api/session/{sessionId}/set-webhook

{
  "webhookUrl": ""
}
```

## Webhook Requirements

Your webhook endpoint must:

1. **Accept POST requests**
   - Content-Type: application/json
   - Timeout: 10 seconds max

2. **Validate the signature** (recommended)
   ```javascript
   // The X-Webhook-Signature header contains the signature
   // Compare it against your expected signature for security
   ```

3. **Return 2xx status code**
   - 200-299: Success (webhook delivery confirmed)
   - Other: Failure (will retry with exponential backoff)

4. **Handle retries**
   - Failed deliveries are retried up to 3 times
   - Retry delays: 1s, 2s, 4s (exponential backoff)

## Example Webhook Handler (Node.js/Express)

```javascript
app.post('/webhook', express.json(), async (req, res) => {
  try {
    const { event, data, sessionId } = req.body;

    switch(event) {
      case 'message.received':
        console.log(`Message from ${data.from}: ${data.message}`);
        // Handle incoming message
        break;

      case 'message.sent':
        console.log(`Message sent to ${data.to}`);
        // Update message status
        break;

      case 'session.connected':
        console.log(`Session connected: ${data.phoneNumber}`);
        // Session is ready
        break;

      case 'session.disconnected':
        console.log(`Session disconnected: ${data.reason}`);
        // Handle reconnection
        break;

      case 'session.logged_out':
        console.log(`Session logged out`);
        // Clean up session data
        break;
    }

    // Always return 200 to confirm receipt
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Return 2xx to prevent retries on your error
    res.status(200).json({ error: error.message });
  }
});
```

## Testing Webhooks

### Using ngrok
```bash
# Start ngrok tunnel
ngrok http 3000

# Configure webhook URL
https://abc123.ngrok.io/webhook
```

### Using RequestBin/Webhook.site
1. Go to https://webhook.site
2. Copy your unique URL
3. Configure it as your webhook URL
4. See all webhook events in real-time

## Best Practices

1. **Idempotency**: Handle duplicate events gracefully
   - Store event IDs to prevent double-processing
   - Webhook might be retried if it times out

2. **Async Processing**: Don't block webhook responses
   ```javascript
   // Queue event for processing
   await queue.add('process-webhook', { event, data });
   res.status(200).json({ queued: true });
   ```

3. **Logging**: Track all webhook events
   - Store successful deliveries
   - Log failed events for debugging
   - Set up alerts for errors

4. **Security**: Validate webhook signatures
   - Check X-Webhook-Signature header
   - Reject unsigned requests
   - Use HTTPS only

5. **Monitoring**: Set up monitoring
   - Alert on failed message delivery
   - Monitor session disconnections
   - Track reconnection patterns

## Troubleshooting

### Webhook Not Firing?
1. Check webhook URL is valid (https://)
2. Ensure session is properly connected
3. Check server logs for errors
4. Verify firewall allows outbound requests

### Webhook Timeout?
1. Webhook endpoint takes too long (>10s)
2. Queue messages for async processing
3. Return response immediately

### Missing Events?
1. Check session status is CONNECTED
2. Verify webhook URL is still configured
3. See server logs for dispatch errors

## FAQ

**Q: Will webhook events fire if I'm using the REST API?**
A: Yes, message sent/received events fire for both API usage and in-app usage.

**Q: How long are events queued if webhook is down?**
A: Events are not queued. If webhook fails after retries, it's logged but not queued.

**Q: Can I disable webhooks?**
A: Yes, set webhook URL to empty string (POST with `"webhookUrl": ""`).

**Q: What's the rate limit for webhooks?**
A: No rate limit. All events are sent in real-time.
```
